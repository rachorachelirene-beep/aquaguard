from __future__ import annotations

import unittest
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from detector.weather_service import (
    CURRENT_FIELDS,
    HOURLY_FIELDS,
    NEUTRAL_FLOOD_RISK,
    WeatherService,
    WeatherServiceError,
    build_open_meteo_url,
    map_open_meteo_to_weather_reading,
)


def provider_response() -> dict:
    return {
        "current": {
            "time": "2026-08-08T12:30",
            "temperature_2m": 29.4,
            "precipitation": 0.8,
            "rain": 0.7,
            "weather_code": 61,
            "wind_speed_10m": 14.2,
        },
        "hourly": {
            "time": [
                "2026-08-08T06:00",
                "2026-08-08T07:00",
                "2026-08-08T08:00",
                "2026-08-08T09:00",
                "2026-08-08T10:00",
                "2026-08-08T11:00",
                "2026-08-08T12:00",
            ],
            "precipitation_probability": [
                10,
                20,
                30,
                40,
                50,
                60,
                70,
            ],
            "precipitation": [
                0.1,
                0.2,
                0.3,
                0.4,
                0.5,
                0.6,
                0.7,
            ],
            "rain": [
                0.1,
                0.2,
                0.3,
                0.4,
                0.5,
                0.6,
                0.7,
            ],
        },
    }


class FakeQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.inserted = None

    def select(self, _columns):
        return self

    def insert(self, payload):
        self.inserted = payload
        return self

    def execute(self):
        if self.table_name == "stations":
            return SimpleNamespace(data=self.client.stations)

        self.client.weather_inserts.append(self.inserted)
        return SimpleNamespace(data=[self.inserted])


class FakeSupabase:
    def __init__(self):
        self.stations = [
            {
                "id": 7,
                "name": "Configured station",
                "latitude": 14.5,
                "longitude": 121.0,
            },
            {
                "id": 8,
                "name": "Unconfigured station",
                "latitude": None,
                "longitude": None,
            },
        ]
        self.weather_inserts = []

    def table(self, table_name):
        return FakeQuery(self, table_name)


class WeatherServiceTests(unittest.TestCase):
    def test_open_meteo_request_contains_required_parameters(self):
        query = parse_qs(
            urlparse(
                build_open_meteo_url(14.5, 121.0)
            ).query
        )

        self.assertEqual(query["timezone"], ["Asia/Manila"])
        self.assertEqual(query["past_hours"], ["6"])
        self.assertEqual(query["forecast_hours"], ["1"])
        self.assertEqual(
            set(query["current"][0].split(",")),
            set(CURRENT_FIELDS),
        )
        self.assertEqual(
            set(query["hourly"][0].split(",")),
            set(HOURLY_FIELDS),
        )

    def test_response_maps_to_existing_weather_columns(self):
        payload = map_open_meteo_to_weather_reading(
            provider_response(),
            station_id=7,
            recorded_at="2026-08-08T04:30:00+00:00",
        )

        self.assertEqual(
            set(payload),
            {
                "station_id",
                "temperature",
                "precipitation",
                "rain_1h",
                "rain_6h",
                "wind_speed",
                "weather_code",
                "condition_text",
                "flood_risk",
                "recorded_at",
            },
        )
        self.assertEqual(payload["temperature"], 29.4)
        self.assertEqual(payload["rain_1h"], 0.7)
        self.assertEqual(payload["rain_6h"], 2.7)
        self.assertEqual(payload["condition_text"], "Slight rain")
        self.assertEqual(payload["flood_risk"], NEUTRAL_FLOOD_RISK)

    def test_sync_stores_configured_station_and_skips_missing_coordinates(self):
        client = FakeSupabase()
        service = WeatherService(
            client,
            fetcher=lambda _lat, _lon, _timeout: provider_response(),
        )

        service.sync_once()

        self.assertEqual(len(client.weather_inserts), 1)
        self.assertEqual(
            client.weather_inserts[0]["station_id"],
            7,
        )
        self.assertEqual(service.status()["stations_synced"], 1)
        self.assertEqual(service.status()["stations_skipped"], 1)
        self.assertIsNone(service.status()["last_error"])

    def test_invalid_provider_response_is_rejected(self):
        with self.assertRaises(WeatherServiceError):
            map_open_meteo_to_weather_reading(
                {"current": {}, "hourly": {}},
                station_id=7,
            )


if __name__ == "__main__":
    unittest.main()
