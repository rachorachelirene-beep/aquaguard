"""Secure, backend-only camera source configuration for AquaGuard."""

from __future__ import annotations

import ipaddress
import json
import os
import re
import tempfile
import threading
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import quote


SOURCE_RTSP = "rtsp"
SOURCE_USB = "usb"
CONFIGURATION_RUNTIME = "runtime_config"
CONFIGURATION_ENVIRONMENT = "environment"
CONFIGURATION_NONE = "none"
MIN_WEBCAM_INDEX = 0
MAX_WEBCAM_INDEX = 5


class CameraConfigError(ValueError):
    """A camera configuration failed validation."""


class CameraConfigPersistenceError(RuntimeError):
    """A validated camera configuration could not be persisted."""


def normalize_source_type(
    value: object,
    *,
    allow_legacy_webcam: bool = False,
) -> str:
    source_type = str(value or "").strip().lower()

    if allow_legacy_webcam and source_type == "webcam":
        source_type = SOURCE_USB

    if source_type not in {SOURCE_RTSP, SOURCE_USB}:
        raise CameraConfigError(
            "Camera source type must be 'rtsp' or 'usb'."
        )

    return source_type


def normalize_camera_host(value: object) -> str:
    host = str(value or "").strip()

    if not host:
        raise CameraConfigError("Camera IP or host is required.")

    if (
        len(host) > 253
        or "://" in host
        or any(character.isspace() for character in host)
        or any(character in host for character in "/@?#\\")
    ):
        raise CameraConfigError("Camera IP or host is invalid.")

    unwrapped_host = (
        host[1:-1]
        if host.startswith("[") and host.endswith("]")
        else host
    )

    try:
        return str(ipaddress.ip_address(unwrapped_host))
    except ValueError:
        pass

    if re.fullmatch(r"[0-9.]+", unwrapped_host):
        raise CameraConfigError("Camera IP or host is invalid.")

    labels = unwrapped_host.split(".")
    hostname_label = re.compile(
        r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$"
    )

    if not labels or any(
        not hostname_label.fullmatch(label) for label in labels
    ):
        raise CameraConfigError("Camera IP or host is invalid.")

    return unwrapped_host.lower()


def normalize_stream_path(value: object) -> str:
    stream_path = str(value or "").strip()

    if not stream_path:
        raise CameraConfigError("RTSP stream path is required.")

    if not stream_path.startswith("/"):
        stream_path = f"/{stream_path}"

    if (
        len(stream_path) > 256
        or "://" in stream_path
        or "\\" in stream_path
        or any(character.isspace() for character in stream_path)
        or any(ord(character) < 32 for character in stream_path)
    ):
        raise CameraConfigError("RTSP stream path is invalid.")

    return stream_path


def normalize_webcam_index(value: object) -> int:
    if isinstance(value, bool):
        raise CameraConfigError("USB webcam index must be an integer.")

    value_text = str(value if value is not None else "").strip()

    if not re.fullmatch(r"\d+", value_text):
        raise CameraConfigError("USB webcam index must be an integer.")

    webcam_index = int(value_text)

    if not MIN_WEBCAM_INDEX <= webcam_index <= MAX_WEBCAM_INDEX:
        raise CameraConfigError(
            "USB webcam index must be between "
            f"{MIN_WEBCAM_INDEX} and {MAX_WEBCAM_INDEX}."
        )

    return webcam_index


def _normalize_credential(
    value: object,
    *,
    label: str,
    allow_blank: bool = False,
) -> str:
    credential = str(value if value is not None else "")

    if not allow_blank and not credential:
        raise CameraConfigError(f"{label} is required.")

    if (
        len(credential) > 512
        or any(character in credential for character in "\r\n\0")
    ):
        raise CameraConfigError(f"{label} is invalid.")

    return credential


def validate_camera_config(
    value: Mapping[str, object],
    *,
    allow_legacy_webcam: bool = False,
) -> dict:
    if not isinstance(value, Mapping):
        raise CameraConfigError(
            "Camera configuration must be a JSON object."
        )

    source_type = normalize_source_type(
        value.get("source_type"),
        allow_legacy_webcam=allow_legacy_webcam,
    )

    if source_type == SOURCE_USB:
        return {
            "source_type": SOURCE_USB,
            "webcam_index": normalize_webcam_index(
                value.get("webcam_index")
            ),
        }

    username = _normalize_credential(
        value.get("camera_username"),
        label="Camera username",
    ).strip()

    if not username:
        raise CameraConfigError("Camera username is required.")

    return {
        "source_type": SOURCE_RTSP,
        "camera_ip": normalize_camera_host(value.get("camera_ip")),
        "camera_username": username,
        "camera_password": _normalize_credential(
            value.get("camera_password"),
            label="Camera password",
        ),
        "stream_path": normalize_stream_path(
            value.get("stream_path")
        ),
    }


