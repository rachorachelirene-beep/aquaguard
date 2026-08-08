from __future__ import annotations

import math
import os

import cv2
import numpy as np


GaugePoints = tuple[
    tuple[float, float],
    tuple[float, float],
    tuple[float, float],
    tuple[float, float],
]


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


MIN_LEVEL_M = env_float("MIN_LEVEL_M", 0.0)
MAX_LEVEL_M = env_float("MAX_LEVEL_M", 3.0)
NORMAL_LEVEL_M = env_float("NORMAL_LEVEL_M", 1.0)
WARNING_LEVEL_M = env_float("WARNING_LEVEL_M", 2.0)
CRITICAL_LEVEL_M = env_float("CRITICAL_LEVEL_M", 2.5)

GAUGE_ENABLED = env_bool("GAUGE_ENABLED", True)
GAUGE_POINTS = os.getenv(
    "GAUGE_POINTS",
    "0.70,0.12;0.80,0.13;0.75,0.88;0.64,0.87",
).strip()
GAUGE_TICK_INTERVAL_M = max(
    0.05, env_float("GAUGE_TICK_INTERVAL_M", 0.25)
)
GAUGE_LABEL_INTERVAL_M = max(
    GAUGE_TICK_INTERVAL_M,
    env_float("GAUGE_LABEL_INTERVAL_M", 0.50),
)
WATERLINE_ROW_COVERAGE = min(
    0.95, max(0.01, env_float("WATERLINE_ROW_COVERAGE", 0.30))
)
WATERLINE_FALLBACK_ROW_COVERAGE = min(
    WATERLINE_ROW_COVERAGE,
    max(0.01, env_float("WATERLINE_FALLBACK_ROW_COVERAGE", 0.08)),
)


def parse_gauge_points() -> GaugePoints | None:
    if not GAUGE_ENABLED:
        return None

    raw_points = [
        point.strip()
        for point in GAUGE_POINTS.replace("|", ";").split(";")
        if point.strip()
    ]
    if len(raw_points) != 4:
        return None

    parsed: list[tuple[float, float]] = []
    try:
        for raw_point in raw_points:
            x_value, y_value = [
                float(value.strip()) for value in raw_point.split(",", 1)
            ]
            parsed.append((x_value, y_value))
    except ValueError:
        return None

    return parsed[0], parsed[1], parsed[2], parsed[3]


def resolve_gauge_points(
    frame_width: int,
    frame_height: int,
    camera_width: int,
    camera_height: int,
) -> GaugePoints | None:
    points = parse_gauge_points()
    if points is None:
        return None

    largest_coordinate = max(
        abs(coordinate) for point in points for coordinate in point
    )
    if largest_coordinate <= 1.5:
        return tuple(
            (point[0] * frame_width, point[1] * frame_height)
            for point in points
        )  # type: ignore[return-value]

    x_scale = frame_width / max(1, camera_width)
    y_scale = frame_height / max(1, camera_height)
    return tuple(
        (point[0] * x_scale, point[1] * y_scale) for point in points
    )  # type: ignore[return-value]


def serialize_gauge_points(
    gauge_points: GaugePoints | None,
) -> list[list[int]] | None:
    if gauge_points is None:
        return None
    return [
        [int(round(x_value)), int(round(y_value))]
        for x_value, y_value in gauge_points
    ]


def level_to_ratio(level_m: float) -> float:
    ratio = (level_m - MIN_LEVEL_M) / max(
        0.001, MAX_LEVEL_M - MIN_LEVEL_M
    )
    return max(0.0, min(1.0, ratio))


def interpolate_point(
    start: tuple[float, float],
    end: tuple[float, float],
    ratio: float,
) -> tuple[int, int]:
    return (
        int(round(start[0] + (end[0] - start[0]) * ratio)),
        int(round(start[1] + (end[1] - start[1]) * ratio)),
    )


def gauge_edge_points_at_ratio(
    gauge_points: GaugePoints,
    ratio: float,
) -> tuple[tuple[int, int], tuple[int, int]]:
    top_left, top_right, bottom_right, bottom_left = gauge_points
    return (
        interpolate_point(bottom_left, top_left, ratio),
        interpolate_point(bottom_right, top_right, ratio),
    )


def gauge_centerline_y(gauge_points: GaugePoints, ratio: float) -> int:
    left_point, right_point = gauge_edge_points_at_ratio(gauge_points, ratio)
    return int(round((left_point[1] + right_point[1]) / 2))


def calculate_waterline(water_mask: np.ndarray) -> int | None:
    height, width = water_mask.shape[:2]
    row_counts = np.count_nonzero(water_mask, axis=1)
    search_start = int(height * 0.05)
    search_end = int(height * 0.95)
    required_pixels = max(1, int(width * WATERLINE_ROW_COVERAGE))

    for row in range(search_start, search_end):
        if row_counts[row] >= required_pixels:
            return row

    fallback_pixels = max(
        1, int(width * WATERLINE_FALLBACK_ROW_COVERAGE)
    )
    fallback_rows = np.flatnonzero(
        row_counts[search_start:search_end] >= fallback_pixels
    )
    if fallback_rows.size > 0:
        return int(search_start + fallback_rows[0])
    return None


def waterline_to_level(
    waterline_y: int | None,
    frame_height: int,
    gauge_points: GaugePoints | None = None,
) -> float:
    if waterline_y is None:
        return 0.0

    if gauge_points is not None:
        top_left, top_right, bottom_right, bottom_left = gauge_points
        top_y = (top_left[1] + top_right[1]) / 2
        bottom_y = (bottom_left[1] + bottom_right[1]) / 2
        gauge_span = top_y - bottom_y
        ratio = (
            (waterline_y - bottom_y) / gauge_span
            if abs(gauge_span) >= 1
            else 0.0
        )
    else:
        ratio = (frame_height - waterline_y) / max(1, frame_height)

    ratio = max(0.0, min(1.0, ratio))
    return round(MIN_LEVEL_M + ratio * (MAX_LEVEL_M - MIN_LEVEL_M), 2)


