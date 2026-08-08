from __future__ import annotations

import copy
import json
import unittest
from unittest import mock

from detector import stream_api


def parse_detection_event(chunk: bytes | str) -> dict:
    text = (
        chunk.decode("utf-8")
        if isinstance(chunk, bytes)
        else chunk
    )
    lines = text.splitlines()

    if "event: detection" not in lines:
        raise AssertionError("Missing detection event name.")

    data_line = next(
        (
            line
            for line in lines
            if line.startswith("data: ")
        ),
        None,
    )

    if data_line is None:
        raise AssertionError("Missing SSE data line.")

    return json.loads(data_line.removeprefix("data: "))


class DetectionStreamTests(unittest.TestCase):
    def setUp(self):
        self.client = stream_api.app.test_client()

        with stream_api.state_lock:
            self.original_detection = copy.deepcopy(
                stream_api.latest_detection
            )
            self.original_camera_connected = (
                stream_api.camera_connected
            )
            self.original_camera_error = stream_api.camera_error
            self.original_active_camera_source = (
                stream_api.active_camera_source
            )
            self.original_latest_frame_at = stream_api.latest_frame_at

            stream_api.latest_detection = {
                "station_id": 7,
                "camera_connected": True,
                "detection_enabled": True,
                "detected": True,
                "status": "warning",
                "level_m": 2.1,
                "water_level": 2.1,
                "confidence": 0.84,
                "water_coverage": 31.5,
                "flood_risk": 0.62,
                "weather_risk": 0.0,
                "waterline_y": 321,
                "frame_width": 1280,
                "frame_height": 720,
                "detected_at": "2026-08-08T12:00:00+00:00",
                "latest_frame_at": "2026-08-08T12:00:01+00:00",
                "error": None,
                "combined_risk": {
                    "score": 58,
                    "level": "high",
                    "label": "High / Warning",
                    "assessed": True,
                    "method": "rule_based_heuristic",
                    "factors": [],
                },
                "camera_password": "must-not-leak",
                "rtsp_url": "rtsp://user:password@camera/stream1",
            }
            stream_api.camera_connected = True
            stream_api.camera_error = None
            stream_api.latest_frame_at = (
                "2026-08-08T12:00:01+00:00"
            )

        stream_api.notify_detection_clients()

    def tearDown(self):
        with stream_api.state_lock:
            stream_api.latest_detection = self.original_detection
            stream_api.camera_connected = (
                self.original_camera_connected
            )
            stream_api.camera_error = self.original_camera_error
            stream_api.active_camera_source = (
                self.original_active_camera_source
            )
            stream_api.latest_frame_at = self.original_latest_frame_at

        stream_api.notify_detection_clients()

    def open_stream(self, path: str = "/detection_stream"):
        return self.client.get(
            path,
            buffered=False,
        )

    def test_route_exists_and_uses_event_stream_content_type(self):
        routes = {
            rule.rule
            for rule in stream_api.app.url_map.iter_rules()
        }
        self.assertIn("/detection_stream", routes)

        response = self.open_stream()

        try:
            self.assertEqual(response.status_code, 200)
            self.assertTrue(
                response.content_type.startswith(
                    "text/event-stream"
                )
            )
            self.assertIn(
                "no-cache",
                response.headers.get("Cache-Control", ""),
            )
            self.assertEqual(
                response.headers.get("X-Accel-Buffering"),
                "no",
            )
        finally:
            response.close()

    def test_initial_event_is_valid_json_with_combined_risk(self):
        response = self.open_stream()

        try:
            payload = parse_detection_event(
                next(response.response)
            )
        finally:
            response.close()

        self.assertEqual(payload["station_id"], 7)
        self.assertEqual(payload["level_m"], 2.1)
        self.assertEqual(
            payload["combined_risk"]["score"],
            58,
        )
        self.assertEqual(
            payload["combined_risk"]["method"],
            "rule_based_heuristic",
        )

    def test_public_payload_omits_credentials_and_redacts_rtsp_userinfo(self):
        with stream_api.state_lock:
            stream_api.latest_detection["error"] = (
                "Unable to open "
                "rtsp://camera-user:camera-pass@192.0.2.1/stream1"
            )

        payload = stream_api.get_public_detection_snapshot()
        serialized = json.dumps(payload)

        self.assertNotIn("camera_password", payload)
        self.assertNotIn("rtsp_url", payload)
        self.assertNotIn("camera-user", serialized)
        self.assertNotIn("camera-pass", serialized)
        self.assertIn("rtsp://***@", payload["error"])

    def test_heartbeat_comment_has_valid_sse_format(self):
        generator = stream_api.generate_detection_events(
            heartbeat_seconds=0.001
        )

        try:
            parse_detection_event(next(generator))
            heartbeat = next(generator)
        finally:
            generator.close()

        self.assertEqual(heartbeat, ": keepalive\n\n")

    def test_camera_disconnect_and_reconnect_continue_on_same_stream(self):
        generator = stream_api.generate_detection_events(
            heartbeat_seconds=1
        )

        try:
            parse_detection_event(next(generator))

            stream_api.update_camera_state(
                False,
                "Camera connection unavailable.",
            )
            disconnected = parse_detection_event(
                next(generator)
            )

            stream_api.update_camera_state(True)
            reconnected = parse_detection_event(
                next(generator)
            )
        finally:
            generator.close()

        self.assertFalse(
            disconnected["camera_connected"]
        )
        self.assertEqual(
            disconnected["error"],
            "Camera connection unavailable.",
        )
        self.assertTrue(
            reconnected["camera_connected"]
        )
        self.assertIsNone(reconnected["error"])

    def test_multiple_clients_do_not_trigger_yolo_inference(self):
        first_client = stream_api.app.test_client()
        second_client = stream_api.app.test_client()

        with (
            mock.patch.object(
                stream_api,
                "run_yolo_detection",
            ) as inference,
            mock.patch.object(
                stream_api,
                "write_detection_to_supabase",
            ) as database_write,
            mock.patch.object(
                stream_api,
                "start_capture_thread",
            ) as capture_start,
        ):
            first = first_client.get(
                "/detection_stream",
                buffered=False,
            )
            second = second_client.get(
                "/detection_stream",
                buffered=False,
            )

            try:
                parse_detection_event(next(first.response))
                parse_detection_event(next(second.response))
            finally:
                first.close()
                second.close()

        inference.assert_not_called()
        database_write.assert_not_called()
        capture_start.assert_not_called()

    def test_station_query_does_not_change_active_detector(self):
        original_station = stream_api.get_active_station_id()
        response = self.open_stream(
            "/detection_stream?station_id=99"
        )

        try:
            payload = parse_detection_event(
                next(response.response)
            )
        finally:
            response.close()

        self.assertEqual(
            stream_api.get_active_station_id(),
            original_station,
        )
        self.assertEqual(payload["station_id"], 7)

    def test_invalid_station_is_rejected_without_streaming(self):
        response = self.client.get(
            "/detection_stream?station_id=invalid"
        )

        self.assertEqual(response.status_code, 400)

    def test_latest_detection_remains_available(self):
        response = self.client.get("/latest_detection")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["station_id"], 7)
        self.assertIn("combined_risk", payload)


if __name__ == "__main__":
    unittest.main()