def prepare_camera_config(
    value: Mapping[str, object],
    existing_config: Mapping[str, object] | None = None,
) -> dict:
    """Validate input, preserving a saved RTSP password when left blank."""

    candidate = dict(value)
    source_type = normalize_source_type(candidate.get("source_type"))

    if source_type == SOURCE_RTSP:
        supplied_password = candidate.get("camera_password")

        if supplied_password is None or supplied_password == "":
            if (
                existing_config
                and existing_config.get("source_type") == SOURCE_RTSP
                and existing_config.get("camera_password")
            ):
                candidate["camera_password"] = existing_config[
                    "camera_password"
                ]

    return validate_camera_config(candidate)


def build_rtsp_url(config: Mapping[str, object]) -> str:
    validated = validate_camera_config(config)

    if validated["source_type"] != SOURCE_RTSP:
        raise CameraConfigError(
            "An RTSP camera configuration is required."
        )

    host = validated["camera_ip"]

    try:
        if ipaddress.ip_address(host).version == 6:
            host = f"[{host}]"
    except ValueError:
        pass

    username = quote(validated["camera_username"], safe="")
    password = quote(validated["camera_password"], safe="")

    return (
        f"rtsp://{username}:{password}@{host}:554"
        f"{validated['stream_path']}"
    )


def public_camera_config(
    config: Mapping[str, object] | None,
    *,
    configuration_source: str,
) -> dict:
    if not config:
        return {
            "configured": False,
            "source_type": None,
            "configuration_source": CONFIGURATION_NONE,
            "password_saved": False,
        }

    safe_config = {
        "configured": True,
        "source_type": config["source_type"],
        "configuration_source": configuration_source,
        "password_saved": False,
    }

    if config["source_type"] == SOURCE_USB:
        safe_config["webcam_index"] = config["webcam_index"]
    else:
        safe_config.update(
            {
                "camera_ip": config["camera_ip"],
                "camera_username": config["camera_username"],
                "stream_path": config["stream_path"],
                "password_saved": bool(config.get("camera_password")),
            }
        )

    return safe_config


def camera_config_from_environment(
    environment: Mapping[str, str],
) -> tuple[dict | None, str | None]:
    source_value = str(environment.get("CAMERA_SOURCE", "")).strip()

    if not source_value:
        return None, None

    try:
        source_type = normalize_source_type(
            source_value,
            allow_legacy_webcam=True,
        )

        if source_type == SOURCE_USB:
            candidate = {
                "source_type": SOURCE_USB,
                "webcam_index": environment.get("CAMERA_INDEX", "0"),
            }
        else:
            candidate = {
                "source_type": SOURCE_RTSP,
                "camera_ip": environment.get("CAMERA_IP", ""),
                "camera_username": environment.get(
                    "CAMERA_USERNAME", ""
                ),
                "camera_password": environment.get(
                    "CAMERA_PASSWORD", ""
                ),
                "stream_path": environment.get(
                    "CAMERA_STREAM_PATH", "/stream1"
                ),
            }

        return validate_camera_config(candidate), None
    except CameraConfigError as error:
        return None, str(error)


class CameraConfigStore:
    """Atomically persist a validated camera configuration as local JSON."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.last_error: str | None = None
        self._lock = threading.RLock()

    def load(self) -> dict | None:
        with self._lock:
            try:
                with self.path.open("r", encoding="utf-8") as config_file:
                    raw_config = json.load(config_file)

                config = validate_camera_config(raw_config)
                self.last_error = None
                return config
            except FileNotFoundError:
                self.last_error = None
                return None
            except (CameraConfigError, json.JSONDecodeError, OSError) as error:
                self.last_error = (
                    "Saved camera configuration is unavailable: "
                    f"{error}"
                )
                return None

    def save(self, value: Mapping[str, object]) -> dict:
        config = validate_camera_config(value)

        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path: Path | None = None

            try:
                descriptor, temporary_name = tempfile.mkstemp(
                    prefix=".camera_config_",
                    suffix=".tmp",
                    dir=self.path.parent,
                )
                temporary_path = Path(temporary_name)

                with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                    json.dump(config, file, indent=2, ensure_ascii=False)
                    file.write("\n")
                    file.flush()
                    os.fsync(file.fileno())

                try:
                    temporary_path.chmod(0o600)
                except OSError:
                    pass

                os.replace(temporary_path, self.path)
                temporary_path = None

                try:
                    self.path.chmod(0o600)
                except OSError:
                    pass

                self.last_error = None
                return config
            except OSError as error:
                raise CameraConfigPersistenceError(
                    "Unable to save camera configuration."
                ) from error
            finally:
                if temporary_path is not None:
                    try:
                        temporary_path.unlink(missing_ok=True)
                    except OSError:
                        pass


def resolve_camera_configuration(
    store: CameraConfigStore,
    environment: Mapping[str, str],
) -> tuple[dict | None, str, str | None]:
    runtime_config = store.load()

    if runtime_config is not None:
        return runtime_config, CONFIGURATION_RUNTIME, None

    runtime_error = store.last_error
    environment_config, environment_error = camera_config_from_environment(
        environment
    )

    if environment_config is not None:
        return (
            environment_config,
            CONFIGURATION_ENVIRONMENT,
            runtime_error,
        )

    return (
        None,
        CONFIGURATION_NONE,
        runtime_error or environment_error,
    )
