from __future__ import annotations

import unittest

from detector import stream_api


class StreamApiRiskTests(unittest.TestCase):
    def setUp(self):
        self.client = stream_api.app.test_client()

    def test_existing_routes_and_combined_risk_routes_are_registered(self):
        routes = {
            rule.rule
            for rule in stream_api.app.url_map.iter_rules()
        }

        self.assertTrue(
            {
                "/health",
                "/video_feed",
                "/latest_detection",
                "/snapshot",
                "/weather_status",
                "/flood_risk",
            }.issubset(routes)
        )

    def test_latest_detection_preserves_fields_and_includes_combined_risk(self):
        response = self.client.get("/latest_detection")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertIn("status", payload)
        self.assertIn("level_m", payload)
        self.assertIn("flood_risk", payload)
        self.assertIn("combined_risk", payload)
        self.assertEqual(
            payload["combined_risk"]["method"],
            "rule_based_heuristic",
        )

    def test_flood_risk_endpoint_returns_cached_station_result_without_switching(self):
        original_station = stream_api.get_active_station_id()
        result = {
            "score": 42,
            "level": "moderate",
            "label": "Moderate",
            "assessed": True,
            "method": "rule_based_heuristic",
            "factors": [],
        }

        with stream_api.risk_context_lock:
            stream_api.combined_risk_by_station["99"] = result

        response = self.client.get(
            "/flood_risk?station_id=99"
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["station_id"], 99)
        self.assertEqual(payload["combined_risk"]["score"], 42)
        self.assertEqual(
            stream_api.get_active_station_id(),
            original_station,
        )

    def test_flood_risk_endpoint_rejects_invalid_station(self):
        response = self.client.get(
            "/flood_risk?station_id=invalid"
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
