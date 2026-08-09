from __future__ import annotations

import unittest
from unittest import mock

from detector import stream_api


PRODUCTION_ORIGIN = "https://aquaguard-live.vercel.app"
DEVELOPMENT_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class CameraAgentCorsTests(unittest.TestCase):
    def setUp(self):
        self.client = stream_api.app.test_client()

    def test_production_and_development_origins_are_allowed(self):
        for origin in (PRODUCTION_ORIGIN, *DEVELOPMENT_ORIGINS):
            with self.subTest(origin=origin):
                response = self.client.get(
                    "/health",
                    headers={"Origin": origin},
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.headers.get("Access-Control-Allow-Origin"),
                    origin,
                )

    def test_camera_management_preflight_allows_required_headers_and_pna(self):
        response = self.client.options(
            "/camera_config",
            headers={
                "Origin": PRODUCTION_ORIGIN,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": (
                    "Authorization, Content-Type"
                ),
                "Access-Control-Request-Private-Network": "true",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            PRODUCTION_ORIGIN,
        )
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Private-Network"),
            "true",
        )
        self.assertEqual(
            response.headers.get("Access-Control-Max-Age"),
            "600",
        )
        self.assertIn(
            "Origin",
            response.headers.get("Vary", ""),
        )

        allowed_methods = {
            value.strip()
            for value in response.headers.get(
                "Access-Control-Allow-Methods", ""
            ).split(",")
        }
        allowed_headers = {
            value.strip().lower()
            for value in response.headers.get(
                "Access-Control-Allow-Headers", ""
            ).split(",")
        }

        self.assertTrue(
            {"GET", "POST", "PUT", "OPTIONS"}.issubset(allowed_methods)
        )
        self.assertIn("authorization", allowed_headers)
        self.assertIn("content-type", allowed_headers)

    def test_arbitrary_origin_receives_no_cors_or_private_network_access(self):
        response = self.client.options(
            "/camera_config",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "Authorization",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)
        self.assertNotIn(
            "Access-Control-Allow-Private-Network",
            response.headers,
        )

    def test_request_without_origin_receives_no_cors_allowance(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_health_keeps_legacy_source_and_adds_configured_alias(self):
        with mock.patch.object(
            stream_api,
            "get_configured_camera_source",
            return_value="usb",
        ):
            response = self.client.get("/health")

        payload = response.get_json()
        self.assertEqual(payload["camera_source"], "usb")
        self.assertEqual(payload["configured_camera_source"], "usb")

    def test_allowed_cors_origin_does_not_bypass_admin_authentication(self):
        response = self.client.get(
            "/camera_config",
            headers={"Origin": PRODUCTION_ORIGIN},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            PRODUCTION_ORIGIN,
        )


if __name__ == "__main__":
    unittest.main()