def level_to_y(
    level_m: float,
    frame_height: int,
    gauge_points: GaugePoints | None = None,
) -> int:
    ratio = level_to_ratio(level_m)
    if gauge_points is not None:
        return gauge_centerline_y(gauge_points, ratio)
    return int(frame_height - ratio * frame_height)


def is_label_tick(level_m: float, interval_m: float) -> bool:
    if interval_m <= 0:
        return False
    scaled = level_m / interval_m
    return abs(scaled - round(scaled)) < 0.02


def level_color(level_m: float) -> tuple[int, int, int]:
    if level_m >= CRITICAL_LEVEL_M:
        return (45, 45, 245)
    if level_m >= WARNING_LEVEL_M:
        return (0, 165, 255)
    return (55, 215, 135)


def draw_measurement_gauge(
    output: np.ndarray,
    detection: dict,
    gauge_points: GaugePoints | None,
) -> None:
    if gauge_points is None:
        return

    frame_height, frame_width = output.shape[:2]
    top_left, top_right, bottom_right, bottom_left = gauge_points
    gauge_polygon = np.array(
        [top_left, top_right, bottom_right, bottom_left], dtype=np.int32
    )
    overlay = output.copy()
    cv2.fillConvexPoly(overlay, gauge_polygon, (24, 32, 28))
    output[:] = cv2.addWeighted(overlay, 0.24, output, 0.76, 0)
    cv2.polylines(
        output, [gauge_polygon], True, (5, 12, 10), 4, cv2.LINE_AA
    )
    cv2.polylines(
        output, [gauge_polygon], True, (30, 245, 125), 2, cv2.LINE_AA
    )

    center_top = (
        int(round((top_left[0] + top_right[0]) / 2)),
        int(round((top_left[1] + top_right[1]) / 2)),
    )
    center_bottom = (
        int(round((bottom_left[0] + bottom_right[0]) / 2)),
        int(round((bottom_left[1] + bottom_right[1]) / 2)),
    )
    cv2.arrowedLine(
        output,
        center_bottom,
        center_top,
        (45, 245, 105),
        2,
        cv2.LINE_AA,
        tipLength=0.09,
    )

    level_m = (
        math.ceil(MIN_LEVEL_M / GAUGE_TICK_INTERVAL_M)
        * GAUGE_TICK_INTERVAL_M
    )
    for _ in range(220):
        if level_m > MAX_LEVEL_M + 0.001:
            break
        ratio = level_to_ratio(level_m)
        left_point, right_point = gauge_edge_points_at_ratio(
            gauge_points, ratio
        )
        major_tick = is_label_tick(level_m, GAUGE_LABEL_INTERVAL_M)
        tick_end = (
            right_point
            if major_tick
            else interpolate_point(left_point, right_point, 0.45)
        )
        tick_color = level_color(level_m)
        cv2.line(
            output,
            left_point,
            tick_end,
            tick_color,
            2 if major_tick else 1,
            cv2.LINE_AA,
        )
        if major_tick:
            label_x = right_point[0] + 6
            label_y = right_point[1] + 4
            if label_x + 54 > frame_width:
                label_x = max(4, left_point[0] - 58)
            if 10 <= label_y <= frame_height - 8:
                cv2.putText(
                    output,
                    f"{level_m:.1f}m",
                    (label_x, label_y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (235, 245, 240),
                    1,
                    cv2.LINE_AA,
                )
        level_m = round(level_m + GAUGE_TICK_INTERVAL_M, 6)

    threshold_lines = [
        (CRITICAL_LEVEL_M, "CRIT", (40, 40, 240)),
        (WARNING_LEVEL_M, "WARN", (0, 150, 255)),
        (NORMAL_LEVEL_M, "NORM", (50, 210, 150)),
    ]
    for level_m, label, color in threshold_lines:
        if level_m < MIN_LEVEL_M or level_m > MAX_LEVEL_M:
            continue
        left_point, right_point = gauge_edge_points_at_ratio(
            gauge_points, level_to_ratio(level_m)
        )
        cv2.line(
            output, left_point, right_point, color, 3, cv2.LINE_AA
        )
        label_x = max(4, left_point[0] - 50)
        label_y = max(14, min(frame_height - 8, left_point[1] + 4))
        cv2.putText(
            output,
            label,
            (label_x, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.36,
            color,
            1,
            cv2.LINE_AA,
        )

    if not detection.get("detected"):
        return

    current_level = float(detection.get("level_m") or 0)
    left_point, right_point = gauge_edge_points_at_ratio(
        gauge_points, level_to_ratio(current_level)
    )
    marker_color = level_color(current_level)
    cv2.line(
        output, left_point, right_point, (255, 235, 55), 3, cv2.LINE_AA
    )
    label_x = right_point[0] + 10
    label_y = right_point[1] - 8
    if label_x + 100 > frame_width:
        label_x = max(4, left_point[0] - 104)
    label_y = max(18, min(frame_height - 12, label_y))
    cv2.arrowedLine(
        output,
        (max(0, min(frame_width - 1, label_x - 6)), label_y + 8),
        right_point,
        marker_color,
        2,
        cv2.LINE_AA,
        tipLength=0.25,
    )
    cv2.putText(
        output,
        f"{current_level:.2f}m",
        (label_x, label_y),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (255, 250, 170),
        2,
        cv2.LINE_AA,
    )
