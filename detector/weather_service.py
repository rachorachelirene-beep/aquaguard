"""Open-Meteo synchronization for AquaGuard monitoring stations.

This module deliberately owns weather fetching, response parsing, and Supabase
storage so camera capture and YOLO processing remain independent.  The weather
worker is a process-level singleton; browser requests never trigger provider
calls.
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


LOGGER = logging.getLogger(__name__)

OPEN_METEO_FORECAST_URL = (
    "https://api.open-meteo.com/v1/forecast"
)
OPEN_METEO_TIMEZONE = "Asia/Manila"
DEFAULT_SYNC_INTERVAL_SECONDS = 600
DEFAULT_REQUEST_TIMEOUT_SECONDS = 15.0

CURRENT_FIELDS = (
    "temperature_2m",
    "precipitation",
    "rain",
    "weather_code",
    "wind_speed_10m",
)

HOURLY_FIELDS = (
    "precipitation_probability",
    "precipitation",
    "rain",
)

# AquaGuard does not yet have a validated combined weather + YOLO risk model.
# Keep the required database field neutral rather than presenting an arbitrary
# rainfall formula as a scientifically validated flood prediction.
NEUTRAL_FLOOD_RISK = 0.0


class WeatherServiceError(RuntimeError):
    """Raised when provider data cannot be safely stored."""


def weather_code_to_condition(value: Any) -> str:
    """Convert a WMO weather interpretation code to a readable label."""

    try:
        code = int(value)
    except (TypeError, ValueError):
        return "Unknown weather conditions"

    labels = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snowfall",
        73: "Moderate snowfall",
        75: "Heavy snowfall",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }

    return labels.get(
        code,
        "Unknown weather conditions",
    )


def _required_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool):
        raise WeatherServiceError(
            f"Open-Meteo field {field_name} is not numeric."
        )

    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise WeatherServiceError(
            f"Open-Meteo field {field_name} is missing or invalid."
        ) from error

    if not math.isfinite(number):
        raise WeatherServiceError(
            f"Open-Meteo field {field_name} is not finite."
        )

    return number


def _valid_coordinate(
    value: Any,
    minimum: float,
    maximum: float,
) -> float | None:
    if value is None or value == "" or isinstance(value, bool):
        return None

    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(coordinate):
        return None

    if not minimum <= coordinate <= maximum:
        return None

    return coordinate


def normalize_station_coordinates(
    latitude: Any,
    longitude: Any,
) -> tuple[float, float] | None:
    """Return a valid coordinate pair or ``None`` for an unusable station."""

    parsed_latitude = _valid_coordinate(
        latitude,
        -90.0,
        90.0,
    )
    parsed_longitude = _valid_coordinate(
        longitude,
        -180.0,
        180.0,
    )

    if parsed_latitude is None or parsed_longitude is None:
        return None

    return parsed_latitude, parsed_longitude


def build_open_meteo_url(
    latitude: float,
    longitude: float,
) -> str:
    """Build the keyless Open-Meteo forecast request used by AquaGuard."""

    coordinates = normalize_station_coordinates(
        latitude,
        longitude,
    )

    if coordinates is None:
        raise ValueError(
            "Latitude or longitude is outside the valid range."
        )

    parsed_latitude, parsed_longitude = coordinates

    parameters = {
        "latitude": parsed_latitude,
        "longitude": parsed_longitude,
        "current": ",".join(CURRENT_FIELDS),
        "hourly": ",".join(HOURLY_FIELDS),
        "timezone": OPEN_METEO_TIMEZONE,
        "past_hours": 6,
        "forecast_hours": 1,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }

    return f"{OPEN_METEO_FORECAST_URL}?{urlencode(parameters)}"


def fetch_open_meteo(
    latitude: float,
    longitude: float,
    timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Fetch one station's weather response with a bounded network timeout."""

    request = Request(
        build_open_meteo_url(latitude, longitude),
        headers={
            "Accept": "application/json",
            "User-Agent": "AquaGuard-Weather-Service/1.0",
        },
    )

    try:
        with urlopen(  # noqa: S310 - URL is the fixed Open-Meteo endpoint.
            request,
            timeout=max(1.0, float(timeout_seconds)),
        ) as response:
            body = response.read()
    except HTTPError as error:
        raise WeatherServiceError(
            f"Open-Meteo returned HTTP {error.code}."
        ) from error
    except (TimeoutError, URLError) as error:
        raise WeatherServiceError(
            "Open-Meteo request timed out or the network is unavailable."
        ) from error

    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WeatherServiceError(
            "Open-Meteo returned invalid JSON."
        ) from error

    if not isinstance(payload, dict):
        raise WeatherServiceError(
            "Open-Meteo returned an unexpected response."
        )

    if payload.get("error"):
        raise WeatherServiceError(
            "Open-Meteo rejected the weather request."
        )

    return payload


