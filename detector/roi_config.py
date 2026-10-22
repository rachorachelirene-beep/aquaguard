"""Validated local ROI calibration persistence. Per-station or global."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

try:
    from .water_roi import parse_roi_points
except ImportError:
    from water_roi import parse_roi_points


class RoiConfigStore:
    def __init__(self, path: Path | str):
        self.path = Path(path)

    def load(self) -> dict[str, Any]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def save(self, config: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=".roi_config_",
                suffix=".tmp",
                delete=False,
            ) as file:
                temporary = Path(file.name)
                json.dump(config, file, indent=2, allow_nan=False)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
            temporary = None
        finally:
            if temporary and temporary.exists():
                try:
                    temporary.unlink()
                except OSError:
                    pass


def validate_roi_config(payload: Any) -> dict[str, Any]:
    """Validate ROI configuration payload.

    Expected format:
    {
        "roi_enabled": bool,
        "stations": {
            "1": "x,y;x,y;...",
            "default": "x,y;..."
        }
    }
    or single station update:
    {
        "station_id": int | str,
        "roi_points": "x,y;x,y;...",
        "roi_enabled": bool
    }
    """
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object.")

    result: dict[str, Any] = {}

    # Handle single station update
    if "station_id" in payload or "roi_points" in payload:
        station_id = str(payload.get("station_id", "default")).strip()
        roi_points = str(payload.get("roi_points", "")).strip()
        enabled = payload.get("roi_enabled", True)
        if isinstance(enabled, str):
            enabled = enabled.lower() in ("true", "1", "yes")

        if roi_points:
            # Validate geometry
            parse_roi_points(roi_points)

        return {
            "station_id": station_id,
            "roi_points": roi_points,
            "roi_enabled": bool(enabled),
        }

    # Handle full config dictionary
    stations = payload.get("stations", {})
    if not isinstance(stations, dict):
        raise ValueError("Stations must be a dictionary mapping station_id to points string.")

    cleaned_stations = {}
    for st_id, points_str in stations.items():
        st_key = str(st_id).strip()
        pts = str(points_str).strip()
        if pts:
            parse_roi_points(pts)
        cleaned_stations[st_key] = pts

    result["stations"] = cleaned_stations
    result["roi_enabled"] = bool(payload.get("roi_enabled", True))
    return result

