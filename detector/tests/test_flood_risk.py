from __future__ import annotations

import unittest

from detector.flood_risk import (
    calculate_combined_flood_risk,
)


NOW = "2026-08-08T12:00:00+00:00"
FRESH_WEATHER = "2026-08-08T11:50:00+00:00"
STALE_WEATHER = "2026-08-08T10:00:00+00:00"


def assess(**overrides):
    values = {
        "water_level": 0.5,
        "normal_level": 1.0,
        "warning_level": 2.0,
        "critical_level": 2.5,
        "detector_status": "normal",
        "yolo_available": True,
        "flood_detected": False,
        "yolo_confidence": 0.0,
        "water_coverage": 0.0,
        "rain_1h": 0.0,
        "rain_6h": 0.0,
        "weather_code": 0,
        "condition_text": "Clear sky",
        "weather_recorded_at": FRESH_WEATHER,
        "calculated_at": NOW,
    }
    values.update(overrides)
    return calculate_combined_flood_risk(**values)


class FloodRiskTests(unittest.TestCase):
    def test_critical_water_overrides_everything(self):
        result = assess(
            water_level=2.6,
            detector_status="normal",
            yolo_available=False,
            rain_1h=0,
            rain_6h=0,
        )

        self.assertTrue(result["assessed"])
        self.assertEqual(result["level"], "critical")
        self.assertGreaterEqual(result["score"], 75)

    def test_warning_water_is_at_least_high(self):
        result = assess(
            water_level=2.1,
            yolo_available=False,
        )

        self.assertEqual(result["level"], "high")
        self.assertGreaterEqual(result["score"], 50)

    def test_normal_conditions_remain_normal(self):
        result = assess()

        self.assertTrue(result["assessed"])
        self.assertEqual(result["level"], "normal")
        self.assertLessEqual(result["score"], 24)

    def test_near_warning_water_yolo_and_rain_escalate(self):
        result = assess(
            water_level=1.9,
            flood_detected=True,
            yolo_confidence=0.85,
            water_coverage=30,
            rain_1h=6,
            rain_6h=18,
            weather_code=63,
            condition_text="Moderate rain",
        )

        self.assertEqual(result["level"], "high")
        self.assertGreaterEqual(result["score"], 50)
        self.assertLess(result["score"], 75)

    def test_weather_unavailable_still_allows_local_assessment(self):
        result = assess(
            weather_recorded_at=None,
            rain_1h=None,
            rain_6h=None,
            weather_code=None,
            condition_text=None,
        )

        self.assertTrue(result["assessed"])
        self.assertEqual(result["weather"]["status"], "unavailable")
        self.assertIn(
            "Weather data is unavailable.",
            result["limitations"],
        )

    def test_stale_weather_does_not_receive_full_influence(self):
        fresh = assess(
            rain_1h=8,
            rain_6h=25,
        )
        stale = assess(
            rain_1h=8,
            rain_6h=25,
            weather_recorded_at=STALE_WEATHER,
        )

        self.assertGreater(fresh["score"], stale["score"])
        self.assertEqual(stale["weather"]["status"], "stale")
        self.assertIsNone(stale["components"]["weather"])

    def test_no_valid_inputs_returns_not_assessed(self):
        result = calculate_combined_flood_risk(
            calculated_at=NOW,
            yolo_available=False,
            rain_6h=25,
            weather_recorded_at=FRESH_WEATHER,
        )

        self.assertFalse(result["assessed"])
        self.assertEqual(result["label"], "Not assessed")
        self.assertIsNone(result["score"])

    def test_assessed_scores_always_remain_in_range(self):
        cases = [
            assess(water_level=0),
            assess(water_level=1.99),
            assess(water_level=2.2),
            assess(water_level=99, flood_detected=True),
            assess(
                water_level=1.9,
                flood_detected=True,
                yolo_confidence=100,
                water_coverage=100,
                rain_1h=999,
                rain_6h=999,
            ),
        ]

        for result in cases:
            self.assertGreaterEqual(result["score"], 0)
            self.assertLessEqual(result["score"], 100)

    def test_missing_and_null_values_do_not_crash(self):
        result = calculate_combined_flood_risk(
            water_level=None,
            normal_level=None,
            warning_level="invalid",
            critical_level=None,
            yolo_available=None,
            flood_detected=None,
            yolo_confidence=None,
            water_coverage=None,
            rain_1h=None,
            rain_6h=None,
            weather_recorded_at="invalid",
            calculated_at=NOW,
        )

        self.assertFalse(result["assessed"])
        self.assertEqual(result["level"], "not_assessed")

    def test_weather_cannot_downgrade_water_safety_states(self):
        for water_level, expected_level, minimum_score in (
            (2.1, "high", 50),
            (2.6, "critical", 75),
        ):
            result = assess(
                water_level=water_level,
                yolo_available=False,
                rain_1h=0,
                rain_6h=0,
                weather_code=0,
                condition_text="Clear sky",
            )

            self.assertEqual(result["level"], expected_level)
            self.assertGreaterEqual(result["score"], minimum_score)


if __name__ == "__main__":
    unittest.main()
