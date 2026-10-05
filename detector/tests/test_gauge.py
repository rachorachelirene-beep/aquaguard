from __future__ import annotations

import unittest
from unittest import mock

import numpy as np

from detector import gauge, stream_api


FRAME_HEIGHT = 100
FRAME_WIDTH = 120
GAUGE_POINTS: gauge.GaugePoints = (
    (45.0, 10.0),
    (75.0, 10.0),
    (85.0, 90.0),
    (35.0, 90.0),
)


def gauge_water_mask(waterline_y: int) -> np.ndarray:
    mask = np.zeros((FRAME_HEIGHT, FRAME_WIDTH), dtype=np.uint8)
    polygon = np.rint(GAUGE_POINTS).astype(np.int32)
    gauge_mask = np.zeros_like(mask)
    import cv2

    cv2.fillConvexPoly(gauge_mask, polygon, 1)
    mask[waterline_y:] = gauge_mask[waterline_y:]
    return mask


class GaugeWaterlineTests(unittest.TestCase):
    def test_water_only_at_bottom_of_gauge_is_measurable(self):
        waterline = gauge.calculate_waterline(
            gauge_water_mask(87), GAUGE_POINTS
        )

        self.assertEqual(waterline, 87)
        self.assertGreater(
            gauge.waterline_to_level(
                waterline, FRAME_HEIGHT, GAUGE_POINTS
            ),
            0.0,
        )

    def test_water_at_mid_gauge(self):
        waterline = gauge.calculate_waterline(
            gauge_water_mask(50), GAUGE_POINTS
        )

        self.assertEqual(waterline, 50)
        self.assertEqual(
            gauge.waterline_to_level(
                waterline, FRAME_HEIGHT, GAUGE_POINTS
            ),
            1.5,
        )

    def test_water_near_warning_level(self):
        warning_y = gauge.level_to_y(
            gauge.WARNING_LEVEL_M, FRAME_HEIGHT, GAUGE_POINTS
        ) - 1
        waterline = gauge.calculate_waterline(
            gauge_water_mask(warning_y), GAUGE_POINTS
        )
        level = gauge.waterline_to_level(
            waterline, FRAME_HEIGHT, GAUGE_POINTS
        )

        self.assertGreaterEqual(level, gauge.WARNING_LEVEL_M)
        self.assertEqual(
            stream_api.determine_level_status(level, True), "warning"
        )

    def test_water_near_critical_level(self):
        critical_y = gauge.level_to_y(
            gauge.CRITICAL_LEVEL_M, FRAME_HEIGHT, GAUGE_POINTS
        )
        waterline = gauge.calculate_waterline(
            gauge_water_mask(critical_y), GAUGE_POINTS
        )
        level = gauge.waterline_to_level(
            waterline, FRAME_HEIGHT, GAUGE_POINTS
        )

        self.assertGreaterEqual(level, gauge.CRITICAL_LEVEL_M)
        self.assertEqual(
            stream_api.determine_level_status(level, True), "critical"
        )

    def test_water_outside_gauge_does_not_create_measurement(self):
        mask = np.ones((FRAME_HEIGHT, FRAME_WIDTH), dtype=np.uint8)
        mask[:, 30:90] = 0

        self.assertIsNone(
            gauge.calculate_waterline(mask, GAUGE_POINTS)
        )

    def test_no_water_mask_has_no_waterline(self):
        mask = np.zeros((FRAME_HEIGHT, FRAME_WIDTH), dtype=np.uint8)

        self.assertIsNone(
            gauge.calculate_waterline(mask, GAUGE_POINTS)
        )

    def test_no_gauge_uses_existing_frame_width_ratios(self):
        mask = np.zeros((FRAME_HEIGHT, FRAME_WIDTH), dtype=np.uint8)
        mask[40:, :35] = 1

        self.assertEqual(gauge.calculate_waterline(mask), 40)

        with mock.patch.object(
            gauge, "WATERLINE_ROW_COVERAGE", 0.30
        ), mock.patch.object(
            gauge, "WATERLINE_FALLBACK_ROW_COVERAGE", 0.08
        ):
            narrow_mask = np.zeros_like(mask)
            narrow_mask[60:, :8] = 1
            self.assertIsNone(gauge.calculate_waterline(narrow_mask))


if __name__ == "__main__":
    unittest.main()
