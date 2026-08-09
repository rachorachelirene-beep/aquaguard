from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from supabase import Client, create_client
from ultralytics import YOLO


# =========================================================
# Environment configuration
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

try:
    from .gauge import (  # type: ignore[import-not-found]  # noqa: E402
        CRITICAL_LEVEL_M,
        GAUGE_ENABLED,
        GAUGE_LABEL_INTERVAL_M,
        GAUGE_POINTS,
        GAUGE_TICK_INTERVAL_M,
        MAX_LEVEL_M,
        MIN_LEVEL_M,
        NORMAL_LEVEL_M,
        WARNING_LEVEL_M,
        WATERLINE_ROW_COVERAGE,
        calculate_waterline,
        draw_measurement_gauge,
        level_to_y,
        resolve_gauge_points as resolve_configured_gauge_points,
        serialize_gauge_points,
        waterline_to_level,
    )
except ImportError:
    from gauge import (  # noqa: E402
        CRITICAL_LEVEL_M,
        GAUGE_ENABLED,
        GAUGE_LABEL_INTERVAL_M,
        GAUGE_POINTS,
        GAUGE_TICK_INTERVAL_M,
        MAX_LEVEL_M,
        MIN_LEVEL_M,
        NORMAL_LEVEL_M,
        WARNING_LEVEL_M,
        WATERLINE_ROW_COVERAGE,
        calculate_waterline,
        draw_measurement_gauge,
        level_to_y,
        resolve_gauge_points as resolve_configured_gauge_points,
        serialize_gauge_points,
        waterline_to_level,
    )

try:
    from .weather_service import (  # type: ignore[import-not-found]  # noqa: E402
        get_weather_service_status,
        start_weather_service,
    )
except ImportError:
    from weather_service import (  # noqa: E402
        get_weather_service_status,
        start_weather_service,
    )

try:
    from .flood_risk import (  # type: ignore[import-not-found]  # noqa: E402
        calculate_combined_flood_risk,
        not_assessed_flood_risk,
    )
except ImportError:
    from flood_risk import (  # noqa: E402
        calculate_combined_flood_risk,
        not_assessed_flood_risk,
    )

try:
    from .admin_auth import (  # type: ignore[import-not-found]  # noqa: E402
        AdminAuthorizationError,
        authorize_active_admin,
    )
    from .camera_config import (  # type: ignore[import-not-found]  # noqa: E402
        CONFIGURATION_ENVIRONMENT,
        CONFIGURATION_RUNTIME,
        MAX_WEBCAM_INDEX,
        MIN_WEBCAM_INDEX,
        SOURCE_RTSP,
        SOURCE_USB,
        CameraConfigError,
        CameraConfigPersistenceError,
        CameraConfigStore,
        build_rtsp_url as build_camera_rtsp_url,
        prepare_camera_config,
        public_camera_config,
        resolve_camera_configuration,
        validate_camera_config,
    )
except ImportError:
    from admin_auth import (  # noqa: E402
        AdminAuthorizationError,
        authorize_active_admin,
    )
    from camera_config import (  # noqa: E402
        CONFIGURATION_ENVIRONMENT,
        CONFIGURATION_RUNTIME,
        MAX_WEBCAM_INDEX,
        MIN_WEBCAM_INDEX,
        SOURCE_RTSP,
        SOURCE_USB,
        CameraConfigError,
        CameraConfigPersistenceError,
        CameraConfigStore,
        build_rtsp_url as build_camera_rtsp_url,
        prepare_camera_config,
        public_camera_config,
        resolve_camera_configuration,
        validate_camera_config,
    )


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


CAMERA_FALLBACK_TO_WEBCAM = env_bool(
    "CAMERA_FALLBACK_TO_WEBCAM",
    True,
)

CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "1280"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "720"))
CAMERA_FPS = int(os.getenv("CAMERA_FPS", "30"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "80"))
STREAM_FPS = max(1, int(os.getenv("STREAM_FPS", "12")))
RTSP_FRAME_SKIP = max(0, int(os.getenv("RTSP_FRAME_SKIP", "2")))

PROCESSING_WIDTH = int(os.getenv("PROCESSING_WIDTH", str(CAMERA_WIDTH)))
PROCESSING_HEIGHT = int(os.getenv("PROCESSING_HEIGHT", str(CAMERA_HEIGHT)))
OPENCV_THREADS = max(1, int(os.getenv("OPENCV_THREADS", "1")))

FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))

TRUSTED_FRONTEND_ORIGINS = (
    "https://aquaguard-live.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)

YOLO_ENABLED = env_bool("YOLO_ENABLED", True)

YOLO_MODEL_PATH = os.getenv(
    "YOLO_MODEL_PATH",
    "models/flood_best.pt",
).strip()

YOLO_CONFIDENCE = float(
    os.getenv("YOLO_CONFIDENCE", "0.35")
)

YOLO_IMAGE_SIZE = max(
    160,
    int(os.getenv("YOLO_IMAGE_SIZE", "416")),
)

YOLO_FRAME_INTERVAL = max(
    1,
    int(os.getenv("YOLO_FRAME_INTERVAL", "3")),
)

YOLO_MAX_DETECTIONS = max(
    1,
    int(os.getenv("YOLO_MAX_DETECTIONS", "3")),
)

YOLO_DEVICE = os.getenv("YOLO_DEVICE", "cpu").strip()

DEFAULT_STATION_ID = int(
    os.getenv("DEFAULT_STATION_ID", "1")
)

SUPABASE_WRITE_INTERVAL = max(
    1,
    int(os.getenv("SUPABASE_WRITE_INTERVAL", "5")),
)

ALERT_COOLDOWN_SECONDS = max(
    30,
    int(os.getenv("ALERT_COOLDOWN_SECONDS", "300")),
)

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "",
).strip()

SUPABASE_SECRET_KEY = (
    os.getenv("SUPABASE_SECRET_KEY", "").strip()
    or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "",
    ).strip()
)

WEATHER_ENABLED = env_bool("WEATHER_ENABLED", True)

WEATHER_SYNC_INTERVAL_SECONDS = max(
    60,
    int(
        os.getenv(
            "WEATHER_SYNC_INTERVAL_SECONDS",
            "600",
        )
    ),
)

WEATHER_REQUEST_TIMEOUT_SECONDS = max(
    1.0,
    float(
        os.getenv(
            "WEATHER_REQUEST_TIMEOUT_SECONDS",
            "15",
        )
    ),
)

# Supabase station/weather context is refreshed in an existing background
# database-write worker. Risk calculations themselves never perform I/O.
RISK_CONTEXT_REFRESH_SECONDS = 60.0
SSE_HEARTBEAT_SECONDS = 20.0

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"
    "fflags;nobuffer|"
    "flags;low_delay|"
    "max_delay;0"
)

cv2.setNumThreads(OPENCV_THREADS)

CAMERA_CONFIG_PATH = BASE_DIR / "data" / "camera_config.json"
camera_config_store = CameraConfigStore(CAMERA_CONFIG_PATH)
(
    initial_camera_config,
    initial_camera_configuration_source,
    initial_camera_configuration_error,
) = resolve_camera_configuration(camera_config_store, os.environ)


# =========================================================
# Flask application
# =========================================================

app = Flask(__name__)
CORS(
    app,
    origins=TRUSTED_FRONTEND_ORIGINS,
    methods=("GET", "POST", "PUT", "OPTIONS"),
    allow_headers=("Authorization", "Content-Type"),
    supports_credentials=False,
    allow_private_network=True,
    always_send=False,
    send_wildcard=False,
    vary_header=True,
    max_age=600,
)


@app.after_request
def prevent_camera_management_caching(response):
    if request.path in {
        "/camera_config",
        "/camera_config/test",
        "/camera_devices",
    }:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"

    return response


# =========================================================
# Shared state
# =========================================================

frame_lock = threading.Lock()
state_lock = threading.Lock()
station_lock = threading.Lock()
risk_context_lock = threading.Lock()
camera_config_lock = threading.RLock()
capture_thread_lock = threading.Lock()
camera_agent_initialization_lock = threading.Lock()
detection_condition = threading.Condition()

