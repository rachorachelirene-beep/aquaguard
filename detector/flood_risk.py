"""Explainable combined flood-risk assessment for AquaGuard.

The engine in this module is an AquaGuard prototype heuristic.  Its weights
and thresholds are configurable engineering defaults and are not presented as
hydrological safety standards or as a scientifically validated prediction
model.  Station water-level thresholds remain the primary safety mechanism.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any


METHOD = "rule_based_heuristic"
METHOD_LABEL = "AquaGuard rule-based flood-risk heuristic"
DISCLAIMER = (
    "Rule-based monitoring indicator; not a scientifically validated "
    "flood prediction model."
)

# AquaGuard prototype heuristic weights. Local measurements and camera
# observations deliberately dominate weather support.
WATER_WEIGHT = 55.0
YOLO_WEIGHT = 25.0
WEATHER_WEIGHT = 20.0

# Water component breakpoints within its 55-point allocation. The station's
# own normal/warning/critical levels define the bands; these are only points.
WATER_NORMAL_BAND_POINTS = 8.0
WATER_WARNING_EDGE_POINTS = 45.0

# Positive segmentation has a conservative base contribution. Confidence is
# detector confidence, not a probability of flooding. Coverage is normalized
# against an adjustable prototype reference area.
YOLO_DETECTION_BASE_FRACTION = 0.35
YOLO_CONFIDENCE_FRACTION = 0.40
YOLO_COVERAGE_FRACTION = 0.25
YOLO_STRONG_COVERAGE_PERCENT = 40.0

# Prototype rainfall defaults for early-warning support. They are intentionally
# not labelled as PAGASA or scientifically validated rainfall thresholds.
RAIN_1H_ELEVATED_MM = 3.0
RAIN_1H_HIGH_MM = 8.0
RAIN_6H_ELEVATED_MM = 10.0
RAIN_6H_HIGH_MM = 25.0

WEATHER_FRESHNESS_MINUTES = 30.0
THUNDERSTORM_WEATHER_CODES = {95, 96, 99}
RAIN_WEATHER_CODES = {
    51,
    53,
    55,
    56,
    57,
    61,
    63,
    65,
    66,
    67,
    80,
    81,
    82,
}

SCORE_NORMAL_MAX = 24
SCORE_MODERATE_MAX = 49
SCORE_HIGH_MAX = 74
SCORE_CRITICAL_MIN = 75
SCORE_WARNING_MIN = 50


def _finite_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    return number if math.isfinite(number) else None


def clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    return min(maximum, max(minimum, value))


def normalize_fraction(value: Any) -> float | None:
    """Normalize either 0..1 or 0..100 inputs to a 0..1 fraction."""

    number = _finite_number(value)

    if number is None:
        return None

    if number > 1.0:
        number /= 100.0

    return clamp(number, 0.0, 1.0)


def normalize_percentage(value: Any) -> float | None:
    number = _finite_number(value)

    if number is None:
        return None

    if 0.0 <= number <= 1.0:
        number *= 100.0

    return clamp(number, 0.0, 100.0)


def _nonnegative(value: Any) -> float | None:
    number = _finite_number(value)
    return None if number is None else max(0.0, number)


def _parse_timestamp(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(
                value.strip().replace("Z", "+00:00")
            )
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _calculation_time(value: Any) -> datetime:
    return _parse_timestamp(value) or datetime.now(timezone.utc)


def _valid_thresholds(
    normal_level: Any,
    warning_level: Any,
    critical_level: Any,
) -> tuple[float, float, float] | None:
    normal = _finite_number(normal_level)
    warning = _finite_number(warning_level)
    critical = _finite_number(critical_level)

    if normal is None or warning is None or critical is None:
        return None

    if normal < 0 or not normal < warning < critical:
        return None

    return normal, warning, critical


def classify_risk_score(score: Any) -> dict[str, str]:
    """Classify an assessed numeric score using AquaGuard's four bands."""

    numeric = _finite_number(score)

    if numeric is None:
        return {
            "level": "not_assessed",
            "label": "Not assessed",
        }

    bounded = int(round(clamp(numeric, 0.0, 100.0)))

    if bounded >= SCORE_CRITICAL_MIN:
        return {
            "level": "critical",
            "label": "Critical",
        }

    if bounded > SCORE_MODERATE_MAX:
        return {
            "level": "high",
            "label": "High / Warning",
        }

    if bounded > SCORE_NORMAL_MAX:
        return {
            "level": "moderate",
            "label": "Moderate",
        }

    return {
        "level": "normal",
        "label": "Normal",
    }


