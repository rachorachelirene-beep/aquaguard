from __future__ import annotations

import importlib
import os
import threading
import unittest
from pathlib import Path
from unittest import mock

from detector import run_camera_agent, stream_api


RealThread = threading.Thread
TEST_DIRECTORY = Path(__file__).resolve().parent


class FakeCaptureThread:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.started = False

    def start(self):
        self.started = True

    def is_alive(self):
        return self.started


class FakeWaitressServer:
    def __init__(self, events):
        self.events = events

    def run(self):
        self.events.append("run")

    def close(self):
        self.events.append("close")


class CameraAgentInitializationTests(unittest.TestCase):
    def test_production_module_import_does_not_initialize_pipeline(self):
        with mock.patch.object(
            stream_api,
            "initialize_camera_agent",
        ) as initialize:
            importlib.reload(run_camera_agent)

        initialize.assert_not_called()

    def test_initializer_is_concurrency_safe_and_runs_each_phase_once(self):
        original_initialized = stream_api.camera_agent_initialized
        stream_api.camera_agent_initialized = False
        load_entered = threading.Event()
        allow_load_to_finish = threading.Event()
        results = []

        def slow_model_load():
            load_entered.set()
            self.assertTrue(allow_load_to_finish.wait(2))

        try:
            with (
                mock.patch.object(
                    stream_api,
                    "load_yolo_model",
                    side_effect=slow_model_load,
                ) as load_model,
                mock.patch.object(
                    stream_api,
                    "connect_supabase",
                ) as connect_supabase,
                mock.patch.object(
                    stream_api,
                    "start_weather_sync",
                ) as start_weather,
                mock.patch.object(
                    stream_api,
                    "start_capture_thread",
                ) as start_capture,
            ):
                first = RealThread(
                    target=lambda: results.append(
                        stream_api.initialize_camera_agent()
                    )
                )
                second = RealThread(
                    target=lambda: results.append(
                        stream_api.initialize_camera_agent()
                    )
                )

                first.start()
                self.assertTrue(load_entered.wait(2))
                second.start()
                allow_load_to_finish.set()
                first.join(2)
                second.join(2)

                self.assertFalse(first.is_alive())
                self.assertFalse(second.is_alive())
                self.assertCountEqual(results, [True, False])
                self.assertEqual(load_model.call_count, 1)
                self.assertEqual(connect_supabase.call_count, 1)
                self.assertEqual(start_weather.call_count, 1)
                self.assertEqual(start_capture.call_count, 1)
        finally:
            allow_load_to_finish.set()
            stream_api.camera_agent_initialized = original_initialized

    def test_concurrent_capture_starts_create_one_worker(self):
        original_capture_thread = stream_api.capture_thread
        original_stop_state = stream_api.stop_event.is_set()
        stream_api.capture_thread = None

        try:
            with mock.patch.object(
                stream_api.threading,
                "Thread",
                side_effect=FakeCaptureThread,
            ) as thread_factory:
                callers = [
                    RealThread(target=stream_api.start_capture_thread)
                    for _ in range(4)
                ]

                for caller in callers:
                    caller.start()

                for caller in callers:
                    caller.join(2)

            self.assertEqual(thread_factory.call_count, 1)
            self.assertTrue(stream_api.capture_thread.is_alive())
        finally:
            stream_api.capture_thread = original_capture_thread

            if original_stop_state:
                stream_api.stop_event.set()
            else:
                stream_api.stop_event.clear()

    def test_supabase_startup_log_redacts_backend_secret(self):
        original_supabase = stream_api.supabase
        original_error = stream_api.supabase_error
        backend_secret = "test-service-role-secret"

        try:
            with (
                mock.patch.object(
                    stream_api,
                    "SUPABASE_URL",
                    "https://example.supabase.co",
                ),
                mock.patch.object(
                    stream_api,
                    "SUPABASE_SECRET_KEY",
                    backend_secret,
                ),
                mock.patch.object(
                    stream_api,
                    "create_client",
                    side_effect=RuntimeError(
                        f"connection rejected for {backend_secret}"
                    ),
                ),
                mock.patch("builtins.print") as print_message,
            ):
                stream_api.connect_supabase()

            output = " ".join(
                str(argument)
                for call in print_message.call_args_list
                for argument in call.args
            )
            self.assertNotIn(backend_secret, output)
            self.assertIn("***", output)
        finally:
            stream_api.supabase = original_supabase
            stream_api.supabase_error = original_error