latest_jpeg: bytes | None = None
latest_camera_frame: np.ndarray | None = None
latest_frame_at: str | None = None
latest_water_mask: np.ndarray | None = None

camera_connected = False
camera_error: str | None = None
active_camera_source: str | None = None
camera_reconnecting = False
camera_config = initial_camera_config
camera_configuration_source = initial_camera_configuration_source
camera_configuration_error = initial_camera_configuration_error
camera_config_generation = 0

capture_thread: threading.Thread | None = None
camera_agent_initialized = False
stop_event = threading.Event()
camera_reconnect_event = threading.Event()

yolo_model: YOLO | None = None
yolo_error: str | None = None

supabase: Client | None = None
supabase_error: str | None = None

alert_lock = threading.Lock()
last_alert_times: dict[tuple[int, str], float] = {}

risk_context_by_station: dict[str, dict] = {}
risk_context_last_attempt: dict[str, float] = {}
combined_risk_by_station: dict[str, dict] = {}
detection_version = 0

active_station_id = DEFAULT_STATION_ID

latest_detection = {
    "station_id": DEFAULT_STATION_ID,
    "camera_connected": False,
    "detection_enabled": YOLO_ENABLED,
    "detected": False,
    "status": "waiting",
    "level_m": None,
    "water_level": None,
    "confidence": None,
    "water_coverage": None,
    "flood_risk": None,
    "combined_risk": not_assessed_flood_risk(
        "Waiting for a usable monitoring detection."
    ),
    "waterline_y": None,
    "frame_width": None,
    "frame_height": None,
    "objects": [],
    "detected_at": None,
    "latest_frame_at": None,
    "error": None,
}

PUBLIC_DETECTION_FIELDS = (
    "station_id",
    "camera_connected",
    "detection_enabled",
    "detected",
    "status",
    "level_m",
    "water_level",
    "confidence",
    "water_coverage",
    "flood_risk",
    "weather_risk",
    "waterline_y",
    "frame_width",
    "frame_height",
    "detected_at",
    "latest_frame_at",
    "error",
    "combined_risk",
)


def get_camera_config_snapshot() -> tuple[dict | None, str, int]:
    with camera_config_lock:
        return (
            dict(camera_config) if camera_config is not None else None,
            camera_configuration_source,
            camera_config_generation,
        )


def get_configured_camera_source() -> str | None:
    config, _, _ = get_camera_config_snapshot()
    return config.get("source_type") if config else None


def get_camera_secret_values() -> tuple[str, ...]:
    config, _, _ = get_camera_config_snapshot()
    configured_values = (
        config.get("camera_username"),
        config.get("camera_password"),
    ) if config else ()

    return tuple(
        str(value)
        for value in (
            *configured_values,
            os.getenv("CAMERA_USERNAME", ""),
            os.getenv("CAMERA_PASSWORD", ""),
            SUPABASE_SECRET_KEY,
        )
        if value
    )


def get_camera_state_name() -> str:
    if camera_reconnecting:
        return "reconnecting"

    return "connected" if camera_connected else "disconnected"


def get_public_camera_config_status() -> dict:
    config, configuration_source, _ = (
        get_camera_config_snapshot()
    )
    status = public_camera_config(
        config,
        configuration_source=configuration_source,
    )
    status.update(
        {
            "camera_connected": camera_connected,
            "camera_state": get_camera_state_name(),
            "active_camera_source": active_camera_source,
            "restart_required": False,
        }
    )
    return status


def require_admin(view_function):
    @wraps(view_function)
    def protected_view(*args, **kwargs):
        try:
            authorize_active_admin(
                supabase,
                request.headers.get("Authorization"),
            )
        except AdminAuthorizationError as error:
            return jsonify({"error": error.message}), error.status_code

        return view_function(*args, **kwargs)

    return protected_view


def notify_detection_clients() -> int:
    """Wake SSE consumers after already-computed detection state changes."""

    global detection_version

    with detection_condition:
        detection_version += 1
        detection_condition.notify_all()
        return detection_version


def sanitize_public_error(value: object) -> str | None:
    """Remove URL user-info and configured secrets from public errors."""

    if value is None:
        return None

    message = str(value)
    message = re.sub(
        r"(?i)(rtsp://)[^\s/@]+@",
        r"\1***@",
        message,
    )

    for secret in get_camera_secret_values():
        if secret:
            message = message.replace(
                secret,
                "***",
            )

    return message


def get_public_detection_snapshot() -> dict:
    """Return the small, credential-safe state shared by JSON and SSE."""

    with state_lock:
        snapshot = {
            field: latest_detection.get(field)
            for field in PUBLIC_DETECTION_FIELDS
        }
        snapshot["camera_connected"] = camera_connected
        snapshot["latest_frame_at"] = latest_frame_at
        snapshot["error"] = sanitize_public_error(
            snapshot.get("error") or camera_error
        )

    return snapshot


def format_detection_sse_event(payload: dict) -> str:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return f"event: detection\ndata: {serialized}\n\n"


def generate_detection_events(
    *,
    heartbeat_seconds: float = SSE_HEARTBEAT_SECONDS,
):
    """Stream state copies; never invoke capture, inference, or storage."""

    with detection_condition:
        last_version = detection_version

    try:
        yield format_detection_sse_event(
            get_public_detection_snapshot()
        )

        while True:
            with detection_condition:
                has_update = detection_condition.wait_for(
                    lambda: detection_version != last_version,
                    timeout=max(0.001, heartbeat_seconds),
                )

                if has_update:
                    last_version = detection_version

            if has_update:
                yield format_detection_sse_event(
                    get_public_detection_snapshot()
                )
            else:
                yield ": keepalive\n\n"
    except GeneratorExit:
        return


# =========================================================
# Initialization
# =========================================================

def resolve_model_path() -> Path:
    configured_path = Path(YOLO_MODEL_PATH)

    if configured_path.is_absolute():
        return configured_path

    return BASE_DIR / configured_path


def load_yolo_model() -> None:
    global yolo_model
    global yolo_error

    if not YOLO_ENABLED:
        print("YOLO detection is disabled.")
        return

    model_path = resolve_model_path()

    if not model_path.exists():
        yolo_error = (
            f"YOLO model was not found: {model_path}"
        )
        print(yolo_error)
        return

    try:
        print(f"Loading YOLO model: {model_path}")

        yolo_model = YOLO(str(model_path))
        yolo_error = None

        print("YOLO model loaded successfully.")
        print(f"YOLO classes: {yolo_model.names}")

    except Exception as error:
        yolo_model = None
        yolo_error = str(error)

        print(
            "YOLO loading error: "
            f"{sanitize_public_error(error)}"
        )


def connect_supabase() -> None:
    global supabase
    global supabase_error

    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        supabase_error = (
            "SUPABASE_URL or SUPABASE_SECRET_KEY is missing."
        )

        print(f"Supabase disabled: {supabase_error}")
        return

    try:
        supabase = create_client(
            SUPABASE_URL,
            SUPABASE_SECRET_KEY,
        )

        supabase_error = None
        print("Supabase backend connected.")

    except Exception as error:
        supabase = None
        supabase_error = str(error)

        print(
            "Supabase connection error: "
            f"{sanitize_public_error(error)}"
        )


def start_weather_sync() -> None:
    if not WEATHER_ENABLED:
        print("Open-Meteo weather sync is disabled.")
        return

    if supabase is None:
        print(
            "Open-Meteo weather sync is waiting for "
            "a Supabase connection."
        )
        return

    try:
        start_weather_service(
            supabase,
            interval_seconds=(
                WEATHER_SYNC_INTERVAL_SECONDS
            ),
            request_timeout_seconds=(
                WEATHER_REQUEST_TIMEOUT_SECONDS
            ),
        )
        print(
            "Open-Meteo weather sync started "
            f"(every {WEATHER_SYNC_INTERVAL_SECONDS}s)."
        )
    except Exception as error:
        # Weather initialization must never stop camera capture or YOLO.
        print(
            "Open-Meteo weather sync error: "
            f"{sanitize_public_error(error)}"
        )


