from __future__ import annotations

import copy
import io
import json
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import numpy as np

from detector import stream_api
from detector.camera_config import (
    CONFIGURATION_RUNTIME,
    SOURCE_RTSP,
    SOURCE_USB,
    CameraConfigStore,
)


RTSP_CONFIG = {
    "source_type": "rtsp",
    "camera_ip": "192.168.20.30",
    "camera_username": "camera-user",
    "camera_password": "camera-secret",
    "stream_path": "/stream2",
}

TEST_DIRECTORY = Path(__file__).resolve().parent


class FakeCapture:
    def __init__(self, *, opened=True, frame=None):
        self.opened = opened
        self.frame = (
            np.zeros((8, 8, 3), dtype=np.uint8)
            if frame is None
            else frame
        )
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        return self.opened, self.frame

    def release(self):
        self.released = True


class ReconnectCapture(FakeCapture):
    def read(self):
        stream_api.camera_reconnect_event.set()
        return False, None


class FakePermanentThread:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.started = False

    def start(self):
        self.started = True

    def is_alive(self):
        return self.started


class CameraManagementTests(unittest.TestCase):
    def setUp(self):
        self.client = stream_api.app.test_client()
        self.original_store = stream_api.camera_config_store
        self.original_capture_thread = stream_api.capture_thread
        self.original_stop_event = stream_api.stop_event.is_set()
        self.original_reconnect_event = (
            stream_api.camera_reconnect_event.is_set()
        )

        with stream_api.camera_config_lock:
            self.original_config = copy.deepcopy(
                stream_api.camera_config
            )
            self.original_origin = (
                stream_api.camera_configuration_source
            )
            self.original_config_error = (
                stream_api.camera_configuration_error
            )
            self.original_generation = (
                stream_api.camera_config_generation
            )

        with stream_api.state_lock:
            self.original_detection = copy.deepcopy(
                stream_api.latest_detection
            )
            self.original_connected = stream_api.camera_connected
            self.original_reconnecting = (
                stream_api.camera_reconnecting
            )
            self.original_camera_error = stream_api.camera_error
            self.original_active_source = (
                stream_api.active_camera_source
            )
            self.original_latest_frame_at = (
                stream_api.latest_frame_at
            )
            self.original_water_mask = stream_api.latest_water_mask

        with stream_api.frame_lock:
            self.original_jpeg = stream_api.latest_jpeg
            self.original_frame = stream_api.latest_camera_frame

    def tearDown(self):
        stream_api.camera_config_store = self.original_store
        stream_api.capture_thread = self.original_capture_thread

        with stream_api.camera_config_lock:
            stream_api.camera_config = self.original_config
            stream_api.camera_configuration_source = self.original_origin
            stream_api.camera_configuration_error = (
                self.original_config_error
            )
            stream_api.camera_config_generation = self.original_generation

        with stream_api.state_lock:
            stream_api.latest_detection = self.original_detection
            stream_api.camera_connected = self.original_connected
            stream_api.camera_reconnecting = (
                self.original_reconnecting
            )
            stream_api.camera_error = self.original_camera_error
            stream_api.active_camera_source = self.original_active_source
            stream_api.latest_frame_at = self.original_latest_frame_at
            stream_api.latest_water_mask = self.original_water_mask

        with stream_api.frame_lock:
            stream_api.latest_jpeg = self.original_jpeg
            stream_api.latest_camera_frame = self.original_frame

        if self.original_stop_event:
            stream_api.stop_event.set()
        else:
            stream_api.stop_event.clear()

        if self.original_reconnect_event:
            stream_api.camera_reconnect_event.set()
        else:
            stream_api.camera_reconnect_event.clear()

        stream_api.notify_detection_clients()

    def authorized_request(self, method, path, **kwargs):
        with mock.patch.object(
            stream_api,
            "authorize_active_admin",
        ):
            return self.client.open(
                path,
                method=method,
                headers={"Authorization": "Bearer test-token"},
                **kwargs,
            )

    def set_rtsp_runtime_config(self):
        with stream_api.camera_config_lock:
            stream_api.camera_config = copy.deepcopy(RTSP_CONFIG)
            stream_api.camera_configuration_source = CONFIGURATION_RUNTIME
            stream_api.camera_configuration_error = None

    def test_camera_management_endpoint_requires_token(self):
        response = self.client.get("/camera_config")

        self.assertEqual(response.status_code, 401)

    def test_safe_config_endpoint_never_returns_password_or_url(self):
        self.set_rtsp_runtime_config()

        response = self.authorized_request("GET", "/camera_config")
        payload = response.get_json()
        serialized = json.dumps(payload)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["password_saved"])
        self.assertEqual(
            response.headers.get("Cache-Control"),
            "no-store",
        )
        self.assertNotIn("camera_password", payload)
        self.assertNotIn("camera-secret", serialized)
        self.assertNotIn("rtsp://", serialized)

    def test_bounded_webcam_probe_releases_temporary_captures(self):
        captures = []
        attempted_indices = []

        def fake_try_webcam(index, _backend):
            attempted_indices.append(index)

            if index not in {1, 4}:
                return None

            capture = FakeCapture()
            captures.append(capture)
            return capture

        with (
            mock.patch.object(
                stream_api,
                "get_webcam_backends",
                return_value=[("TEST", 1)],
            ),
            mock.patch.object(
                stream_api,
                "try_webcam",
                side_effect=fake_try_webcam,
            ),
        ):
            devices = stream_api.probe_usb_camera_devices()

        self.assertEqual(attempted_indices, [0, 1, 2, 3, 4, 5])
        self.assertEqual(
            [device["index"] for device in devices],
            [1, 4],
        )
        self.assertTrue(all(capture.released for capture in captures))

    def test_usb_connection_test_releases_valid_capture(self):
        capture = FakeCapture()

        with (
            mock.patch.object(
                stream_api,
                "get_webcam_backends",
                return_value=[("TEST", 1)],
            ),
            mock.patch.object(
                stream_api,
                "try_webcam",
                return_value=capture,
            ),
        ):
            stream_api.test_camera_configuration(
                {"source_type": "usb", "webcam_index": 0}
            )

        self.assertTrue(capture.released)

    def test_current_live_usb_source_does_not_open_a_second_capture(self):
        with stream_api.camera_config_lock:
            stream_api.camera_config = {
                "source_type": SOURCE_USB,
                "webcam_index": 0,
            }

        with stream_api.state_lock:
            stream_api.camera_connected = True
            stream_api.active_camera_source = SOURCE_USB

        with stream_api.frame_lock:
            stream_api.latest_camera_frame = np.zeros(
                (8, 8, 3),
                dtype=np.uint8,
            )

        with mock.patch.object(
            stream_api,
            "try_webcam",
        ) as webcam_open:
            stream_api.test_camera_configuration(
                {"source_type": "usb", "webcam_index": 0}
            )

        webcam_open.assert_not_called()

    def test_failed_usb_connection_test_is_reported(self):
        with (
            mock.patch.object(
                stream_api,
                "get_webcam_backends",
                return_value=[("TEST", 1)],
            ),
            mock.patch.object(
                stream_api,
                "try_webcam",
                return_value=None,
            ),
        ):
            with self.assertRaises(RuntimeError):
                stream_api.test_camera_configuration(
                    {"source_type": "usb", "webcam_index": 0}
                )

    def test_mocked_rtsp_connection_test_releases_capture(self):
        capture = FakeCapture()

        with mock.patch.object(
            stream_api,
            "create_rtsp_capture",
            return_value=capture,
        ):
            stream_api.test_camera_configuration(RTSP_CONFIG)

        self.assertTrue(capture.released)

    def test_rtsp_test_endpoint_success_does_not_change_active_source(self):
        stream_api.active_camera_source = SOURCE_USB

        with mock.patch.object(
            stream_api,
            "test_camera_configuration",
        ) as camera_test:
            response = self.authorized_request(
                "POST",
                "/camera_config/test",
                json=RTSP_CONFIG,
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        self.assertEqual(stream_api.active_camera_source, SOURCE_USB)
        camera_test.assert_called_once()

    def test_rtsp_failure_response_and_log_do_not_leak_credentials(self):
        failure = RuntimeError(
            "Unable to open rtsp://camera-user:camera-secret@192.168.20.30/stream2"
        )
        output = io.StringIO()

        with (
            mock.patch.object(
                stream_api,
                "test_camera_configuration",
                side_effect=failure,
            ),
            redirect_stdout(output),
        ):
            response = self.authorized_request(
                "POST",
                "/camera_config/test",
                json=RTSP_CONFIG,
            )

        combined_output = output.getvalue() + response.get_data(as_text=True)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("camera-secret", combined_output)
        self.assertNotIn("camera-user", combined_output)
        self.assertNotIn(
            "rtsp://camera-user:camera-secret@",
            combined_output,
        )
        self.assertIn("rtsp://***@", combined_output)

    def test_saving_config_signals_reconnect_without_new_thread(self):
        config_path = TEST_DIRECTORY / ".management_save_test.json"
        config_path.unlink(missing_ok=True)

        try:
            stream_api.camera_config_store = CameraConfigStore(config_path)
            old_thread = object()
            stream_api.capture_thread = old_thread
            stream_api.camera_reconnect_event.clear()

            saved = stream_api.save_camera_configuration(RTSP_CONFIG)
        finally:
            config_path.unlink(missing_ok=True)

        self.assertEqual(saved["source_type"], SOURCE_RTSP)
        self.assertTrue(stream_api.camera_reconnect_event.is_set())
        self.assertIs(stream_api.capture_thread, old_thread)
        self.assertEqual(stream_api.get_camera_state_name(), "reconnecting")

    def test_source_change_releases_old_capture(self):
        capture = ReconnectCapture()
        stream_api.stop_event.clear()
        stream_api.camera_reconnect_event.clear()
        stream_api.active_camera_source = SOURCE_USB

        def update_state(_connected, _error=None, **kwargs):
            if kwargs.get("reconnecting"):
                stream_api.stop_event.set()

        with (
            mock.patch.object(
                stream_api,
                "open_camera",
                return_value=capture,
            ),
            mock.patch.object(
                stream_api,
                "update_camera_state",
                side_effect=update_state,
            ),
        ):
            stream_api.camera_capture_loop()

        self.assertTrue(capture.released)

    def test_health_and_latest_detection_remain_public(self):
        health_response = self.client.get("/health")
        detection_response = self.client.get("/latest_detection")

        self.assertEqual(health_response.status_code, 200)
        self.assertEqual(detection_response.status_code, 200)
        self.assertIn("camera_state", health_response.get_json())
        self.assertIn("camera_state", detection_response.get_json())

    def test_video_feed_remains_mjpeg(self):
        with (
            mock.patch.object(stream_api, "start_capture_thread"),
            mock.patch.object(
                stream_api,
                "generate_mjpeg_stream",
                return_value=iter(
                    [
                        b"--frame\r\nContent-Type: image/jpeg\r\n\r\ntest\r\n"
                    ]
                ),
            ),
        ):
            response = self.client.get("/video_feed", buffered=False)

        try:
            self.assertEqual(response.status_code, 200)
            self.assertTrue(
                response.content_type.startswith(
                    "multipart/x-mixed-replace"
                )
            )
        finally:
            response.close()

    def test_snapshot_still_returns_jpeg(self):
        with stream_api.frame_lock:
            stream_api.latest_camera_frame = np.zeros(
                (16, 16, 3),
                dtype=np.uint8,
            )

        with mock.patch.object(stream_api, "start_capture_thread"):
            response = self.client.get("/snapshot")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content_type, "image/jpeg")
        self.assertTrue(response.data.startswith(b"\xff\xd8"))

    def test_capture_worker_is_single_instance(self):
        stream_api.capture_thread = None

        with mock.patch.object(
            stream_api.threading,
            "Thread",
            side_effect=FakePermanentThread,
        ) as thread_factory:
            stream_api.start_capture_thread()
            stream_api.start_capture_thread()

        self.assertEqual(thread_factory.call_count, 1)
        self.assertEqual(
            stream_api.capture_thread.kwargs["name"],
            "AquaGuardCameraCapture",
        )

    def test_management_requests_do_not_run_yolo_or_write_supabase(self):
        self.set_rtsp_runtime_config()

        with (
            mock.patch.object(
                stream_api,
                "run_yolo_detection",
            ) as yolo,
            mock.patch.object(
                stream_api,
                "write_detection_to_supabase",
            ) as database_write,
            mock.patch.object(
                stream_api,
                "probe_usb_camera_devices",
                return_value=[],
            ),
        ):
            config_response = self.authorized_request(
                "GET", "/camera_config"
            )
            devices_response = self.authorized_request(
                "GET", "/camera_devices"
            )

        self.assertEqual(config_response.status_code, 200)
        self.assertEqual(devices_response.status_code, 200)
        yolo.assert_not_called()
        database_write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