class CameraAgentOwnershipTests(unittest.TestCase):
    def setUp(self):
        suffix = f"{os.getpid()}_{self._testMethodName}"
        self.lock_path = TEST_DIRECTORY / (
            f".camera_agent_{suffix}.lock"
        )
        self.pid_path = TEST_DIRECTORY / (
            f".camera_agent_{suffix}.pid"
        )

        self.lock_path.unlink(missing_ok=True)
        self.pid_path.unlink(missing_ok=True)

    def tearDown(self):
        self.lock_path.unlink(missing_ok=True)
        self.pid_path.unlink(missing_ok=True)

    def test_ownership_writes_plain_positive_pid_and_cleans_it(self):
        ownership = run_camera_agent.CameraAgentOwnership(
            self.lock_path,
            self.pid_path,
        )

        ownership.acquire()

        try:
            pid_text = self.pid_path.read_text(encoding="ascii")
            self.assertEqual(pid_text, str(os.getpid()))
            self.assertTrue(pid_text.isdecimal())
            self.assertGreater(int(pid_text), 0)
        finally:
            ownership.release()

        self.assertFalse(self.pid_path.exists())
        self.assertTrue(self.lock_path.exists())

    def test_cleanup_does_not_remove_a_pid_owned_by_another_process(self):
        ownership = run_camera_agent.CameraAgentOwnership(
            self.lock_path,
            self.pid_path,
        )
        ownership.acquire()
        self.pid_path.write_text("999999", encoding="ascii")
        ownership.release()

        self.assertEqual(
            self.pid_path.read_text(encoding="ascii"),
            "999999",
        )

    def test_second_owner_cannot_acquire_the_same_lock(self):
        first = run_camera_agent.CameraAgentOwnership(
            self.lock_path,
            self.pid_path,
        )
        second = run_camera_agent.CameraAgentOwnership(
            self.lock_path,
            self.pid_path,
        )
        first.acquire()

        try:
            with self.assertRaises(
                run_camera_agent.CameraAgentAlreadyRunning
            ):
                second.acquire()
        finally:
            first.release()

    def test_server_binds_before_pipeline_initialization(self):
        events = []
        fake_server = FakeWaitressServer(events)

        def fake_create_server(app, **kwargs):
            events.append("create_server")
            self.assertIs(app, stream_api.app)
            self.assertEqual(kwargs["host"], "127.0.0.1")
            self.assertEqual(kwargs["port"], 5000)
            self.assertEqual(kwargs["threads"], 8)
            self.assertEqual(
                self.pid_path.read_text(encoding="ascii"),
                str(os.getpid()),
            )
            return fake_server

        with (
            mock.patch.object(
                run_camera_agent,
                "create_server",
                side_effect=fake_create_server,
            ),
            mock.patch.object(
                stream_api,
                "initialize_camera_agent",
                side_effect=lambda: events.append("initialize"),
            ) as initialize,
        ):
            result = run_camera_agent.run_camera_agent(
                lock_path=self.lock_path,
                pid_path=self.pid_path,
            )

        self.assertEqual(result, 0)
        self.assertEqual(
            events,
            ["create_server", "initialize", "run", "close"],
        )
        initialize.assert_called_once_with()
        self.assertFalse(self.pid_path.exists())

    def test_existing_owner_exits_before_server_or_pipeline_start(self):
        with (
            mock.patch.object(
                run_camera_agent.CameraAgentOwnership,
                "acquire",
                side_effect=run_camera_agent.CameraAgentAlreadyRunning,
            ),
            mock.patch.object(
                run_camera_agent,
                "create_camera_agent_server",
            ) as create_server,
            mock.patch.object(
                stream_api,
                "initialize_camera_agent",
            ) as initialize,
        ):
            result = run_camera_agent.run_camera_agent()

        self.assertEqual(result, 0)
        create_server.assert_not_called()
        initialize.assert_not_called()

    def test_bind_failure_cleans_pid_without_initializing_pipeline(self):
        with (
            mock.patch.object(
                run_camera_agent,
                "create_camera_agent_server",
                side_effect=OSError("address already in use"),
            ),
            mock.patch.object(
                stream_api,
                "initialize_camera_agent",
            ) as initialize,
        ):
            result = run_camera_agent.run_camera_agent(
                lock_path=self.lock_path,
                pid_path=self.pid_path,
            )

        self.assertEqual(result, 1)
        self.assertFalse(self.pid_path.exists())
        initialize.assert_not_called()


if __name__ == "__main__":
    unittest.main()
