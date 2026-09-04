from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BUILDER_SCRIPT = PROJECT_ROOT / "scripts" / "build_portable_client.py"


class PortableBuildContractTests(unittest.TestCase):
    def test_builder_script_exists(self):
        self.assertTrue(
            BUILDER_SCRIPT.is_file(),
            f"Missing portable builder script: {BUILDER_SCRIPT}",
        )

    def test_builder_content_and_specifications(self):
        content = BUILDER_SCRIPT.read_text(encoding="utf-8")

        # Must specify CPython 3.12.10 AMD64 embeddable
        self.assertIn('PYTHON_VERSION = "3.12.10"', content)
        self.assertIn("python-3.12.10-embed-amd64.zip", content)
        self.assertIn("python.org/ftp/python", content)

        # Must exclude sensitive / developer runtime files
        self.assertIn('".venv"', content)
        self.assertIn('"camera_config.json"', content)
        self.assertIn('"camera_agent.pid"', content)
        self.assertIn('"camera_agent.lock"', content)
        self.assertIn('"camera_agent.log"', content)

        # Must include core detector files and model
        self.assertIn('"run_camera_agent.py"', content)
        self.assertIn('"stream_api.py"', content)
        self.assertIn('"flood_best.pt"', content)

        # Must configure python312._pth with site-packages and detector
        self.assertIn("python312._pth", content)
        self.assertIn("Lib/site-packages", content)
        self.assertIn("../detector", content)
        self.assertIn("import site", content)

    def test_portable_start_launcher_contract(self):
        from scripts import build_portable_client

        launcher = build_portable_client.PORTABLE_START_BAT_CONTENT
        normalized = launcher.lower()

        # Must use bundled private python runtime, NOT .venv
        self.assertIn("%aquaguard_root%python\\python.exe", normalized)
        self.assertNotIn(".venv\\scripts\\python.exe", normalized)

        # Must target local health check and production Vercel frontend
        self.assertIn("http://127.0.0.1:5000/health", normalized)
        self.assertIn("https://aquaguard-live.vercel.app", normalized)

        # Must target run_camera_agent.py
        self.assertIn("run_camera_agent.py", normalized)

        # Must NOT attempt to run local development servers
        forbidden_fragments = (
            "npm install",
            "npm run",
            "localhost:5173",
            "127.0.0.1:5173",
            "vite",
        )
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, normalized)

    def test_portable_stop_launcher_contract(self):
        from scripts import build_portable_client

        launcher = build_portable_client.PORTABLE_STOP_BAT_CONTENT
        normalized = launcher.lower()

        # Must use bundled private python runtime
        self.assertIn("%aquaguard_root%python\\python.exe", normalized)
        self.assertNotIn(".venv", normalized)

        # Must validate exact process identity and avoid broad kills
        self.assertIn("camera_agent.pid", normalized)
        self.assertIn("stop-process -id $agentprocessid", normalized)
        self.assertIn("refusing to stop", normalized)
        self.assertNotIn("taskkill", normalized)
        self.assertNotIn("/im", normalized)
        self.assertNotIn("stop-process -name", normalized)

    def test_clean_placeholder_env(self):
        from scripts import build_portable_client

        placeholder_env = build_portable_client.CLEAN_PLACEHOLDER_ENV

        self.assertIn("SUPABASE_URL=https://your-project.supabase.co", placeholder_env)
        self.assertIn("SUPABASE_SECRET_KEY=your-service-role-key", placeholder_env)
        self.assertNotIn("eyJ", placeholder_env)
        self.assertNotIn("sbp_", placeholder_env)


if __name__ == "__main__":
    unittest.main()