# =========================================================
# Station helpers
# =========================================================

def get_active_station_id() -> int:
    with station_lock:
        return active_station_id


def set_active_station_id(value: str | int | None) -> int:
    global active_station_id

    if value is None:
        return get_active_station_id()

    try:
        station_id = int(value)

        if station_id <= 0:
            raise ValueError

    except (TypeError, ValueError):
        return get_active_station_id()

    with station_lock:
        active_station_id = station_id

    return station_id


# =========================================================
# Combined-risk context and cache
# =========================================================

def refresh_risk_context(
    station_id: int,
    *,
    force: bool = False,
) -> None:
    """Refresh station thresholds and latest stored weather in a worker."""

    if supabase is None:
        return

    cache_key = str(station_id)
    attempt_time = time.monotonic()

    with risk_context_lock:
        last_attempt = risk_context_last_attempt.get(
            cache_key,
            0.0,
        )

        if (
            not force
            and attempt_time - last_attempt
            < RISK_CONTEXT_REFRESH_SECONDS
        ):
            return

        # Set before network I/O so overlapping database-write workers do not
        # issue duplicate context queries for the same station.
        risk_context_last_attempt[cache_key] = attempt_time

    station_row: dict | None = None
    weather_row: dict | None = None
    station_loaded = False
    weather_loaded = False

    try:
        station_response = (
            supabase.table("stations")
            .select(
                "id,normal_level,warning_level,critical_level"
            )
            .eq("id", station_id)
            .limit(1)
            .execute()
        )
        station_rows = getattr(
            station_response,
            "data",
            None,
        ) or []
        station_row = (
            station_rows[0]
            if station_rows
            and isinstance(station_rows[0], dict)
            else None
        )
        station_loaded = True
    except Exception as error:
        print(
            "Combined-risk station context error | "
            f"station={station_id}: {sanitize_public_error(error)}"
        )

    try:
        weather_response = (
            supabase.table("weather_readings")
            .select(
                "station_id,rain_1h,rain_6h,weather_code,"
                "condition_text,recorded_at"
            )
            .eq("station_id", station_id)
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        weather_rows = getattr(
            weather_response,
            "data",
            None,
        ) or []
        weather_row = (
            weather_rows[0]
            if weather_rows
            and isinstance(weather_rows[0], dict)
            else None
        )
        weather_loaded = True
    except Exception as error:
        print(
            "Combined-risk weather context error | "
            f"station={station_id}: {sanitize_public_error(error)}"
        )

    with risk_context_lock:
        context = dict(
            risk_context_by_station.get(
                cache_key,
                {},
            )
        )

        if station_loaded:
            context["station"] = station_row

        if weather_loaded:
            context["weather"] = weather_row

        context["refreshed_at"] = datetime.now(
            timezone.utc
        ).isoformat()
        risk_context_by_station[cache_key] = context


def get_risk_context(station_id: int) -> dict:
    with risk_context_lock:
        return dict(
            risk_context_by_station.get(
                str(station_id),
                {},
            )
        )


def calculate_detection_combined_risk(
    detection: dict,
) -> dict:
    """Calculate from cached context only; this function performs no I/O."""

    station_id = int(
        detection.get("station_id")
        or get_active_station_id()
    )
    context = get_risk_context(station_id)
    station = context.get("station")
    weather = context.get("weather")

    station_has_thresholds = bool(
        isinstance(station, dict)
        and station.get("normal_level") is not None
        and station.get("warning_level") is not None
        and station.get("critical_level") is not None
    )

    normal_level = (
        station.get("normal_level")
        if station_has_thresholds
        else NORMAL_LEVEL_M
    )
    warning_level = (
        station.get("warning_level")
        if station_has_thresholds
        else WARNING_LEVEL_M
    )
    critical_level = (
        station.get("critical_level")
        if station_has_thresholds
        else CRITICAL_LEVEL_M
    )

    yolo_available = bool(
        detection.get("detection_enabled")
    )
    flood_detected = (
        bool(detection.get("detected"))
        if yolo_available
        else None
    )
    water_measurement_valid = bool(
        yolo_available
        and detection.get("detected")
        and detection.get("waterline_y") is not None
        and detection.get("level_m") is not None
    )

    result = calculate_combined_flood_risk(
        water_level=(
            detection.get("level_m")
            if water_measurement_valid
            else None
        ),
        normal_level=normal_level,
        warning_level=warning_level,
        critical_level=critical_level,
        threshold_source=(
            "station"
            if station_has_thresholds
            else "detector_defaults"
        ),
        detector_status=detection.get("status"),
        yolo_available=yolo_available,
        flood_detected=flood_detected,
        yolo_confidence=detection.get("confidence"),
        water_coverage=detection.get("water_coverage"),
        rain_1h=(
            weather.get("rain_1h")
            if isinstance(weather, dict)
            else None
        ),
        rain_6h=(
            weather.get("rain_6h")
            if isinstance(weather, dict)
            else None
        ),
        weather_code=(
            weather.get("weather_code")
            if isinstance(weather, dict)
            else None
        ),
        condition_text=(
            weather.get("condition_text")
            if isinstance(weather, dict)
            else None
        ),
        weather_recorded_at=(
            weather.get("recorded_at")
            if isinstance(weather, dict)
            else None
        ),
    )

    with risk_context_lock:
        combined_risk_by_station[
            str(station_id)
        ] = result

    return result


def publish_combined_risk(detection: dict) -> dict:
    result = calculate_detection_combined_risk(
        detection
    )
    detection["combined_risk"] = result

    published = False

    with state_lock:
        if (
            latest_detection.get("station_id")
            == detection.get("station_id")
            and latest_detection.get("detected_at")
            == detection.get("detected_at")
        ):
            latest_detection["combined_risk"] = result
            published = True

    if published:
        notify_detection_clients()

    return result


def get_cached_combined_risk(
    station_id: int,
) -> dict:
    with risk_context_lock:
        result = combined_risk_by_station.get(
            str(station_id)
        )

        if result is not None:
            return dict(result)

    return not_assessed_flood_risk(
        "No combined-risk result is available for this station yet."
    )


# =========================================================
# Camera helpers
# =========================================================

def normalize_camera_frame(frame: np.ndarray) -> np.ndarray:
    """Return a safe contiguous BGR uint8 frame for OpenCV and YOLO."""

    if frame is None:
        raise RuntimeError("Camera returned an empty frame.")

    safe_frame = np.asarray(frame)

    if safe_frame.ndim == 2:
        safe_frame = cv2.cvtColor(
            np.ascontiguousarray(safe_frame),
            cv2.COLOR_GRAY2BGR,
        )
    elif safe_frame.ndim == 3 and safe_frame.shape[2] == 1:
        safe_frame = cv2.cvtColor(
            np.ascontiguousarray(safe_frame),
            cv2.COLOR_GRAY2BGR,
        )
    elif safe_frame.ndim == 3 and safe_frame.shape[2] == 4:
        safe_frame = cv2.cvtColor(
            np.ascontiguousarray(safe_frame),
            cv2.COLOR_BGRA2BGR,
        )
    elif safe_frame.ndim != 3 or safe_frame.shape[2] != 3:
        raise RuntimeError(
            f"Unsupported camera frame shape: {safe_frame.shape}"
        )

    if safe_frame.dtype != np.uint8:
        safe_frame = np.clip(
            safe_frame,
            0,
            255,
        ).astype(np.uint8)

    return np.ascontiguousarray(
        safe_frame.copy(),
        dtype=np.uint8,
    )


def resize_frame_for_processing(frame: np.ndarray) -> np.ndarray:
    """Cap frame size before annotation/YOLO to keep low-end PCs responsive."""

    if PROCESSING_WIDTH <= 0 or PROCESSING_HEIGHT <= 0:
        return frame

    frame_height, frame_width = frame.shape[:2]

    scale = min(
        PROCESSING_WIDTH / max(1, frame_width),
        PROCESSING_HEIGHT / max(1, frame_height),
        1.0,
    )

    if scale >= 0.999:
        return frame

    target_width = max(1, int(frame_width * scale))
    target_height = max(1, int(frame_height * scale))

    return cv2.resize(
        frame,
        (target_width, target_height),
        interpolation=cv2.INTER_AREA,
    )


def build_rtsp_url(config: dict | None = None) -> str:
    if config is None:
        config, _, _ = get_camera_config_snapshot()

    if config is None:
        raise RuntimeError("No camera source is configured.")

    return build_camera_rtsp_url(config)


def get_webcam_backends() -> list[tuple[str, int]]:
    if os.name == "nt":
        return [
            ("DSHOW", cv2.CAP_DSHOW),
            ("MSMF", cv2.CAP_MSMF),
            ("AUTO", cv2.CAP_ANY),
        ]

    return [("AUTO", cv2.CAP_ANY)]


def configure_capture(
    capture: cv2.VideoCapture,
    *,
    usb: bool,
) -> None:
    if usb:
        capture.set(
            cv2.CAP_PROP_FOURCC,
            cv2.VideoWriter_fourcc(*"MJPG"),
        )

    capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    capture.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
    capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    for property_name, timeout_ms in (
        ("CAP_PROP_OPEN_TIMEOUT_MSEC", 5000),
        ("CAP_PROP_READ_TIMEOUT_MSEC", 5000),
    ):
        property_id = getattr(cv2, property_name, None)

        if property_id is not None:
            capture.set(property_id, timeout_ms)


def try_webcam(
    camera_index: int,
    backend: int,
) -> cv2.VideoCapture | None:
    if backend == cv2.CAP_ANY:
        capture = cv2.VideoCapture(camera_index)
    else:
        capture = cv2.VideoCapture(
            camera_index,
            backend,
        )

    if not capture.isOpened():
        capture.release()
        return None

    configure_capture(capture, usb=True)

    success, frame = capture.read()

    if not success or frame is None:
        capture.release()
        return None

    try:
        normalize_camera_frame(frame)
    except Exception:
        capture.release()
        return None

    return capture


def open_usb_camera(config: dict) -> cv2.VideoCapture:
    global active_camera_source

    validated = validate_camera_config(config)

    if validated["source_type"] != SOURCE_USB:
        raise RuntimeError("A USB camera configuration is required.")

    camera_index = validated["webcam_index"]
    print(f"Opening USB webcam index {camera_index}...")

    for backend_name, backend in get_webcam_backends():
        capture = try_webcam(camera_index, backend)

        if capture is not None:
            active_camera_source = SOURCE_USB
            print(
                f"USB webcam {camera_index} connected "
                f"using {backend_name}."
            )
            return capture

    raise RuntimeError(
        f"USB webcam {camera_index} is unavailable or in use."
    )


def create_rtsp_capture(config: dict) -> cv2.VideoCapture:
    rtsp_url = build_rtsp_url(config)
    timeout_parameters: list[int] = []

    for property_name, timeout_ms in (
        ("CAP_PROP_OPEN_TIMEOUT_MSEC", 5000),
        ("CAP_PROP_READ_TIMEOUT_MSEC", 5000),
    ):
        property_id = getattr(cv2, property_name, None)

        if property_id is not None:
            timeout_parameters.extend([property_id, timeout_ms])

    try:
        capture = cv2.VideoCapture(
            rtsp_url,
            cv2.CAP_FFMPEG,
            timeout_parameters,
        )
    except (TypeError, cv2.error):
        capture = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)

    configure_capture(capture, usb=False)

    if not capture.isOpened():
        capture.release()
        raise RuntimeError(
            "OpenCV could not open the RTSP camera."
        )

    success, frame = capture.read()

    if not success or frame is None:
        capture.release()
        raise RuntimeError(
            "RTSP camera opened but returned no frames."
        )

    try:
        normalize_camera_frame(frame)
    except Exception as error:
        capture.release()
        raise RuntimeError(
            "RTSP camera returned an invalid frame: "
            f"{sanitize_public_error(error)}"
        ) from error

    return capture


