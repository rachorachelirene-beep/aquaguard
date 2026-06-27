from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

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
load_dotenv(BASE_DIR / ".env")


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


CAMERA_SOURCE = os.getenv(
    "CAMERA_SOURCE",
    "webcam",
).strip().lower()

CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))

CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "1280"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "720"))
CAMERA_FPS = int(os.getenv("CAMERA_FPS", "30"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "80"))

CAMERA_USERNAME = os.getenv(
    "CAMERA_USERNAME",
    "",
).strip()

CAMERA_PASSWORD = os.getenv(
    "CAMERA_PASSWORD",
    "",
).strip()

CAMERA_IP = os.getenv(
    "CAMERA_IP",
    "",
).strip()

CAMERA_STREAM_PATH = os.getenv(
    "CAMERA_STREAM_PATH",
    "/stream1",
).strip()

FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))

YOLO_ENABLED = env_bool("YOLO_ENABLED", True)

YOLO_MODEL_PATH = os.getenv(
    "YOLO_MODEL_PATH",
    "models/flood_best.pt",
).strip()

YOLO_CONFIDENCE = float(
    os.getenv("YOLO_CONFIDENCE", "0.35")
)

YOLO_FRAME_INTERVAL = max(
    1,
    int(os.getenv("YOLO_FRAME_INTERVAL", "3")),
)

MIN_LEVEL_M = float(os.getenv("MIN_LEVEL_M", "0.00"))
MAX_LEVEL_M = float(os.getenv("MAX_LEVEL_M", "3.00"))

NORMAL_LEVEL_M = float(
    os.getenv("NORMAL_LEVEL_M", "1.00")
)

WARNING_LEVEL_M = float(
    os.getenv("WARNING_LEVEL_M", "2.00")
)

CRITICAL_LEVEL_M = float(
    os.getenv("CRITICAL_LEVEL_M", "2.50")
)

DEFAULT_STATION_ID = int(
    os.getenv("DEFAULT_STATION_ID", "1")
)

SUPABASE_WRITE_INTERVAL = max(
    1,
    int(os.getenv("SUPABASE_WRITE_INTERVAL", "5")),
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

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"
    "fflags;nobuffer|"
    "flags;low_delay|"
    "max_delay;0"
)


# =========================================================
# Flask application
# =========================================================

app = Flask(__name__)
CORS(app)


# =========================================================
# Shared state
# =========================================================

frame_lock = threading.Lock()
state_lock = threading.Lock()
station_lock = threading.Lock()

latest_jpeg: bytes | None = None
latest_frame_at: str | None = None
latest_water_mask: np.ndarray | None = None

camera_connected = False
camera_error: str | None = None

capture_thread: threading.Thread | None = None
stop_event = threading.Event()

yolo_model: YOLO | None = None
yolo_error: str | None = None

supabase: Client | None = None
supabase_error: str | None = None

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
    "waterline_y": None,
    "frame_width": None,
    "frame_height": None,
    "objects": [],
    "detected_at": None,
    "latest_frame_at": None,
    "error": None,
}


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

        print(f"YOLO loading error: {yolo_error}")


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

        print(f"Supabase connection error: {supabase_error}")


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
# Camera helpers
# =========================================================

def build_rtsp_url() -> str:
    if not CAMERA_USERNAME:
        raise RuntimeError("CAMERA_USERNAME is missing.")

    if not CAMERA_PASSWORD:
        raise RuntimeError("CAMERA_PASSWORD is missing.")

    if not CAMERA_IP:
        raise RuntimeError("CAMERA_IP is missing.")

    username = quote(CAMERA_USERNAME, safe="")
    password = quote(CAMERA_PASSWORD, safe="")

    stream_path = CAMERA_STREAM_PATH

    if not stream_path.startswith("/"):
        stream_path = f"/{stream_path}"

    return (
        f"rtsp://{username}:{password}"
        f"@{CAMERA_IP}:554{stream_path}"
    )


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

    success, frame = capture.read()

    if not success or frame is None:
        capture.release()
        return None

    capture.set(
        cv2.CAP_PROP_FRAME_WIDTH,
        CAMERA_WIDTH,
    )

    capture.set(
        cv2.CAP_PROP_FRAME_HEIGHT,
        CAMERA_HEIGHT,
    )

    capture.set(
        cv2.CAP_PROP_FPS,
        CAMERA_FPS,
    )

    capture.set(
        cv2.CAP_PROP_BUFFERSIZE,
        1,
    )

    return capture


