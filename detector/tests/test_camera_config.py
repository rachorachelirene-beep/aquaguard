from __future__ import annotations

import json
import unittest
from contextlib import contextmanager
from pathlib import Path

from detector.camera_config import (
    CONFIGURATION_ENVIRONMENT,
    CONFIGURATION_RUNTIME,
    SOURCE_RTSP,
    SOURCE_USB,
    CameraConfigError,
    CameraConfigStore,
    build_rtsp_url,
    prepare_camera_config,
    public_camera_config,
    resolve_camera_configuration,
    validate_camera_config,
)


RTSP_CONFIG = {
    "source_type": "rtsp",
    "camera_ip": "192.168.50.20",
    "camera_username": "camera user",
    "camera_password": "p@ss:word",
    "stream_path": "/stream2",
}

USB_CONFIG = {
    "source_type": "usb",
    "webcam_index": 1,
}

TEST_DIRECTORY = Path(__file__).resolve().parent


@contextmanager
def test_config_path(name: str):
    path = TEST_DIRECTORY / f".{name}.json"
    path.unlink(missing_ok=True)

    try:
        yield path
    finally:
        path.unlink(missing_ok=True)


class CameraConfigTests(unittest.TestCase):
    def test_rtsp_config_validation_and_url_encoding(self):
        config = validate_camera_config(RTSP_CONFIG)
        url = build_rtsp_url(config)

        self.assertEqual(config["source_type"], SOURCE_RTSP)
        self.assertEqual(
            url,
            "rtsp://camera%20user:p%40ss%3Aword@192.168.50.20:554/stream2",
        )

    def test_usb_config_validation(self):
        config = validate_camera_config(USB_CONFIG)

        self.assertEqual(
            config,
            {"source_type": SOURCE_USB, "webcam_index": 1},
        )

    def test_invalid_source_type_is_rejected(self):
        with self.assertRaises(CameraConfigError):
            validate_camera_config(
                {"source_type": "network-scan"}
            )

    def test_malformed_numeric_ip_is_rejected(self):
        with self.assertRaises(CameraConfigError):
            validate_camera_config(
                {**RTSP_CONFIG, "camera_ip": "999.999.999.999"}
            )

    def test_webcam_index_validation_is_bounded(self):
        for invalid_index in (-1, 6, "one", 1.5, True):
            with self.subTest(index=invalid_index):
                with self.assertRaises(CameraConfigError):
                    validate_camera_config(
                        {
                            "source_type": "usb",
                            "webcam_index": invalid_index,
                        }
                    )

    def test_saved_config_persists_and_reloads(self):
        with test_config_path("persistence_test") as path:
            store = CameraConfigStore(path)

            saved = store.save(RTSP_CONFIG)
            loaded = store.load()

            self.assertEqual(saved, loaded)
            self.assertTrue(path.is_file())
            self.assertEqual(
                list(path.parent.glob(".camera_config_*.tmp")),
                [],
            )

    def test_malformed_saved_config_falls_back_to_environment(self):
        with test_config_path("malformed_test") as path:
            path.write_text("{malformed", encoding="utf-8")
            store = CameraConfigStore(path)

            config, origin, warning = resolve_camera_configuration(
                store,
                {
                    "CAMERA_SOURCE": "usb",
                    "CAMERA_INDEX": "2",
                },
            )

            self.assertEqual(config["webcam_index"], 2)
            self.assertEqual(origin, CONFIGURATION_ENVIRONMENT)
            self.assertIsNotNone(warning)

    def test_environment_fallback_accepts_legacy_webcam(self):
        with test_config_path("environment_test") as path:
            store = CameraConfigStore(path)

            config, origin, warning = resolve_camera_configuration(
                store,
                {
                    "CAMERA_SOURCE": "webcam",
                    "CAMERA_INDEX": "3",
                },
            )

            self.assertEqual(
                config,
                {"source_type": SOURCE_USB, "webcam_index": 3},
            )
            self.assertEqual(origin, CONFIGURATION_ENVIRONMENT)
            self.assertIsNone(warning)

    def test_valid_runtime_config_has_precedence_over_environment(self):
        with test_config_path("precedence_test") as path:
            store = CameraConfigStore(path)
            store.save(USB_CONFIG)

            config, origin, warning = resolve_camera_configuration(
                store,
                {
                    "CAMERA_SOURCE": "usb",
                    "CAMERA_INDEX": "5",
                },
            )

            self.assertEqual(config["webcam_index"], 1)
            self.assertEqual(origin, CONFIGURATION_RUNTIME)
            self.assertIsNone(warning)

    def test_password_is_never_returned_by_public_config(self):
        safe_config = public_camera_config(
            RTSP_CONFIG,
            configuration_source=CONFIGURATION_RUNTIME,
        )
        serialized = json.dumps(safe_config)

        self.assertTrue(safe_config["password_saved"])
        self.assertNotIn("camera_password", safe_config)
        self.assertNotIn(RTSP_CONFIG["camera_password"], serialized)
        self.assertNotIn("rtsp://", serialized)

    def test_blank_password_preserves_saved_password(self):
        candidate = {
            **RTSP_CONFIG,
            "camera_ip": "10.0.0.24",
            "camera_password": "",
        }

        prepared = prepare_camera_config(candidate, RTSP_CONFIG)

        self.assertEqual(
            prepared["camera_password"],
            RTSP_CONFIG["camera_password"],
        )
        self.assertEqual(prepared["camera_ip"], "10.0.0.24")

    def test_blank_password_without_saved_rtsp_password_is_rejected(self):
        with self.assertRaises(CameraConfigError):
            prepare_camera_config(
                {**RTSP_CONFIG, "camera_password": ""},
                USB_CONFIG,
            )

    def test_switching_rtsp_to_usb_removes_obsolete_fields(self):
        prepared = prepare_camera_config(USB_CONFIG, RTSP_CONFIG)

        self.assertEqual(set(prepared), {"source_type", "webcam_index"})
        self.assertNotIn("camera_password", prepared)

    def test_switching_usb_to_rtsp_uses_only_rtsp_fields(self):
        prepared = prepare_camera_config(RTSP_CONFIG, USB_CONFIG)

        self.assertEqual(prepared["source_type"], SOURCE_RTSP)
        self.assertNotIn("webcam_index", prepared)


if __name__ == "__main__":
    unittest.main()