def _factor(
    name: str,
    value: str,
    impact: str,
    detail: str | None = None,
) -> dict[str, str]:
    factor = {
        "name": name,
        "value": value,
        "impact": impact,
    }

    if detail:
        factor["detail"] = detail

    return factor


def not_assessed_flood_risk(
    reason: str = "Insufficient monitoring data.",
    *,
    calculated_at: Any = None,
    factors: list[dict[str, str]] | None = None,
    limitations: list[str] | None = None,
) -> dict[str, Any]:
    timestamp = _calculation_time(calculated_at)

    return {
        "score": None,
        "level": "not_assessed",
        "label": "Not assessed",
        "assessed": False,
        "method": METHOD,
        "method_label": METHOD_LABEL,
        "disclaimer": DISCLAIMER,
        "primary_reason": reason,
        "supporting_reasons": [],
        "factors": factors or [],
        "components": {
            "water": None,
            "yolo": None,
            "weather": None,
        },
        "weather": {
            "status": "unavailable",
            "age_minutes": None,
        },
        "limitations": limitations or [reason],
        "calculated_at": timestamp.isoformat(),
    }


def _water_component(
    level: float,
    normal: float,
    warning: float,
    critical: float,
) -> float:
    if level < normal:
        if normal <= 0:
            return 0.0

        return WATER_NORMAL_BAND_POINTS * clamp(
            level / normal,
            0.0,
            1.0,
        )

    if level < warning:
        progress = (level - normal) / (warning - normal)
        return WATER_NORMAL_BAND_POINTS + (
            WATER_WARNING_EDGE_POINTS
            - WATER_NORMAL_BAND_POINTS
        ) * clamp(progress, 0.0, 1.0)

    if level < critical:
        progress = (level - warning) / (critical - warning)
        return WATER_WARNING_EDGE_POINTS + (
            WATER_WEIGHT - WATER_WARNING_EDGE_POINTS
        ) * clamp(progress, 0.0, 1.0)

    return WATER_WEIGHT


def _rain_strength(
    value: float | None,
    elevated_at: float,
    high_at: float,
) -> float:
    if value is None or value <= 0:
        return 0.0

    if value < elevated_at:
        return 0.4 * (value / elevated_at)

    return 0.4 + 0.6 * clamp(
        (value - elevated_at) / (high_at - elevated_at),
        0.0,
        1.0,
    )


def _rain_impact(
    value: float,
    elevated_at: float,
    high_at: float,
) -> str:
    if value >= high_at:
        return "high"

    if value >= elevated_at:
        return "elevated"

    return "neutral"