def open_rtsp_camera(config: dict) -> cv2.VideoCapture:
    global active_camera_source

    print("Opening configured RTSP camera...")
    capture = create_rtsp_capture(config)
    active_camera_source = SOURCE_RTSP
    return capture


def get_environment_webcam_fallback() -> dict:
    return validate_camera_config(
        {
            "source_type": SOURCE_USB,
            "webcam_index": os.getenv("CAMERA_INDEX", "0"),
        }
    )


def open_camera(
    config: dict | None = None,
    configuration_source: str | None = None,
) -> cv2.VideoCapture:
    if config is None or configuration_source is None:
        config, configuration_source, _ = get_camera_config_snapshot()

    if config is None:
        raise RuntimeError(
            "No camera source is configured. Use Admin Camera Settings."
        )

    if config["source_type"] == SOURCE_USB:
        return open_usb_camera(config)

    if config["source_type"] == SOURCE_RTSP:
        try:
            return open_rtsp_camera(config)
        except Exception as error:
            if (
                configuration_source != CONFIGURATION_ENVIRONMENT
                or not CAMERA_FALLBACK_TO_WEBCAM
            ):
                raise

            print(
                "RTSP camera unavailable; "
                "using the developer webcam fallback. Reason: "
                f"{sanitize_public_error(error)}"
            )

            return open_usb_camera(get_environment_webcam_fallback())

    raise RuntimeError(
        "The configured camera source type is invalid."
    )


def update_camera_state(
    connected: bool,
    error: str | None = None,
    *,
    reconnecting: bool = False,
    reset_detection: bool = False,
) -> None:
    global camera_connected
    global camera_error
    global active_camera_source
    global camera_reconnecting
    global latest_detection

    public_error = (
        None
        if connected
        else sanitize_public_error(
            error or "Camera connection unavailable."
        )
    )

    with state_lock:
        state_changed = (
            camera_connected != connected
            or camera_error != public_error
            or camera_reconnecting != reconnecting
            or reset_detection
        )
        camera_connected = connected
        camera_error = public_error
        camera_reconnecting = reconnecting and not connected

        if not connected:
            active_camera_source = None

        if state_changed:
            current_status = str(
                latest_detection.get("status") or "waiting"
            )
            latest_detection = {
                **latest_detection,
                "camera_connected": connected,
                "status": (
                    "reconnecting"
                    if camera_reconnecting
                    else "error"
                    if not connected
                    else (
                        "waiting"
                        if current_status in {"error", "reconnecting"}
                        else current_status
                    )
                ),
                "latest_frame_at": latest_frame_at,
                "error": public_error,
            }

            if reset_detection:
                latest_detection.update(
                    {
                        "detected": False,
                        "status": (
                            "reconnecting"
                            if camera_reconnecting
                            else "waiting"
                        ),
                        "level_m": None,
                        "water_level": None,
                        "confidence": None,
                        "water_coverage": None,
                        "flood_risk": None,
                        "weather_risk": None,
                        "combined_risk": not_assessed_flood_risk(
                            "Waiting for a usable monitoring detection."
                        ),
                        "waterline_y": None,
                        "frame_width": None,
                        "frame_height": None,
                        "objects": [],
                        "detected_at": None,
                    }
                )

    if state_changed:
        notify_detection_clients()


def request_camera_reconnect() -> None:
    """Clear stale frames and wake the one permanent capture worker."""

    global latest_jpeg
    global latest_camera_frame
    global latest_frame_at
    global latest_water_mask

    camera_reconnect_event.set()

    with frame_lock:
        latest_jpeg = None
        latest_camera_frame = None

    with state_lock:
        latest_frame_at = None
        latest_water_mask = None

    update_camera_state(
        False,
        "Camera source is reconnecting.",
        reconnecting=True,
        reset_detection=True,
    )


def test_camera_configuration(config: dict) -> None:
    """Validate a live or temporary source without switching cameras."""

    validated = validate_camera_config(config)
    capture: cv2.VideoCapture | None = None

    current_config, _, _ = get_camera_config_snapshot()

    if (
        validated == current_config
        and camera_connected
        and active_camera_source == validated["source_type"]
    ):
        with frame_lock:
            active_frame_available = latest_camera_frame is not None

        if active_frame_available:
            return

    try:
        if validated["source_type"] == SOURCE_RTSP:
            capture = create_rtsp_capture(validated)
            return

        for _, backend in get_webcam_backends():
            capture = try_webcam(validated["webcam_index"], backend)

            if capture is not None:
                return

        raise RuntimeError(
            "The selected USB webcam is unavailable or in use."
        )
    finally:
        if capture is not None:
            capture.release()


