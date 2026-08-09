"""Production entry point for the loopback-only AquaGuard Camera Agent."""

from __future__ import annotations

import os
from pathlib import Path
from typing import BinaryIO

if os.name == "nt":
    import msvcrt
else:  # pragma: no cover - Windows is the production target.
    import fcntl

from waitress import create_server

try:
    from . import stream_api
except ImportError:  # Support direct execution during local troubleshooting.
    import stream_api  # type: ignore[no-redef]


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CAMERA_AGENT_LOCK_PATH = DATA_DIR / "camera_agent.lock"
CAMERA_AGENT_PID_PATH = DATA_DIR / "camera_agent.pid"

CAMERA_AGENT_HOST = "127.0.0.1"
CAMERA_AGENT_PORT = 5000
CAMERA_AGENT_THREADS = 8


class CameraAgentAlreadyRunning(RuntimeError):
    """Raised when another Camera Agent process owns the runtime lock."""


class CameraAgentOwnershipError(RuntimeError):
    """Raised when process ownership files cannot be managed safely."""


def _lock_file_nonblocking(lock_file: BinaryIO) -> None:
    lock_file.seek(0)

    if os.name == "nt":
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        return

    fcntl.flock(  # pragma: no cover - Windows is the production target.
        lock_file.fileno(),
        fcntl.LOCK_EX | fcntl.LOCK_NB,
    )


def _unlock_file(lock_file: BinaryIO) -> None:
    lock_file.seek(0)

    if os.name == "nt":
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        return

    fcntl.flock(  # pragma: no cover - Windows is the production target.
        lock_file.fileno(),
        fcntl.LOCK_UN,
    )


class CameraAgentOwnership:
    """Hold the process lock and its matching PID record for one lifetime."""

    def __init__(
        self,
        lock_path: str | Path = CAMERA_AGENT_LOCK_PATH,
        pid_path: str | Path = CAMERA_AGENT_PID_PATH,
    ) -> None:
        self.lock_path = Path(lock_path)
        self.pid_path = Path(pid_path)
        self._lock_file: BinaryIO | None = None
        self.pid = os.getpid()

    def acquire(self) -> None:
        if self._lock_file is not None:
            return

        if self.pid <= 0:
            raise CameraAgentOwnershipError(
                "The Camera Agent process identifier is invalid."
            )

        try:
            self.lock_path.parent.mkdir(parents=True, exist_ok=True)
            self.pid_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = self.lock_path.open("a+b")
            lock_file.seek(0, os.SEEK_END)

            if lock_file.tell() == 0:
                lock_file.write(b"\0")
                lock_file.flush()

            lock_file.seek(0)
        except OSError as error:
            raise CameraAgentOwnershipError(
                "The Camera Agent runtime directory is unavailable."
            ) from error

        try:
            _lock_file_nonblocking(lock_file)
        except OSError as error:
            lock_file.close()
            raise CameraAgentAlreadyRunning(
                "Another AquaGuard Camera Agent is already running."
            ) from error

        self._lock_file = lock_file

        try:
            # Keep this file machine-readable for a future targeted stop tool.
            self.pid_path.write_text(str(self.pid), encoding="ascii")
        except OSError as error:
            self._release_lock_file()
            raise CameraAgentOwnershipError(
                "The Camera Agent PID record could not be written."
            ) from error

    def _cleanup_owned_pid(self) -> None:
        try:
            recorded_pid = self.pid_path.read_text(
                encoding="ascii"
            ).strip()
        except (OSError, UnicodeError):
            return

        if recorded_pid != str(self.pid):
            return

        try:
            self.pid_path.unlink(missing_ok=True)
        except OSError:
            pass

    def _release_lock_file(self) -> None:
        lock_file = self._lock_file
        self._lock_file = None

        if lock_file is None:
            return

        try:
            _unlock_file(lock_file)
        except OSError:
            pass
        finally:
            lock_file.close()

    def release(self) -> None:
        if self._lock_file is None:
            return

        # Remove only this process's record while ownership is still held.
        self._cleanup_owned_pid()
        self._release_lock_file()

    def __enter__(self) -> "CameraAgentOwnership":
        self.acquire()
        return self

    def __exit__(self, _error_type, _error, _traceback) -> None:
        self.release()


def create_camera_agent_server():
    """Bind loopback before initializing any heavy detector resources."""

    return create_server(
        stream_api.app,
        host=CAMERA_AGENT_HOST,
        port=CAMERA_AGENT_PORT,
        threads=CAMERA_AGENT_THREADS,
    )


def run_camera_agent(
    *,
    lock_path: str | Path = CAMERA_AGENT_LOCK_PATH,
    pid_path: str | Path = CAMERA_AGENT_PID_PATH,
) -> int:
    """Own, bind, initialize, and run exactly one production agent."""

    ownership = CameraAgentOwnership(lock_path, pid_path)

    try:
        ownership.acquire()
    except CameraAgentAlreadyRunning:
        print("AquaGuard Camera Agent is already running.")
        return 0
    except CameraAgentOwnershipError:
        print(
            "AquaGuard Camera Agent could not secure its runtime files. "
            "Check the detector data-folder permissions."
        )
        return 1

    server = None

    try:
        try:
            server = create_camera_agent_server()
        except Exception:
            print(
                "AquaGuard Camera Agent could not bind to "
                f"http://{CAMERA_AGENT_HOST}:{CAMERA_AGENT_PORT}."
            )
            return 1

        try:
            stream_api.initialize_camera_agent()
            print(
                "AquaGuard Camera Agent is running at "
                f"http://{CAMERA_AGENT_HOST}:{CAMERA_AGENT_PORT}."
            )
            server.run()
            return 0
        except Exception:
            print("AquaGuard Camera Agent stopped after an internal error.")
            return 1
        finally:
            try:
                server.close()
            except Exception:
                pass
    finally:
        ownership.release()


def main() -> int:
    return run_camera_agent()


if __name__ == "__main__":
    raise SystemExit(main())
