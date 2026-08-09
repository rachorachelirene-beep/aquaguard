from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
START_LAUNCHER = PROJECT_ROOT / "START_AQUAGUARD.bat"
STOP_LAUNCHER = PROJECT_ROOT / "STOP_AQUAGUARD.bat"


class WindowsLauncherContractTests(unittest.TestCase):
    def read_launcher(self, path: Path) -> str:
        self.assertTrue(path.is_file(), f"Missing launcher: {path.name}")
        return path.read_text(encoding="utf-8")

    def test_start_launcher_targets_the_local_agent_and_vercel(self):
        launcher = self.read_launcher(START_LAUNCHER)
        normalized = launcher.lower()

        self.assertIn("%~dp0", launcher)
        self.assertIn(
            "http://127.0.0.1:5000/health",
            normalized,
        )
        self.assertIn(
            "https://aquaguard-live.vercel.app",
            normalized,
        )
        self.assertIn(
            'set "detector_dir=%aquaguard_root%detector"',
            normalized,
        )
        self.assertIn(".venv\\scripts\\python.exe", normalized)
        self.assertIn("run_camera_agent.py", normalized)
        self.assertIn("invoke-restmethod", normalized)
        self.assertIn("aquaguard camera api", normalized)

    def test_start_launcher_has_bounded_camera_independent_polling(self):
        launcher = self.read_launcher(START_LAUNCHER)
        normalized = launcher.lower()

        self.assertIn('set "max_health_attempts=120"', normalized)
        self.assertGreaterEqual(normalized.count("call :probe_agent"), 2)
        self.assertIn("if errorlevel 2 goto unexpected_service", normalized)
        self.assertNotIn("camera_connected", normalized)

        first_probe = normalized.index("call :probe_agent")
        agent_start = normalized.index(
            'start "aquaguard camera agent"'
        )
        self.assertLess(first_probe, agent_start)

    def test_start_launcher_does_not_start_development_frontend(self):
        launcher = self.read_launcher(START_LAUNCHER)
        normalized = launcher.lower()

        forbidden_fragments = (
            "npm install",
            "npm run",
            "localhost:5173",
            "127.0.0.1:5173",
            "stream_api.py",
            "vite",
        )

        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, normalized)

    def test_stop_launcher_validates_exact_process_identity(self):
        launcher = self.read_launcher(STOP_LAUNCHER)
        normalized = launcher.lower()

        self.assertIn("detector\\data\\camera_agent.pid", normalized)
        self.assertIn(
            "detector\\.venv\\scripts\\python.exe",
            normalized,
        )
        self.assertIn("detector\\.venv\\pyvenv.cfg", normalized)
        self.assertIn("executable\\s*=", normalized)
        self.assertIn("ispathrooted", normalized)
        self.assertIn("$matchesdeclaredbase", normalized)
        self.assertIn("$declaredpythonargument", normalized)
        self.assertIn("detector\\run_camera_agent.py", normalized)
        self.assertIn("get-ciminstance win32_process", normalized)
        self.assertIn("executablepath", normalized)
        self.assertIn("commandline", normalized)
        self.assertIn("getfullpath", normalized)
        self.assertIn("ordinalignorecase", normalized)
        self.assertIn("$commandpattern", normalized)
        self.assertIn("\\s+-u\\s+", normalized)
        self.assertIn("stop-process -id $agentprocessid", normalized)

    def test_stop_launcher_never_broad_kills_python(self):
        launcher = self.read_launcher(STOP_LAUNCHER)
        normalized = launcher.lower()

        self.assertNotIn("taskkill", normalized)
        self.assertNotIn("/im", normalized)
        self.assertNotIn("stop-process -name", normalized)
        self.assertIn("refusing to stop", normalized)


if __name__ == "__main__":
    unittest.main()