def probe_usb_camera_devices() -> list[dict]:
    """Probe only the small supported Windows webcam-index range."""

    devices: list[dict] = []
    config, _, _ = get_camera_config_snapshot()
    active_index = (
        config.get("webcam_index")
        if camera_connected
        and active_camera_source == SOURCE_USB
        and config
        and config.get("source_type") == SOURCE_USB
        else None
    )

    for camera_index in range(MIN_WEBCAM_INDEX, MAX_WEBCAM_INDEX + 1):
        available = camera_index == active_index

        if not available:
            for _, backend in get_webcam_backends():
                capture = try_webcam(camera_index, backend)

                if capture is not None:
                    capture.release()
                    available = True
                    break

        if available:
            devices.append(
                {
                    "index": camera_index,
                    "label": f"USB Camera {camera_index}",
                }
            )

    return devices


def save_camera_configuration(value: dict) -> dict:
    """Persist a camera source and signal a hot reconnect."""

    global camera_config
    global camera_configuration_source
    global camera_configuration_error
    global camera_config_generation

    existing_config, _, _ = get_camera_config_snapshot()
    prepared_config = prepare_camera_config(value, existing_config)
    saved_config = camera_config_store.save(prepared_config)

    with camera_config_lock:
        camera_config = saved_config
        camera_configuration_source = CONFIGURATION_RUNTIME
        camera_configuration_error = None
        camera_config_generation += 1

    request_camera_reconnect()
    return saved_config


# =========================================================
# YOLO detection
# =========================================================



def get_flood_class_ids() -> set[int]:
    if yolo_model is None:
        return {0}

    class_ids = {
        int(class_id)
        for class_id, class_name
        in yolo_model.names.items()
        if str(class_name).strip().lower()
        in {
            "flood",
            "water",
            "flooding",
            "floodwater",
        }
    }

    return class_ids or {0}




def determine_level_status(
    level_m: float,
    detected: bool,
) -> str:
    if not detected:
        return "no_detection"

    if level_m >= CRITICAL_LEVEL_M:
        return "critical"

    if level_m >= WARNING_LEVEL_M:
        return "warning"

    return "normal"


def run_yolo_detection(
    frame: np.ndarray,
) -> tuple[dict, np.ndarray]:
    frame_height, frame_width = frame.shape[:2]
    gauge_points = resolve_configured_gauge_points(
        frame_width,
        frame_height,
        CAMERA_WIDTH,
        CAMERA_HEIGHT,
    )
    measurement_mode = (
        "calibrated_gauge"
        if gauge_points is not None
        else "frame_ratio"
    )

    empty_mask = np.zeros(
        (frame_height, frame_width),
        dtype=np.uint8,
    )

    if not YOLO_ENABLED or yolo_model is None:
        result = {
            "station_id": get_active_station_id(),
            "camera_connected": camera_connected,
            "detection_enabled": False,
            "detected": False,
            "status": "no_detection",
            "level_m": 0.0,
            "water_level": 0.0,
            "confidence": 0.0,
            "water_coverage": 0.0,
            "flood_risk": 0.0,
            "waterline_y": None,
            "frame_width": frame_width,
            "frame_height": frame_height,
            "measurement_mode": measurement_mode,
            "gauge_enabled": gauge_points is not None,
            "gauge_points": serialize_gauge_points(
                gauge_points
            ),
            "objects": [],
            "detected_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "latest_frame_at": latest_frame_at,
            "error": yolo_error,
        }

        result["combined_risk"] = (
            calculate_detection_combined_risk(
                result
            )
        )

        return result, empty_mask

    safe_frame = normalize_camera_frame(frame)

    flood_class_ids = get_flood_class_ids()

    predict_options = {
        "source": np.ascontiguousarray(
            safe_frame.copy(),
            dtype=np.uint8,
        ),
        "conf": YOLO_CONFIDENCE,
        "imgsz": YOLO_IMAGE_SIZE,
        "max_det": YOLO_MAX_DETECTIONS,
        "classes": list(flood_class_ids),
        "verbose": False,
    }

    if YOLO_DEVICE:
        predict_options["device"] = YOLO_DEVICE

    prediction = yolo_model.predict(
        **predict_options,
    )[0]

    water_mask = empty_mask.copy()

    confidence_values: list[float] = []
    objects: list[dict] = []

    boxes = prediction.boxes
    masks = prediction.masks

    if (
        boxes is not None
        and masks is not None
        and len(masks.data) > 0
    ):
        class_values = (
            boxes.cls.detach().cpu().numpy()
        )

        box_confidences = (
            boxes.conf.detach().cpu().numpy()
        )

        for index, mask_tensor in enumerate(masks.data):
            class_id = int(class_values[index])
            confidence = float(
                box_confidences[index]
            )

            class_name = str(
                yolo_model.names.get(
                    class_id,
                    class_id,
                )
            )

            objects.append(
                {
                    "class": class_name,
                    "class_id": class_id,
                    "confidence": round(
                        confidence,
                        4,
                    ),
                }
            )

            if class_id not in flood_class_ids:
                continue

            mask_array = np.ascontiguousarray(
                mask_tensor
                .detach()
                .cpu()
                .numpy(),
                dtype=np.float32,
            )

            resized_mask = cv2.resize(
                mask_array,
                (frame_width, frame_height),
                interpolation=cv2.INTER_NEAREST,
            )

            binary_mask = np.ascontiguousarray(
                (resized_mask > 0.5).astype(np.uint8)
            )

            water_mask = cv2.bitwise_or(
                water_mask,
                binary_mask,
            )

            confidence_values.append(confidence)

    detected = bool(
        confidence_values
        and np.count_nonzero(water_mask) > 0
    )

    water_pixels = int(
        np.count_nonzero(water_mask)
    )

    total_pixels = max(
        1,
        frame_width * frame_height,
    )

    water_coverage = round(
        water_pixels / total_pixels * 100,
        2,
    )

    waterline_y = (
        calculate_waterline(water_mask)
        if detected
        else None
    )

    level_m = waterline_to_level(
        waterline_y,
        frame_height,
        gauge_points,
    )

    confidence = (
        max(confidence_values)
        if confidence_values
        else 0.0
    )

    coverage_risk = min(
        1.0,
        water_coverage / 60.0,
    )

    flood_risk = (
        round(
            coverage_risk * 0.70
            + confidence * 0.30,
            4,
        )
        if detected
        else 0.0
    )

    status = determine_level_status(
        level_m,
        detected,
    )

    detected_at = datetime.now(
        timezone.utc
    ).isoformat()

    result = {
        "station_id": get_active_station_id(),
        "camera_connected": camera_connected,
        "detection_enabled": True,
        "detected": detected,
        "status": status,
        "level_m": level_m,
        "water_level": level_m,
        "confidence": round(confidence, 4),
        "water_coverage": water_coverage,
        "flood_risk": flood_risk,
        "weather_risk": 0.0,
        "waterline_y": waterline_y,
        "frame_width": frame_width,
        "frame_height": frame_height,
        "measurement_mode": measurement_mode,
        "gauge_enabled": gauge_points is not None,
        "gauge_points": serialize_gauge_points(
            gauge_points
        ),
        "objects": objects,
        "detected_at": detected_at,
        "latest_frame_at": latest_frame_at,
        "error": None,
    }

    result["combined_risk"] = (
        calculate_detection_combined_risk(
            result
        )
    )

    return result, water_mask


# =========================================================
# Frame annotation




