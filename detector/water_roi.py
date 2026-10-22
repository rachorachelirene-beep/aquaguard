"""Optional optical-water ROI filter for AquaGuard camera agent.

The ROI is a polygon of normalized image coordinates. This file does not
identify water; it simply excludes YOLO predictions outside a user-calibrated
area. It is an additional safeguard, not a replacement for model validation.
"""

from __future__ import annotations

import cv2
import numpy as np


def parse_roi_points(spec: str) -> np.ndarray:
    """Parse x,y;x,y;... and validate a simple, convex polygon."""
    try:
        points = [
            (float(pair.split(",")[0]), float(pair.split(",")[1]))
            for pair in spec.strip().split(";")
        ]
        coords = np.array(points, dtype=np.float32)
    except (ValueError, TypeError, IndexError) as error:
        raise ValueError("ROI must be x,y;x,y;x,y with normalized 0..1 coordinates") from error

    if coords.ndim != 2 or coords.shape[1] != 2 or not 3 <= len(coords) <= 12:
        raise ValueError("ROI needs 3 to 12 vertices")
    if not np.isfinite(coords).all() or (coords < 0).any() or (coords > 1).any():
        raise ValueError("ROI coordinates must be finite and between 0 and 1")
    if not cv2.isContourConvex(coords.reshape(-1, 1, 2)):
        raise ValueError("ROI points must form a convex polygon in boundary order")
    if cv2.contourArea(coords.reshape(-1, 1, 2)) < 0.0005:
        raise ValueError("ROI polygon is too small")
    return coords


def clip_water_mask_to_roi(mask: np.ndarray, spec: str) -> np.ndarray:
    """Retain candidate water only inside a calibrated ROI polygon.

    Input/output pixel values are binary (0 or 1). Small disconnected mask
    islands are omitted when an ROI is enabled. Empty spec is a strict no-op.
    """
    if not spec or not spec.strip():
        return mask
    points = parse_roi_points(spec)
    if mask is None or mask.ndim != 2 or mask.size == 0:
        raise ValueError("Expected a nonempty 2D YOLO water mask")

    height, width = mask.shape
    polygon = np.rint(points * np.array([width - 1, height - 1])).astype(np.int32)
    roi_mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(roi_mask, polygon, 1)
    clipped = (np.asarray(mask) > 0).astype(np.uint8) & roi_mask

    # Very small isolated predictions are rarely usable as surface evidence.
    # Important: even after this filter, YOLO results are NOT verified depths.
    roi_area = int(np.count_nonzero(roi_mask))
    minimum_area = max(4, round(roi_area * 0.001))
    number, labels, stats, _ = cv2.connectedComponentsWithStats(clipped, 8)
    accepted = np.zeros_like(clipped)
    for component in range(1, number):
        if stats[component, cv2.CC_STAT_AREA] >= minimum_area:
            accepted[labels == component] = 1
    return accepted