def _parse_provider_time(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise WeatherServiceError(
            "Open-Meteo current time is missing."
        )

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise WeatherServiceError(
            "Open-Meteo returned an invalid timestamp."
        ) from error

    # Both current and hourly timestamps use the requested Asia/Manila local
    # time. Removing a possible offset keeps comparisons consistent without
    # requiring the host OS to ship timezone database files.
    return parsed.replace(tzinfo=None)


def _hourly_series(
    hourly: dict[str, Any],
    field_name: str,
    expected_length: int,
) -> list[Any]:
    values = hourly.get(field_name)

    if not isinstance(values, list):
        raise WeatherServiceError(
            f"Open-Meteo hourly field {field_name} is missing."
        )

    if len(values) != expected_length:
        raise WeatherServiceError(
            f"Open-Meteo hourly field {field_name} has an invalid length."
        )

    return values


def _rainfall_from_hourly(
    hourly: dict[str, Any],
    current_time: datetime,
    current_rain: float,
) -> tuple[float, float]:
    raw_times = hourly.get("time")

    if not isinstance(raw_times, list) or not raw_times:
        raise WeatherServiceError(
            "Open-Meteo hourly timestamps are missing."
        )

    rain_values = _hourly_series(
        hourly,
        "rain",
        len(raw_times),
    )

    # These fields are requested and validated even though the existing
    # weather_readings schema has no destination columns for them.
    _hourly_series(
        hourly,
        "precipitation",
        len(raw_times),
    )
    _hourly_series(
        hourly,
        "precipitation_probability",
        len(raw_times),
    )

    eligible_indexes: list[int] = []

    for index, raw_time in enumerate(raw_times):
        hourly_time = _parse_provider_time(raw_time)

        if hourly_time <= current_time:
            eligible_indexes.append(index)

    if not eligible_indexes:
        return current_rain, current_rain

    relevant_indexes = eligible_indexes[-6:]
    relevant_rain = [
        _required_number(
            rain_values[index],
            f"hourly.rain[{index}]",
        )
        for index in relevant_indexes
    ]

    rain_one_hour = relevant_rain[-1]
    rain_six_hours = round(sum(relevant_rain), 3)

    return rain_one_hour, rain_six_hours


def map_open_meteo_to_weather_reading(
    provider_payload: dict[str, Any],
    station_id: Any,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    """Map a validated provider response to existing weather table columns."""

    current = provider_payload.get("current")
    hourly = provider_payload.get("hourly")

    if not isinstance(current, dict) or not isinstance(hourly, dict):
        raise WeatherServiceError(
            "Open-Meteo response is missing current or hourly weather data."
        )

    current_time = _parse_provider_time(
        current.get("time")
    )
    temperature = _required_number(
        current.get("temperature_2m"),
        "current.temperature_2m",
    )
    precipitation = _required_number(
        current.get("precipitation"),
        "current.precipitation",
    )
    current_rain = _required_number(
        current.get("rain"),
        "current.rain",
    )
    wind_speed = _required_number(
        current.get("wind_speed_10m"),
        "current.wind_speed_10m",
    )
    weather_code_number = _required_number(
        current.get("weather_code"),
        "current.weather_code",
    )

    if not weather_code_number.is_integer():
        raise WeatherServiceError(
            "Open-Meteo weather code is invalid."
        )

    weather_code = int(weather_code_number)
    rain_one_hour, rain_six_hours = (
        _rainfall_from_hourly(
            hourly,
            current_time,
            current_rain,
        )
    )

    reading_time = recorded_at or datetime.now(
        timezone.utc
    ).isoformat()

    return {
        "station_id": station_id,
        "temperature": temperature,
        "precipitation": precipitation,
        "rain_1h": rain_one_hour,
        "rain_6h": rain_six_hours,
        "wind_speed": wind_speed,
        "weather_code": weather_code,
        "condition_text": weather_code_to_condition(
            weather_code
        ),
        "flood_risk": NEUTRAL_FLOOD_RISK,
        "recorded_at": reading_time,
    }


WeatherFetcher = Callable[
    [float, float, float],
    dict[str, Any],
]


class WeatherService:
    """Periodically synchronize station weather without blocking the camera."""

    def __init__(
        self,
        supabase_client: Any,
        interval_seconds: int = DEFAULT_SYNC_INTERVAL_SECONDS,
        request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS,
        fetcher: WeatherFetcher = fetch_open_meteo,
    ) -> None:
        self._supabase = supabase_client
        self._interval_seconds = max(
            60,
            int(interval_seconds),
        )
        self._request_timeout_seconds = max(
            1.0,
            float(request_timeout_seconds),
        )
        self._fetcher = fetcher
        self._stop_event = threading.Event()
        self._state_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._last_attempt_at: str | None = None
        self._last_successful_sync: str | None = None
        self._last_error: str | None = None
        self._stations_synced = 0
        self._stations_skipped = 0

    @property
    def is_running(self) -> bool:
        return bool(
            self._thread and self._thread.is_alive()
        )

    def start(self) -> bool:
        if self.is_running:
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="AquaGuardWeatherSync",
            daemon=True,
        )
        self._thread.start()

        return True

    def stop(self) -> None:
        self._stop_event.set()

    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return {
                "running": self.is_running,
                "last_attempt_at": self._last_attempt_at,
                "last_successful_sync": (
                    self._last_successful_sync
                ),
                "last_error": self._last_error,
                "sync_interval_seconds": (
                    self._interval_seconds
                ),
                "stations_synced": self._stations_synced,
                "stations_skipped": self._stations_skipped,
            }

    def _set_terminal_state(
        self,
        *,
        error: str | None,
        synced: int,
        skipped: int,
        successful: bool,
    ) -> None:
        with self._state_lock:
            self._last_error = error
            self._stations_synced = synced
            self._stations_skipped = skipped

            if successful:
                self._last_successful_sync = (
                    datetime.now(timezone.utc).isoformat()
                )

    def sync_once(self) -> None:
        with self._state_lock:
            self._last_attempt_at = datetime.now(
                timezone.utc
            ).isoformat()

        try:
            response = (
                self._supabase.table("stations")
                .select("id,name,latitude,longitude")
                .execute()
            )
            stations = getattr(response, "data", None)

            if not isinstance(stations, list):
                raise WeatherServiceError(
                    "Supabase returned an invalid stations response."
                )
        except Exception as error:
            LOGGER.error(
                "Weather sync could not load stations: %s",
                error,
            )
            self._set_terminal_state(
                error="Unable to load stations for weather sync.",
                synced=0,
                skipped=0,
                successful=False,
            )
            return

        synced = 0
        skipped = 0
        failed = 0

        for station in stations:
            if not isinstance(station, dict):
                skipped += 1
                continue

            station_id = station.get("id")
            coordinates = normalize_station_coordinates(
                station.get("latitude"),
                station.get("longitude"),
            )

            if station_id is None or coordinates is None:
                skipped += 1
                continue

            latitude, longitude = coordinates

            try:
                provider_payload = self._fetcher(
                    latitude,
                    longitude,
                    self._request_timeout_seconds,
                )
                weather_reading = (
                    map_open_meteo_to_weather_reading(
                        provider_payload,
                        station_id,
                    )
                )

                (
                    self._supabase.table("weather_readings")
                    .insert(weather_reading)
                    .execute()
                )
                synced += 1
            except Exception as error:
                failed += 1
                LOGGER.error(
                    "Weather sync failed for station %s: %s",
                    station_id,
                    error,
                )

        if failed:
            self._set_terminal_state(
                error=(
                    f"Weather sync failed for {failed} "
                    "station(s)."
                ),
                synced=synced,
                skipped=skipped,
                successful=False,
            )
        else:
            self._set_terminal_state(
                error=None,
                synced=synced,
                skipped=skipped,
                successful=True,
            )

        LOGGER.info(
            "Weather sync complete: synced=%s skipped=%s failed=%s",
            synced,
            skipped,
            failed,
        )

    def _run(self) -> None:
        while not self._stop_event.is_set():
            started_at = time.monotonic()
            self.sync_once()
            elapsed = time.monotonic() - started_at
            delay = max(
                1.0,
                self._interval_seconds - elapsed,
            )

            if self._stop_event.wait(delay):
                break


_service_lock = threading.Lock()
_service_instance: WeatherService | None = None


def start_weather_service(
    supabase_client: Any,
    interval_seconds: int = DEFAULT_SYNC_INTERVAL_SECONDS,
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> WeatherService:
    """Start or return the process's single weather synchronization worker."""

    global _service_instance

    with _service_lock:
        if (
            _service_instance is not None
            and _service_instance.is_running
        ):
            return _service_instance

        _service_instance = WeatherService(
            supabase_client=supabase_client,
            interval_seconds=interval_seconds,
            request_timeout_seconds=request_timeout_seconds,
        )
        _service_instance.start()

        return _service_instance


def get_weather_service_status() -> dict[str, Any]:
    """Return safe operational state; never includes credentials or URLs."""

    with _service_lock:
        if _service_instance is None:
            return {
                "running": False,
                "last_attempt_at": None,
                "last_successful_sync": None,
                "last_error": None,
                "sync_interval_seconds": None,
                "stations_synced": 0,
                "stations_skipped": 0,
            }

        return _service_instance.status()