def open_camera() -> cv2.VideoCapture:
    if CAMERA_SOURCE == "webcam":
        print("Searching for an available webcam...")

        camera_indices = [
            CAMERA_INDEX,
            *[
                index
                for index in range(5)
                if index != CAMERA_INDEX
            ],
        ]

        if os.name == "nt":
            backends = [
                ("MSMF", cv2.CAP_MSMF),
                ("DSHOW", cv2.CAP_DSHOW),
                ("AUTO", cv2.CAP_ANY),
            ]
        else:
            backends = [
                ("AUTO", cv2.CAP_ANY),
            ]

        for camera_index in camera_indices:
            for backend_name, backend in backends:
                print(
                    f"Trying webcam index {camera_index} "
                    f"using {backend_name}..."
                )

                capture = try_webcam(
                    camera_index,
                    backend,
                )

                if capture is not None:
                    print(
                        f"Webcam found at index {camera_index} "
                        f"using {backend_name}."
                    )

                    return capture

        raise RuntimeError(
            "No usable webcam was found."
        )

    if CAMERA_SOURCE == "rtsp":
        rtsp_url = build_rtsp_url()

        print("Opening Tapo RTSP camera...")

        capture = cv2.VideoCapture(
            rtsp_url,
            cv2.CAP_FFMPEG,
        )

        capture.set(
            cv2.CAP_PROP_BUFFERSIZE,
            1,
        )

        return capture

    raise RuntimeError(
        "Invalid CAMERA_SOURCE. "
        "Use 'webcam' or 'rtsp'."
    )


def update_camera_state(
    connected: bool,
    error: str | None = None,
) -> None:
    global camera_connected
    global camera_error

    camera_connected = connected
    camera_error = error


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


def calculate_waterline(
    water_mask: np.ndarray,
) -> int | None:
    height, width = water_mask.shape[:2]

    for row in range(
        int(height * 0.05),
        int(height * 0.95),
    ):
        row_coverage = (
            np.count_nonzero(water_mask[row])
            / max(1, width)
        )

        if row_coverage >= 0.30:
            return row

    return None


def waterline_to_level(
    waterline_y: int | None,
    frame_height: int,
) -> float:
    if waterline_y is None:
        return 0.0

    ratio = (
        frame_height - waterline_y
    ) / max(1, frame_height)

    level = (
        MIN_LEVEL_M
        + ratio * (MAX_LEVEL_M - MIN_LEVEL_M)
    )

    return round(
        max(
            MIN_LEVEL_M,
            min(MAX_LEVEL_M, level),
        ),
        2,
    )


def determine_level_status(
    level_m: float,
    detected: bool,
) -> str:
    if not detected:
        return "no_detection"

    return "ok"


def run_yolo_detection(
    frame: np.ndarray,
) -> tuple[dict, np.ndarray]:
    frame_height, frame_width = frame.shape[:2]

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
            "objects": [],
            "detected_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "latest_frame_at": latest_frame_at,
            "error": yolo_error,
        }

        return result, empty_mask

    prediction = yolo_model.predict(
        source=frame,
        conf=YOLO_CONFIDENCE,
        verbose=False,
    )[0]

    water_mask = empty_mask.copy()
    flood_class_ids = get_flood_class_ids()

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

            mask_array = (
                mask_tensor
                .detach()
                .cpu()
                .numpy()
            )

            resized_mask = cv2.resize(
                mask_array,
                (frame_width, frame_height),
                interpolation=cv2.INTER_NEAREST,
            )

            binary_mask = (
                resized_mask > 0.5
            ).astype(np.uint8)

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
        "objects": objects,
        "detected_at": detected_at,
        "latest_frame_at": latest_frame_at,
        "error": None,
    }

    return result, water_mask


# =========================================================
# Frame annotation
# =========================================================

def level_to_y(
    level_m: float,
    frame_height: int,
) -> int:
    ratio = (
        level_m - MIN_LEVEL_M
    ) / max(
        0.001,
        MAX_LEVEL_M - MIN_LEVEL_M,
    )

    ratio = max(0.0, min(1.0, ratio))

    return int(
        frame_height
        - ratio * frame_height
    )


