"""Run with python -m unittest detector/tests/test_water_roi.py"""
import unittest
import numpy as np
from detector.water_roi import clip_water_mask_to_roi, parse_roi_points


class WaterRoiTests(unittest.TestCase):
    def test_empty_config_preserves_original_mask(self):
        mask = np.ones((100, 100), np.uint8)
        self.assertIs(clip_water_mask_to_roi(mask, ""), mask)

    def test_roi_rejects_background_detection(self):
        mask = np.ones((100, 100), np.uint8)
        # Water is physically possible only in the central rectangle.
        output = clip_water_mask_to_roi(mask, "0.25,0.25;0.75,0.25;0.75,0.75;0.25,0.75")
        self.assertEqual(output[0, 0], 0)
        self.assertEqual(output[50, 50], 1)
        self.assertEqual(output[99, 99], 0)
        self.assertLess(np.count_nonzero(output), np.count_nonzero(mask) * 0.30)

    def test_noise_island_inside_roi_is_removed(self):
        mask = np.zeros((200, 200), np.uint8)
        mask[50:100, 50:100] = 1
        mask[120, 120] = 1
        result = clip_water_mask_to_roi(mask, "0.10,0.10;0.90,0.10;0.90,0.90;0.10,0.90")
        self.assertEqual(result[75, 75], 1)
        self.assertEqual(result[120, 120], 0)

    def test_invalid_geometry_fails_instead_of_silently_disabling_roi(self):
        for spec in ["0.1,0.1;0.8,0.9", "0,0;1.2,0;1,1;0,1", "oops", "0,0;1,1;0,1;1,0"]:
            with self.subTest(spec=spec), self.assertRaises(ValueError):
                parse_roi_points(spec)


if __name__ == "__main__":
    unittest.main()