def annotate_frame(
    frame: np.ndarray,
    detection: dict,
    water_mask: np.ndarray | None,
) -> np.ndarray:
    output = normalize_camera_frame(frame)
    frame_height, frame_width = output.shape[:2]
    gauge_points = resolve_configured_gauge_points(
        frame_width,
        frame_height,
        CAMERA_WIDTH,
        CAMERA_HEIGHT,
    )

    if (
        water_mask is not None
        and np.count_nonzero(water_mask) > 0
    ):
        overlay = output.copy()

        overlay[water_mask > 0] = (
            255,
            130,
            30,
        )

        output = cv2.addWeighted(
            overlay,
            0.34,
            output,
            0.66,
            0,
        )

    if gauge_points is None:
        threshold_lines = [
            (
                CRITICAL_LEVEL_M,
                "CRITICAL",
                (40, 40, 240),
            ),
            (
                WARNING_LEVEL_M,
                "WARNING",
                (0, 150, 255),
            ),
            (
                NORMAL_LEVEL_M,
                "NORMAL",
                (50, 210, 150),
            ),
        ]

        for level, label, color in threshold_lines:
            y_position = level_to_y(
                level,
                frame_height,
            )

            cv2.line(
                output,
                (0, y_position),
                (frame_width, y_position),
                color,
                2,
            )

            cv2.putText(
                output,
                f"{label} {level:.2f}m",
                (12, max(20, y_position - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.48,
                color,
                1,
                cv2.LINE_AA,
            )

    draw_measurement_gauge(
        output,
        detection,
        gauge_points,
    )

    waterline_y = detection.get("waterline_y")

    if waterline_y is not None:
        cv2.line(
            output,
            (0, int(waterline_y)),
            (frame_width, int(waterline_y)),
            (255, 220, 40),
            2,
        )

    detected = bool(detection.get("detected"))

    level_m = float(
        detection.get("level_m") or 0
    )

    coverage = float(
        detection.get("water_coverage") or 0
    )

    confidence = float(
        detection.get("confidence") or 0
    )

    risk = float(
        detection.get("flood_risk") or 0
    )

    info_lines = [
        (
            "Flood",
            "DETECTED" if detected else "NOT DETECTED",
        ),
        ("Water Level", f"{level_m:.2f} m"),
        ("Coverage", f"{coverage:.1f}%"),
        ("AI Confidence", f"{confidence * 100:.0f}%"),
        ("Flood Risk", f"{risk * 100:.0f}%"),
        (
            "Mode",
            (
                "GAUGE"
                if gauge_points is not None
                else "FRAME"
            ),
        ),
        (
            "Station",
            str(detection.get("station_id", "--")),
        ),
    ]

    panel_width = 290
    panel_height = 34 + len(info_lines) * 28

    cv2.rectangle(
        output,
        (10, 10),
        (10 + panel_width, 10 + panel_height),
        (12, 18, 28),
        -1,
    )

    for index, (label, value) in enumerate(info_lines):
        y_position = 42 + index * 28

        cv2.putText(
            output,
            f"{label}:",
            (24, y_position),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (180, 195, 215),
            1,
            cv2.LINE_AA,
        )

        value_color = (
            (40, 60, 240)
            if detected and label == "Flood"
            else (230, 240, 250)
        )

        cv2.putText(
            output,
            value,
            (145, y_position),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            value_color,
            1,
            cv2.LINE_AA,
        )

    timestamp = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    cv2.putText(
        output,
        timestamp,
        (12, frame_height - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.46,
        (220, 225, 235),
        1,
        cv2.LINE_AA,
    )

    return output


# =========================================================
# Supabase writing
# =========================================================

def create_alert_if_needed(
    detection: dict,
) -> None:
    """Create a Warning/Critical alert with an in-memory cooldown."""

    if supabase is None:
        return

    status = str(
        detection.get("status") or ""
    ).strip().lower()

    if status not in {"warning", "critical"}:
        return

    station_id = int(
        detection.get("station_id")
        or DEFAULT_STATION_ID
    )

    level_m = float(
        detection.get("level_m") or 0.0
    )

    water_coverage = float(
        detection.get("water_coverage") or 0.0
    )

    confidence = float(
        detection.get("confidence") or 0.0
    )

    flood_risk = float(
        detection.get("flood_risk") or 0.0
    )

    detected_at = detection.get(
        "detected_at"
    ) or datetime.now(
        timezone.utc
    ).isoformat()

    alert_key = (
        station_id,
        status,
    )

    current_time = time.time()

    with alert_lock:
        last_alert_time = last_alert_times.get(
            alert_key,
            0.0,
        )

        if (
            current_time - last_alert_time
            < ALERT_COOLDOWN_SECONDS
        ):
            return

        if status == "critical":
            title = "Critical Flood Level Detected"
            message = (
                f"Critical flood level detected at "
                f"{level_m:.2f} m. "
                f"Water coverage: {water_coverage:.1f}%. "
                f"AI confidence: {confidence * 100:.0f}%. "
                f"Flood risk: {flood_risk * 100:.0f}%."
            )
        else:
            title = "Flood Warning Detected"
            message = (
                f"Warning flood level detected at "
                f"{level_m:.2f} m. "
                f"Water coverage: {water_coverage:.1f}%. "
                f"AI confidence: {confidence * 100:.0f}%. "
                f"Flood risk: {flood_risk * 100:.0f}%."
            )

        try:
            supabase.table("alerts").insert(
                {
                    "station_id": station_id,
                    "type": status,
                    "title": title,
                    "message": message,
                    "is_read": False,
                    "is_resolved": False,
                    "created_at": detected_at,
                }
            ).execute()

            last_alert_times[alert_key] = (
                current_time
            )

            print(
                "Alert created | "
                f"station={station_id} "
                f"type={status} "
                f"level={level_m:.2f}m"
            )

        except Exception as error:
            print(
                "Alert creation error: "
                f"{sanitize_public_error(error)}"
            )


def write_detection_to_supabase(
    detection: dict,
) -> None:
    global supabase_error

    if supabase is None:
        return

    station_id = int(
        detection["station_id"]
    )

    # This function already runs outside the capture loop. Refreshing cached
    # Supabase context here keeps camera/YOLO processing non-blocking.
    refresh_risk_context(station_id)
    publish_combined_risk(detection)

    level_m = float(
        detection.get("level_m") or 0.0
    )

    confidence = float(
        detection.get("confidence") or 0.0
    )

    water_coverage = float(
        detection.get("water_coverage") or 0.0
    )

    flood_risk = float(
        detection.get("flood_risk") or 0.0
    )

    waterline_y = detection.get("waterline_y")

    status = str(
        detection.get(
            "status",
            "no_detection",
        )
    )

    detected_at = detection.get(
        "detected_at"
    ) or datetime.now(
        timezone.utc
    ).isoformat()

    # detector_results and yolo_detections use an operational
    # status constraint: ok, no_detection, or error. Flood
    # severity remains in detection["status"] and is stored
    # separately in the alerts table.
    database_status = (
        status
        if status in {"no_detection", "error"}
        else "ok"
    )

    create_alert_if_needed(detection)

    try:
        supabase.table("water_levels").insert(
            {
                "station_id": station_id,
                "level_m": level_m,
                "rainfall_mm": 0.0,
                "recorded_at": detected_at,
            }
        ).execute()

        supabase.table("detector_results").insert(
            {
                "station_id": station_id,
                "level_m": level_m,
                "confidence": confidence,
                "waterline_y": waterline_y,
                "frame_width": detection.get(
                    "frame_width"
                ),
                "frame_height": detection.get(
                    "frame_height"
                ),
                "status": database_status,
                "snapshot_path": None,
                "detected_at": detected_at,
            }
        ).execute()

        supabase.table("yolo_detections").insert(
            {
                "station_id": station_id,
                "water_coverage": water_coverage,
                "level_m": level_m,
                "confidence": confidence,
                "weather_risk": 0.0,
                "flood_risk": flood_risk,
                "objects_json": json.dumps(
                    detection.get("objects", [])
                ),
                "waterline_y": waterline_y,
                "frame_width": detection.get(
                    "frame_width"
                ),
                "frame_height": detection.get(
                    "frame_height"
                ),
                "status": database_status,
                "snapshot_path": None,
                "detected_at": detected_at,
            }
        ).execute()

        supabase_error = None

        print(
            "Supabase saved | "
            f"station={station_id} "
            f"status={status} "
            f"level={level_m:.2f}m "
            f"coverage={water_coverage:.1f}% "
            f"confidence={confidence:.2f}"
        )

    except Exception as error:
        supabase_error = str(error)

        print(
            "Supabase write error: "
            f"{sanitize_public_error(error)}"
        )


# =========================================================
# Camera capture thread
# =========================================================

def camera_capture_loop() -> None:
    global latest_jpeg
    global latest_camera_frame
    global latest_frame_at
    global latest_water_mask
    global latest_detection

    frame_counter = 0
    last_database_write = 0.0
    target_frame_delay = 1.0 / STREAM_FPS

    while not stop_event.is_set():
        capture: cv2.VideoCapture | None = None

        try:
            camera_reconnect_event.clear()
            configured_camera, configuration_source, generation = (
                get_camera_config_snapshot()
            )
            capture = open_camera(
                configured_camera,
                configuration_source,
            )

            if not capture.isOpened():
                raise RuntimeError(
                    "OpenCV could not open the camera."
                )

            _, _, current_generation = get_camera_config_snapshot()

            if (
                camera_reconnect_event.is_set()
                or generation != current_generation
            ):
                update_camera_state(
                    False,
                    "Camera source is reconnecting.",
                    reconnecting=True,
                    reset_detection=True,
                )
                continue

            print("Camera connected successfully.")
            update_camera_state(True)
            frame_counter = 0

            while not stop_event.is_set():
                if camera_reconnect_event.is_set():
                    update_camera_state(
                        False,
                        "Camera source is reconnecting.",
                        reconnecting=True,
                        reset_detection=True,
                    )
                    break

                loop_started = time.perf_counter()
                if (
                    active_camera_source == SOURCE_RTSP
                    and RTSP_FRAME_SKIP > 0
                ):
                    grabbed_frame = False

                    for _ in range(RTSP_FRAME_SKIP):
                        if camera_reconnect_event.is_set():
                            break

                        if capture.grab():
                            grabbed_frame = True
                        else:
                            break

                    if camera_reconnect_event.is_set():
                        continue

                    if grabbed_frame:
                        success, frame = capture.retrieve()
                    else:
                        success, frame = capture.read()
                else:
                    success, frame = capture.read()

                if not success or frame is None:
                    raise RuntimeError(
                        "Camera stopped returning frames."
                    )

                frame = normalize_camera_frame(frame)
                frame = resize_frame_for_processing(frame)

                with frame_lock:
                    latest_camera_frame = frame.copy()

                latest_frame_at = datetime.now(
                    timezone.utc
                ).isoformat()

                frame_counter += 1

                should_run_yolo = (
                    frame_counter
                    % YOLO_FRAME_INTERVAL
                    == 0
                    or latest_detection.get(
                        "detected_at"
                    )
                    is None
                )

                if should_run_yolo:
                    detection, water_mask = (
                        run_yolo_detection(frame)
                    )

                    detection["latest_frame_at"] = (
                        latest_frame_at
                    )

                    with state_lock:
                        latest_detection = detection
                        latest_water_mask = water_mask

                    notify_detection_clients()
                else:
                    with state_lock:
                        detection = dict(
                            latest_detection
                        )

                        water_mask = (
                            latest_water_mask.copy()
                            if latest_water_mask
                            is not None
                            else None
                        )

                annotated_frame = annotate_frame(
                    frame,
                    detection,
                    water_mask,
                )

                annotated_frame = np.ascontiguousarray(
                    annotated_frame,
                    dtype=np.uint8,
                )

                encoded, jpeg_buffer = cv2.imencode(
                    ".jpg",
                    annotated_frame,
                    [
                        int(
                            cv2.IMWRITE_JPEG_QUALITY
                        ),
                        JPEG_QUALITY,
                    ],
                )

                if encoded:
                    with frame_lock:
                        latest_jpeg = (
                            jpeg_buffer.tobytes()
                        )

                current_time = time.time()

                if (
                    should_run_yolo
                    and current_time
                    - last_database_write
                    >= SUPABASE_WRITE_INTERVAL
                ):
                    detection_for_database = dict(
                        detection
                    )

                    threading.Thread(
                        target=write_detection_to_supabase,
                        args=(
                            detection_for_database,
                        ),
                        daemon=True,
                    ).start()

                    last_database_write = current_time

                update_camera_state(True)

                elapsed = time.perf_counter() - loop_started
                sleep_for = target_frame_delay - elapsed

                if sleep_for > 0:
                    camera_reconnect_event.wait(sleep_for)

            if camera_reconnect_event.is_set() and not stop_event.is_set():
                continue

        except Exception as error:
            if camera_reconnect_event.is_set() and not stop_event.is_set():
                update_camera_state(
                    False,
                    "Camera source is reconnecting.",
                    reconnecting=True,
                    reset_detection=True,
                )
            else:
                error_message = sanitize_public_error(error)
                print(f"Camera error: {error_message}")

                update_camera_state(
                    False,
                    error_message,
                )

                if not stop_event.is_set():
                    camera_reconnect_event.wait(3)

        finally:
            if capture is not None:
                capture.release()


def start_capture_thread() -> None:
    global capture_thread

    with capture_thread_lock:
        if capture_thread and capture_thread.is_alive():
            return

        stop_event.clear()

        capture_thread = threading.Thread(
            target=camera_capture_loop,
            name="AquaGuardCameraCapture",
            daemon=True,
        )

        capture_thread.start()


def initialize_camera_agent() -> bool:
    """Initialize the existing process-level workers exactly once."""

    global camera_agent_initialized

    with camera_agent_initialization_lock:
        if camera_agent_initialized:
            return False

        load_yolo_model()
        connect_supabase()
        start_weather_sync()
        start_capture_thread()
        camera_agent_initialized = True

        return True


# =========================================================
# MJPEG generator
# =========================================================

def generate_mjpeg_stream():
    previous_frame: bytes | None = None

    while True:
        with frame_lock:
            current_frame = latest_jpeg

        if current_frame is None:
            time.sleep(0.1)
            continue

        if current_frame == previous_frame:
            time.sleep(0.01)
            continue

        previous_frame = current_frame

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + current_frame
            + b"\r\n"
        )


# =========================================================
# Flask endpoints
# =========================================================

@app.get("/")
def index():
    return jsonify(
        {
            "name": "AquaGuard Camera API",
            "status": "running",
            "camera_source": get_configured_camera_source(),
            "active_camera_source": active_camera_source,
            "camera_fallback_to_webcam": CAMERA_FALLBACK_TO_WEBCAM,
            "video_endpoint": "/video_feed",
            "snapshot_endpoint": "/snapshot",
            "health_endpoint": "/health",
            "detection_endpoint": "/latest_detection",
            "detection_stream_endpoint": "/detection_stream",
            "flood_risk_endpoint": "/flood_risk",
            "weather_status_endpoint": "/weather_status",
        }
    )


@app.get("/health")
def health():
    requested_station_id = request.args.get(
        "station_id"
    )

    station_id = set_active_station_id(
        requested_station_id
    )

    with state_lock:
        latest_detection_at = latest_detection.get(
            "detected_at"
        )

    configured_camera_source = get_configured_camera_source()

    return jsonify(
        {
            "service": "AquaGuard Camera API",
            "running": True,
            "station_id": station_id,
            # Keep the legacy name while making its configured meaning clear.
            "camera_source": configured_camera_source,
            "configured_camera_source": configured_camera_source,
            "active_camera_source": active_camera_source,
            "camera_state": get_camera_state_name(),
            "camera_fallback_to_webcam": CAMERA_FALLBACK_TO_WEBCAM,
            "camera_connected": camera_connected,
            "latest_frame_at": latest_frame_at,
            "latest_detection_at": latest_detection_at,
            "detection_stream_available": True,
            "camera_error": sanitize_public_error(camera_error),
            "yolo_enabled": YOLO_ENABLED,
            "yolo_loaded": yolo_model is not None,
            "yolo_error": sanitize_public_error(yolo_error),
            "gauge_enabled": GAUGE_ENABLED,
            "gauge_points": GAUGE_POINTS,
            "gauge_tick_interval_m": GAUGE_TICK_INTERVAL_M,
            "gauge_label_interval_m": GAUGE_LABEL_INTERVAL_M,
            "waterline_row_coverage": WATERLINE_ROW_COVERAGE,
            "supabase_connected": (
                supabase is not None
            ),
            "supabase_error": sanitize_public_error(supabase_error),
            "alert_cooldown_seconds": (
                ALERT_COOLDOWN_SECONDS
            ),
        }
    )


@app.get("/camera_config")
@require_admin
def get_camera_configuration():
    response_data = get_public_camera_config_status()

    if camera_configuration_error:
        response_data["configuration_warning"] = (
            "A saved camera configuration could not be used. "
            "Review and save the camera settings."
        )

    return jsonify(response_data)


@app.get("/camera_devices")
@require_admin
def get_camera_devices():
    try:
        devices = probe_usb_camera_devices()
    except Exception as error:
        print(
            "USB webcam discovery failed: "
            f"{sanitize_public_error(error)}"
        )
        return (
            jsonify(
                {
                    "error": (
                        "Connected USB webcams could not be detected."
                    )
                }
            ),
            500,
        )

    return jsonify({"devices": devices})


@app.post("/camera_config/test")
@require_admin
def test_camera_connection():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON camera configuration is required."}), 400

    existing_config, _, _ = get_camera_config_snapshot()

    try:
        candidate = prepare_camera_config(payload, existing_config)
        test_camera_configuration(candidate)
    except CameraConfigError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        safe_error = sanitize_public_error(error)
        print(f"Temporary camera test failed: {safe_error}")
        return (
            jsonify(
                {
                    "success": False,
                    "error": (
                        "Camera connection failed. Check the camera "
                        "address, credentials, path, or USB selection."
                    ),
                }
            ),
            502,
        )

    return jsonify(
        {
            "success": True,
            "message": "Camera connection successful.",
        }
    )


@app.put("/camera_config")
@require_admin
def update_camera_configuration():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON camera configuration is required."}), 400

    try:
        save_camera_configuration(payload)
    except CameraConfigError as error:
        return jsonify({"error": str(error)}), 400
    except CameraConfigPersistenceError:
        print(
            "Camera configuration save failed: "
            "the runtime data folder is not writable."
        )
        return (
            jsonify(
                {
                    "error": (
                        "The camera configuration could not be saved. "
                        "Check the detector data-folder permissions."
                    )
                }
            ),
            500,
        )

    response_data = get_public_camera_config_status()
    response_data.update(
        {
            "success": True,
            "message": (
                "Camera configuration saved. AquaGuard is reconnecting."
            ),
            "restart_required": False,
        }
    )
    return jsonify(response_data)


@app.get("/weather_status")
def weather_status():
    service_status = get_weather_service_status()

    if (
        WEATHER_ENABLED
        and supabase is None
        and not service_status.get("last_error")
    ):
        service_status["last_error"] = (
            "Supabase connection is unavailable."
        )

    service_status["last_error"] = sanitize_public_error(
        service_status.get("last_error")
    )

    return jsonify(
        {
            "enabled": WEATHER_ENABLED,
            "provider": "Open-Meteo",
            **service_status,
            "sync_interval_seconds": (
                WEATHER_SYNC_INTERVAL_SECONDS
            ),
        }
    )


@app.get("/latest_detection")
def get_latest_detection():
    requested_station_id = request.args.get(
        "station_id"
    )

    set_active_station_id(
        requested_station_id
    )

    response_data = get_public_detection_snapshot()

    response_data.update(
        {
            "camera_connected": camera_connected,
            "camera_source": get_configured_camera_source(),
            "active_camera_source": active_camera_source,
            "camera_state": get_camera_state_name(),
            "camera_fallback_to_webcam": CAMERA_FALLBACK_TO_WEBCAM,
            "latest_frame_at": latest_frame_at,
            "camera_error": sanitize_public_error(camera_error),
            "yolo_loaded": yolo_model is not None,
            "yolo_error": sanitize_public_error(yolo_error),
            "supabase_connected": (
                supabase is not None
            ),
            "supabase_error": sanitize_public_error(supabase_error),
        }
    )

    return jsonify(response_data)


@app.get("/detection_stream")
def detection_stream():
    requested_station_id = request.args.get(
        "station_id"
    )

    if requested_station_id is not None:
        try:
            parsed_station_id = int(
                requested_station_id
            )

            if parsed_station_id <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return (
                jsonify(
                    {
                        "error": (
                            "station_id must be a positive integer."
                        )
                    }
                ),
                400,
            )

    # Subscribing never changes the physical detector's active station.
    # Every payload identifies the single active detector via station_id.
    return Response(
        generate_detection_events(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-AquaGuard-Station-Scope": (
                "single-active-detector"
            ),
        },
    )


@app.get("/flood_risk")
def get_flood_risk():
    requested_station_id = request.args.get(
        "station_id"
    )

    if requested_station_id is None:
        station_id = get_active_station_id()
    else:
        try:
            station_id = int(
                requested_station_id
            )

            if station_id <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return (
                jsonify(
                    {
                        "error": (
                            "station_id must be a positive integer."
                        )
                    }
                ),
                400,
            )

    return jsonify(
        {
            "station_id": station_id,
            "combined_risk": (
                get_cached_combined_risk(
                    station_id
                )
            ),
        }
    )


@app.get("/video_feed")
def video_feed():
    requested_station_id = request.args.get(
        "station_id"
    )

    set_active_station_id(
        requested_station_id
    )

    start_capture_thread()

    return Response(
        generate_mjpeg_stream(),
        mimetype=(
            "multipart/x-mixed-replace; "
            "boundary=frame"
        ),
        headers={
            "Cache-Control": (
                "no-cache, no-store, "
                "must-revalidate"
            ),
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/snapshot")
def snapshot():
    requested_station_id = request.args.get(
        "station_id"
    )

    set_active_station_id(
        requested_station_id
    )

    start_capture_thread()

    with frame_lock:
        frame = (
            latest_camera_frame.copy()
            if latest_camera_frame is not None
            else None
        )

    if frame is None:
        return (
            jsonify(
                {
                    "error": (
                        "Camera snapshot is not ready."
                    )
                }
            ),
            503,
        )

    encoded, jpeg_buffer = cv2.imencode(
        ".jpg",
        frame,
        [
            int(cv2.IMWRITE_JPEG_QUALITY),
            JPEG_QUALITY,
        ],
    )

    if not encoded:
        return (
            jsonify(
                {
                    "error": (
                        "Unable to encode camera snapshot."
                    )
                }
            ),
            500,
        )

    return Response(
        jpeg_buffer.tobytes(),
        mimetype="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )


# =========================================================
# Application entry point
# =========================================================

if __name__ == "__main__":
    initialize_camera_agent()

    print("=" * 62)
    print("AquaGuard Camera + YOLO Service")
    print(f"Source: {get_configured_camera_source()}")
    print(f"Default station: {DEFAULT_STATION_ID}")
    print(
        f"YOLO model: {resolve_model_path()}"
    )
    print(
        f"Health: http://localhost:{FLASK_PORT}/health"
    )
    print(
        f"Video:  http://localhost:{FLASK_PORT}/video_feed"
    )
    print(
        "Detection: "
        f"http://localhost:{FLASK_PORT}/latest_detection"
    )
    print(
        "Detection stream: "
        f"http://localhost:{FLASK_PORT}/detection_stream"
    )
    print(
        "Flood risk: "
        f"http://localhost:{FLASK_PORT}/flood_risk"
    )
    print(
        "Weather: "
        f"http://localhost:{FLASK_PORT}/weather_status"
    )
    print(
        f"Alert cooldown: {ALERT_COOLDOWN_SECONDS}s"
    )
    print("=" * 62)

    app.run(
        host=FLASK_HOST,
        port=FLASK_PORT,
        debug=False,
        threaded=True,
        use_reloader=False,
    )
