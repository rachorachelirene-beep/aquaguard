"""Critical water-level snapshot capture and audit manager for AquaGuard.

Handles debounced snapshot annotation, local storage, asynchronous
Supabase Storage upload, and alert_events audit logging.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np

LOGGER = logging.getLogger(__name__)

# Debounce cooldown: 3 minutes (180 seconds) per station
SNAPSHOT_COOLDOWN_SECONDS = 180.0
STORAGE_BUCKET_NAME = "flood-snapshots"
LOCAL_SNAPSHOTS_DIR = Path(__file__).resolve().parent / "snapshots"

# In-memory tracking of last snapshot timestamp per station
_last_snapshot_times: dict[int, float] = {}
_snapshot_lock = threading.Lock()


def get_last_snapshot_time(station_id: int) -> float:
    """Return the epoch timestamp of the last snapshot for a station."""
    with _snapshot_lock:
        return _last_snapshot_times.get(int(station_id), 0.0)


def reset_snapshot_cooldown(station_id: int | None = None) -> None:
    """Reset the cooldown timer for testing or administrative purposes."""
    with _snapshot_lock:
        if station_id is None:
            _last_snapshot_times.clear()
        else:
            _last_snapshot_times.pop(int(station_id), None)


def annotate_critical_frame(
    frame: np.ndarray,
    station_id: int,
    water_level: float,
    threshold: float,
    timestamp_str: str,
) -> np.ndarray:
    """Annotate OpenCV frame with high-contrast warning banner and red critical text."""
    annotated = frame.copy()
    height, width = annotated.shape[:2]

    # Draw semi-transparent dark banner at top for readability
    banner_height = max(50, int(height * 0.10))
    overlay = annotated.copy()
    cv2.rectangle(
        overlay,
        (0, 0),
        (width, banner_height),
        (15, 23, 42),  # Deep slate backdrop (BGR)
        -1,
    )
    cv2.addWeighted(overlay, 0.75, annotated, 0.25, 0, annotated)

    # Red accent stripe on bottom of banner
    cv2.line(
        annotated,
        (0, banner_height),
        (width, banner_height),
        (0, 0, 255),  # Pure red in BGR
        2,
    )

    # Primary critical warning text in red
    primary_text = (
        f"[CRITICAL FLOOD LEVEL] Station #{station_id} | "
        f"Level: {water_level:.2f}m (Threshold: {threshold:.2f}m)"
    )
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.5, min(0.9, width / 1400.0))
    thickness = 2

    # Red text (0, 0, 255) in BGR
    cv2.putText(
        annotated,
        primary_text,
        (16, int(banner_height * 0.48)),
        font,
        font_scale,
        (0, 0, 255),
        thickness,
        cv2.LINE_AA,
    )

    # Secondary timestamp and warning label
    secondary_text = f"Recorded: {timestamp_str} UTC | BDRRMC AquaGuard Automated Snapshot"
    cv2.putText(
        annotated,
        secondary_text,
        (16, int(banner_height * 0.85)),
        font,
        font_scale * 0.75,
        (220, 220, 220),
        1,
        cv2.LINE_AA,
    )

    return annotated


def _upload_and_record_audit(
    local_path: Path,
    image_bytes: bytes,
    storage_path: str,
    station_id: int,
    water_level: float,
    threshold: float,
    iso_timestamp: str,
    supabase_client: Any,
) -> None:
    """Worker function to upload to Supabase Storage and record in alert_events table."""
    public_url = ""
    try:
        if supabase_client is not None:
            # 1. Upload to Supabase Storage bucket
            try:
                supabase_client.storage.from_(STORAGE_BUCKET_NAME).upload(
                    path=storage_path,
                    file=image_bytes,
                    file_options={"content-type": "image/jpeg", "upsert": "true"},
                )
                public_url = supabase_client.storage.from_(
                    STORAGE_BUCKET_NAME
                ).get_public_url(storage_path)
                LOGGER.info(
                    "Snapshot uploaded to Supabase Storage: %s -> %s",
                    storage_path,
                    public_url,
                )
            except Exception as upload_err:
                LOGGER.warning(
                    "Failed to upload snapshot to Supabase Storage: %s",
                    upload_err,
                )

            # 2. Insert audit record into alert_events table
            try:
                audit_record = {
                    "station_id": int(station_id),
                    "water_level": round(float(water_level), 2),
                    "threshold": round(float(threshold), 2),
                    "image_url": public_url or str(local_path),
                    "created_at": iso_timestamp,
                }
                supabase_client.table("alert_events").insert(
                    audit_record
                ).execute()
                LOGGER.info(
                    "Inserted audit record into alert_events for station %s",
                    station_id,
                )
            except Exception as audit_err:
                # If alert_events table doesn't exist yet, log cleanly without interrupting
                LOGGER.warning(
                    "Could not insert into alert_events: %s",
                    audit_err,
                )
    except Exception as error:
        LOGGER.error(
            "Unexpected error in snapshot audit worker: %s",
            error,
        )


def handle_critical_snapshot(
    frame: np.ndarray,
    water_level: float,
    threshold: float,
    station_id: int,
    supabase_client: Any = None,
    snapshots_dir: Path | str | None = None,
    sync_upload: bool = False,
) -> dict[str, Any] | None:
    """Capture, annotate, locally save, and upload a critical water level snapshot.

    Args:
        frame: OpenCV image array (BGR).
        water_level: Measured water level in meters.
        threshold: Critical water level threshold in meters.
        station_id: Monitoring station identifier.
        supabase_client: Optional Supabase client instance (falls back to global stream_api.supabase).
        snapshots_dir: Optional custom directory to store local images (defaults to /snapshots).
        sync_upload: If True, execute storage upload synchronously (useful for tests).

    Returns:
        dict with metadata if snapshot was captured, or None if skipped/debounced.
    """
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return None

    try:
        numeric_level = float(water_level)
        numeric_threshold = float(threshold)
        station_key = int(station_id)
    except (TypeError, ValueError):
        return None

    # Condition 1: water_level must be >= critical threshold
    if numeric_level < numeric_threshold:
        return None

    # Condition 2: Debounce check (180 seconds cooldown per station)
    current_time = time.time()
    with _snapshot_lock:
        last_time = _last_snapshot_times.get(station_key, 0.0)
        if current_time - last_time < SNAPSHOT_COOLDOWN_SECONDS:
            LOGGER.debug(
                "Critical snapshot debounced for station %d (elapsed %.1fs < 180s)",
                station_key,
                current_time - last_time,
            )
            return None
        _last_snapshot_times[station_key] = current_time

    # Resolve target directory
    target_dir = Path(snapshots_dir) if snapshots_dir else LOCAL_SNAPSHOTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    # Format timestamps
    now_utc = datetime.now(timezone.utc)
    iso_timestamp = now_utc.isoformat()
    slug_timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    filename = f"critical_station_{station_key}_{slug_timestamp}.jpg"
    local_path = target_dir / filename
    storage_path = f"station_{station_key}/{filename}"

    # Annotate frame
    annotated_frame = annotate_critical_frame(
        frame=frame,
        station_id=station_key,
        water_level=numeric_level,
        threshold=numeric_threshold,
        timestamp_str=now_utc.strftime("%Y-%m-%d %H:%M:%S"),
    )

    # Encode and save to local disk
    success, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not success:
        LOGGER.error("Failed to JPEG encode critical snapshot frame.")
        return None

    image_bytes = buffer.tobytes()
    try:
        with open(local_path, "wb") as file_handle:
            file_handle.write(image_bytes)
        LOGGER.info(
            "Saved local critical snapshot to %s",
            local_path,
        )
    except OSError as err:
        LOGGER.error("Failed to write snapshot to %s: %s", local_path, err)
        return None

    # Resolve Supabase client if not passed explicitly
    active_client = supabase_client
    if active_client is None:
        try:
            from stream_api import supabase as stream_supabase  # type: ignore

            active_client = stream_supabase
        except Exception:
            active_client = None

    result = {
        "station_id": station_key,
        "water_level": numeric_level,
        "threshold": numeric_threshold,
        "local_path": str(local_path),
        "storage_path": storage_path,
        "filename": filename,
        "created_at": iso_timestamp,
    }

    # Upload & audit record asynchronously (or sync if requested)
    if sync_upload:
        _upload_and_record_audit(
            local_path=local_path,
            image_bytes=image_bytes,
            storage_path=storage_path,
            station_id=station_key,
            water_level=numeric_level,
            threshold=numeric_threshold,
            iso_timestamp=iso_timestamp,
            supabase_client=active_client,
        )
    else:
        worker_thread = threading.Thread(
            target=_upload_and_record_audit,
            args=(
                local_path,
                image_bytes,
                storage_path,
                station_key,
                numeric_level,
                numeric_threshold,
                iso_timestamp,
                active_client,
            ),
            name=f"SnapshotUpload-Station-{station_key}",
            daemon=True,
        )
        worker_thread.start()

    return result

