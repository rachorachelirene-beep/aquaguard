"""Unit tests for ROI configuration persistence and validation."""
import tempfile
import unittest
from pathlib import Path

from detector.roi_config import RoiConfigStore, validate_roi_config


class RoiConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / "roi_config.json"
        self.store = RoiConfigStore(self.config_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_empty_store_returns_empty_dict(self):
        self.assertEqual(self.store.load(), {})

    def test_save_and_load_config(self):
        data = {
            "roi_enabled": True,
            "stations": {
                "1": "0.10,0.10;0.90,0.10;0.90,0.90;0.10,0.90",
            },
        }
        self.store.save(data)
        loaded = self.store.load()
        self.assertEqual(loaded, data)

    def test_validate_single_station_payload(self):
        payload = {
            "station_id": 1,
            "roi_points": "0.10,0.10;0.90,0.10;0.90,0.90;0.10,0.90",
            "roi_enabled": True,
        }
        result = validate_roi_config(payload)
        self.assertEqual(result["station_id"], "1")
        self.assertEqual(result["roi_points"], "0.10,0.10;0.90,0.10;0.90,0.90;0.10,0.90")
        self.assertTrue(result["roi_enabled"])

    def test_validate_invalid_points_raises(self):
        payload = {
            "station_id": 1,
            "roi_points": "0.10,0.10;0.90,0.10",  # Only 2 points
        }
        with self.assertRaises(ValueError):
            validate_roi_config(payload)

    def test_validate_empty_points_allowed(self):
        payload = {
            "station_id": 1,
            "roi_points": "",
        }
        result = validate_roi_config(payload)
        self.assertEqual(result["roi_points"], "")


if __name__ == "__main__":
    unittest.main()