def calculate_combined_flood_risk(
    *,
    water_level: Any = None,
    normal_level: Any = None,
    warning_level: Any = None,
    critical_level: Any = None,
    threshold_source: str = "station",
    detector_status: Any = None,
    yolo_available: bool | None = None,
    flood_detected: bool | None = None,
    yolo_confidence: Any = None,
    water_coverage: Any = None,
    rain_1h: Any = None,
    rain_6h: Any = None,
    weather_code: Any = None,
    condition_text: Any = None,
    weather_recorded_at: Any = None,
    calculated_at: Any = None,
) -> dict[str, Any]:
    """Calculate an explainable, conservative combined monitoring score."""

    now = _calculation_time(calculated_at)
    factors: list[dict[str, str]] = []
    limitations: list[str] = []
    supporting_reasons: list[str] = []

    status = str(detector_status or "").strip().lower()
    level = _nonnegative(water_level)
    thresholds = _valid_thresholds(
        normal_level,
        warning_level,
        critical_level,
    )
    water_points: float | None = None
    water_valid = level is not None and thresholds is not None
    water_warning_override = False
    water_critical_override = False

    if water_valid and thresholds is not None and level is not None:
        normal, warning, critical = thresholds
        water_points = _water_component(
            level,
            normal,
            warning,
            critical,
        )
        water_warning_override = level >= warning
        water_critical_override = level >= critical

        if water_critical_override:
            water_impact = "critical"
        elif water_warning_override:
            water_impact = "high"
        elif level >= normal:
            water_impact = "elevated"
        else:
            water_impact = "neutral"

        factors.append(
            _factor(
                "Water level",
                f"{level:.2f} m",
                water_impact,
                (
                    f"Station warning {warning:.2f} m; "
                    f"critical {critical:.2f} m."
                ),
            )
        )
    elif level is not None:
        factors.append(
            _factor(
                "Water level",
                f"{level:.2f} m",
                "unavailable",
                "Station thresholds are unavailable or invalid.",
            )
        )
        limitations.append(
            "Water level could not be scored because station thresholds "
            "are unavailable or invalid."
        )
    else:
        factors.append(
            _factor(
                "Water level",
                "Unavailable",
                "unavailable",
                "No usable waterline measurement was produced.",
            )
        )
        limitations.append("Water-level measurement is unavailable.")

    if threshold_source != "station":
        limitations.append(
            "Station-specific thresholds were unavailable; detector "
            "safety defaults were used."
        )

    if yolo_available is None:
        yolo_available = any(
            value is not None
            for value in (
                flood_detected,
                yolo_confidence,
                water_coverage,
            )
        )

    confidence = normalize_fraction(yolo_confidence)
    coverage = normalize_percentage(water_coverage)
    detected = bool(flood_detected) if yolo_available else False
    yolo_points: float | None = None

    if yolo_available:
        yolo_points = 0.0
        factors.append(
            _factor(
                "Floodwater detected",
                "Yes" if detected else "No",
                "elevated" if detected else "neutral",
            )
        )

        if confidence is not None:
            factors.append(
                _factor(
                    "YOLO confidence",
                    f"{confidence * 100:.0f}%",
                    "elevated" if detected else "neutral",
                    "Detection-model confidence, not flood probability.",
                )
            )

        if coverage is not None:
            factors.append(
                _factor(
                    "Water coverage",
                    f"{coverage:.1f}%",
                    "elevated" if detected else "neutral",
                )
            )

        if detected:
            confidence_strength = confidence or 0.0
            coverage_strength = clamp(
                (coverage or 0.0) / YOLO_STRONG_COVERAGE_PERCENT,
                0.0,
                1.0,
            )
            yolo_strength = (
                YOLO_DETECTION_BASE_FRACTION
                + YOLO_CONFIDENCE_FRACTION
                * confidence_strength
                + YOLO_COVERAGE_FRACTION
                * coverage_strength
            )
            yolo_points = YOLO_WEIGHT * clamp(
                yolo_strength,
                0.0,
                1.0,
            )
            supporting_reasons.append(
                "Floodwater was detected by the camera model."
            )
    else:
        factors.append(
            _factor(
                "Floodwater detection",
                "Unavailable",
                "unavailable",
            )
        )
        limitations.append("YOLO flood detection is unavailable.")

    rain_one_hour = _nonnegative(rain_1h)
    rain_six_hours = _nonnegative(rain_6h)
    code_number = _finite_number(weather_code)
    code = int(code_number) if code_number is not None else None
    condition = str(condition_text or "").strip()
    weather_time = _parse_timestamp(weather_recorded_at)
    weather_age_minutes: float | None = None
    weather_status = "unavailable"
    weather_points: float | None = None

    has_weather_values = any(
        value is not None
        for value in (
            rain_one_hour,
            rain_six_hours,
            code,
        )
    ) or bool(condition)

    if has_weather_values and weather_time is not None:
        weather_age_minutes = max(
            0.0,
            (now - weather_time).total_seconds() / 60.0,
        )

        if weather_age_minutes <= WEATHER_FRESHNESS_MINUTES:
            weather_status = "current"
            one_hour_strength = _rain_strength(
                rain_one_hour,
                RAIN_1H_ELEVATED_MM,
                RAIN_1H_HIGH_MM,
            )
            six_hour_strength = _rain_strength(
                rain_six_hours,
                RAIN_6H_ELEVATED_MM,
                RAIN_6H_HIGH_MM,
            )
            weather_strength = max(
                one_hour_strength,
                six_hour_strength,
            )

            condition_lower = condition.lower()

            if (
                code in THUNDERSTORM_WEATHER_CODES
                or "thunder" in condition_lower
            ):
                weather_strength = max(weather_strength, 0.75)
            elif (
                code in RAIN_WEATHER_CODES
                or "rain" in condition_lower
                or "drizzle" in condition_lower
            ):
                weather_strength = max(weather_strength, 0.35)

            weather_points = WEATHER_WEIGHT * clamp(
                weather_strength,
                0.0,
                1.0,
            )

            if rain_six_hours is not None:
                factors.append(
                    _factor(
                        "Rainfall 6h",
                        f"{rain_six_hours:.1f} mm",
                        _rain_impact(
                            rain_six_hours,
                            RAIN_6H_ELEVATED_MM,
                            RAIN_6H_HIGH_MM,
                        ),
                    )
                )

            if rain_one_hour is not None:
                factors.append(
                    _factor(
                        "Rainfall 1h",
                        f"{rain_one_hour:.1f} mm",
                        _rain_impact(
                            rain_one_hour,
                            RAIN_1H_ELEVATED_MM,
                            RAIN_1H_HIGH_MM,
                        ),
                    )
                )

            if condition:
                factors.append(
                    _factor(
                        "Weather condition",
                        condition,
                        (
                            "elevated"
                            if weather_strength >= 0.35
                            else "neutral"
                        ),
                    )
                )

            if weather_strength >= 0.4:
                supporting_reasons.append(
                    "Recent rainfall or current weather adds early-risk "
                    "support."
                )
        else:
            weather_status = "stale"
            factors.append(
                _factor(
                    "Weather data",
                    f"{weather_age_minutes:.0f} minutes old",
                    "stale",
                    "Stale weather is excluded from the score.",
                )
            )
            limitations.append("Weather data is stale.")
    elif has_weather_values:
        factors.append(
            _factor(
                "Weather data",
                "Timestamp unavailable",
                "unavailable",
            )
        )
        limitations.append(
            "Weather data was excluded because its timestamp is unavailable."
        )
    else:
        factors.append(
            _factor(
                "Weather data",
                "Unavailable",
                "unavailable",
            )
        )
        limitations.append("Weather data is unavailable.")

    detector_critical_override = status == "critical"
    detector_warning_override = status == "warning"
    has_local_evidence = (
        water_valid
        or detected
        or detector_critical_override
        or detector_warning_override
    )

    if not has_local_evidence:
        result = not_assessed_flood_risk(
            (
                "No usable water-level measurement or positive camera "
                "detection is available."
            ),
            calculated_at=now,
            factors=factors,
            limitations=limitations,
        )

        result["components"] = {
            "water": None,
            "yolo": (
                round(yolo_points, 2)
                if yolo_points is not None
                else None
            ),
            "weather": (
                round(weather_points, 2)
                if weather_points is not None
                else None
            ),
        }
        result["weather"] = {
            "status": weather_status,
            "age_minutes": (
                round(weather_age_minutes, 1)
                if weather_age_minutes is not None
                else None
            ),
        }

        return result

    raw_score = sum(
        value or 0.0
        for value in (
            water_points,
            yolo_points,
            weather_points,
        )
    )

    if detected and not water_valid:
        raw_score = max(raw_score, 25.0)

    critical_override = (
        water_critical_override
        or detector_critical_override
    )
    warning_override = (
        water_warning_override
        or detector_warning_override
    )

    if critical_override:
        score = max(raw_score, SCORE_CRITICAL_MIN)
    elif warning_override:
        score = max(raw_score, SCORE_WARNING_MIN)
        score = min(score, SCORE_HIGH_MAX)
    else:
        # Weather and early YOLO evidence may escalate monitoring, but cannot
        # create a Critical state without an existing severe local condition.
        score = min(raw_score, SCORE_HIGH_MAX)

    bounded_score = int(round(clamp(score, 0.0, 100.0)))
    classification = classify_risk_score(bounded_score)

    if critical_override:
        primary_reason = (
            "Critical because the water level reached the critical "
            "threshold."
            if water_critical_override
            else "Critical because the existing detector status is critical."
        )
    elif warning_override:
        primary_reason = (
            "High / Warning because the water level reached the station "
            "warning threshold."
            if water_warning_override
            else "High / Warning because the existing detector status is warning."
        )
    elif water_points is not None and water_points >= max(
        yolo_points or 0.0,
        weather_points or 0.0,
    ):
        primary_reason = (
            "Water level is the strongest current monitoring factor."
        )
    elif yolo_points is not None and yolo_points >= (
        weather_points or 0.0
    ):
        primary_reason = (
            "Camera floodwater evidence is the strongest current factor."
        )
    else:
        primary_reason = (
            "Recent rainfall or weather is the strongest supporting factor."
        )

    return {
        "score": bounded_score,
        "level": classification["level"],
        "label": classification["label"],
        "assessed": True,
        "method": METHOD,
        "method_label": METHOD_LABEL,
        "disclaimer": DISCLAIMER,
        "primary_reason": primary_reason,
        "supporting_reasons": supporting_reasons,
        "factors": factors,
        "components": {
            "water": (
                round(water_points, 2)
                if water_points is not None
                else None
            ),
            "yolo": (
                round(yolo_points, 2)
                if yolo_points is not None
                else None
            ),
            "weather": (
                round(weather_points, 2)
                if weather_points is not None
                else None
            ),
        },
        "weather": {
            "status": weather_status,
            "age_minutes": (
                round(weather_age_minutes, 1)
                if weather_age_minutes is not None
                else None
            ),
        },
        "limitations": limitations,
        "calculated_at": now.isoformat(),
    }