def annotate_frame(
    frame: np.ndarray,
    detection: dict,
    water_mask: np.ndarray | None,
) -> np.ndarray:
    output = frame.copy()
    frame_height, frame_width = output.shape[:2]

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

def write_detection_to_supabase(
    detection: dict,
) -> None:
    global supabase_error

    if supabase is None:
        return

    station_id = int(
        detection["station_id"]
    )

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
    status = detection.get(
        "status",
        "no_detection",
    )

    detected_at = detection.get(
        "detected_at"
    ) or datetime.now(
        timezone.utc
    ).isoformat()

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
                "status": status,
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
                "status": status,
                "snapshot_path": None,
                "detected_at": detected_at,
            }
        ).execute()

        supabase_error = None

        print(
            "Supabase saved | "
            f"station={station_id} "
            f"level={level_m:.2f}m "
            f"coverage={water_coverage:.1f}% "
            f"confidence={confidence:.2f}"
        )

    except Exception as error:
        supabase_error = str(error)

        print(
            f"Supabase write error: {supabase_error}"
        )


# =========================================================
# Camera capture thread
# =========================================================

def camera_capture_loop() -> None:
    global latest_jpeg
    global latest_frame_at
    global latest_water_mask
    global latest_detection

    frame_counter = 0
    last_database_write = 0.0

    while not stop_event.is_set():
        capture: cv2.VideoCapture | None = None

        try:
            capture = open_camera()

            if not capture.isOpened():
                raise RuntimeError(
                    "OpenCV could not open the camera."
                )

            print("Camera connected successfully.")
            update_camera_state(True)

            while not stop_event.is_set():
                success, frame = capture.read()

                if not success or frame is None:
                    raise RuntimeError(
                        "Camera stopped returning frames."
                    )

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

        except Exception as error:
            error_message = str(error)

            print(f"Camera error: {error_message}")

            update_camera_state(
                False,
                error_message,
            )

            with state_lock:
                latest_detection = {
                    **latest_detection,
                    "camera_connected": False,
                    "status": "error",
                    "error": error_message,
                }

            time.sleep(3)

        finally:
            if capture is not None:
                capture.release()


def start_capture_thread() -> None:
    global capture_thread

    if capture_thread and capture_thread.is_alive():
        return

    stop_event.clear()

    capture_thread = threading.Thread(
        target=camera_capture_loop,
        name="AquaGuardCameraCapture",
        daemon=True,
    )

    capture_thread.start()


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
            "camera_source": CAMERA_SOURCE,
            "video_endpoint": "/video_feed",
            "health_endpoint": "/health",
            "detection_endpoint": "/latest_detection",
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

    return jsonify(
        {
            "service": "AquaGuard Camera API",
            "running": True,
            "station_id": station_id,
            "camera_source": CAMERA_SOURCE,
            "camera_connected": camera_connected,
            "latest_frame_at": latest_frame_at,
            "camera_error": camera_error,
            "yolo_enabled": YOLO_ENABLED,
            "yolo_loaded": yolo_model is not None,
            "yolo_error": yolo_error,
            "supabase_connected": (
                supabase is not None
            ),
            "supabase_error": supabase_error,
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

    with state_lock:
        response_data = dict(latest_detection)

    response_data.update(
        {
            "camera_connected": camera_connected,
            "latest_frame_at": latest_frame_at,
            "camera_error": camera_error,
            "yolo_loaded": yolo_model is not None,
            "yolo_error": yolo_error,
            "supabase_connected": (
                supabase is not None
            ),
            "supabase_error": supabase_error,
        }
    )

    return jsonify(response_data)


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


# =========================================================
# Application entry point
# =========================================================

if __name__ == "__main__":
    load_yolo_model()
    connect_supabase()
    start_capture_thread()

    print("=" * 62)
    print("AquaGuard Camera + YOLO Service")
    print(f"Source: {CAMERA_SOURCE}")
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
    print("=" * 62)

    app.run(
        host=FLASK_HOST,
        port=FLASK_PORT,
        debug=False,
        threaded=True,
        use_reloader=False,
    )