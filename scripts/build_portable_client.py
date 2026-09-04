"""AquaGuard Portable Client Builder.

Builds an isolated, zero-dependency portable Windows client distribution for
the AquaGuard Camera Agent using official CPython 3.12.10 embeddable AMD64.

Guarantees:
- Bundles private Python 3.12.10 runtime (no system Python required on client).
- No PyInstaller or binary compiler used; clean embeddable CPython runtime.
- Populates site-packages with needed dependencies (.pyd, DLLs, dist-info).
- Generates configured python312._pth.
- Includes clean placeholder detector/.env (never real developer credentials).
- Excludes .venv, real .env, runtime camera_config.json, PID/lock files, logs.
- Produces one-click AquaGuard.bat and safe STOP_AQUAGUARD.bat.
- Does not require Node, npm, pip, or virtual environments on the client machine.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path


PYTHON_VERSION = "3.12.10"
PYTHON_EMBED_ZIP_NAME = f"python-{PYTHON_VERSION}-embed-amd64.zip"
PYTHON_EMBED_URL = (
    f"https://www.python.org/ftp/python/{PYTHON_VERSION}/{PYTHON_EMBED_ZIP_NAME}"
)

FORBIDDEN_COPY_NAMES = {
    ".venv",
    ".git",
    "__pycache__",
    "camera_config.json",
    "camera_agent.pid",
    "camera_agent.lock",
    "camera_agent.log",
    ".env",
}

REQUIRED_DETECTOR_FILES = [
    "run_camera_agent.py",
    "stream_api.py",
    "camera_config.py",
    "weather_service.py",
    "flood_risk.py",
    "gauge.py",
    "admin_auth.py",
    "requirements.txt",
]

PORTABLE_START_BAT_CONTENT = r"""@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "AQUAGUARD_ROOT=%~dp0"
set "PYTHON_EXE=%AQUAGUARD_ROOT%python\python.exe"
set "DETECTOR_DIR=%AQUAGUARD_ROOT%detector"
set "DATA_DIR=%DETECTOR_DIR%\data"
set "AGENT_ENTRY=%DETECTOR_DIR%\run_camera_agent.py"
set "AGENT_LOG=%DATA_DIR%\camera_agent.log"
set "HEALTH_URL=http://127.0.0.1:5000/health"
set "FRONTEND_URL=https://aquaguard-live.vercel.app"
set "MAX_HEALTH_ATTEMPTS=120"

call :probe_agent
if errorlevel 2 goto unexpected_service
if not errorlevel 1 goto open_aquaguard

if not exist "%PYTHON_EXE%" goto missing_python
if not exist "%AGENT_ENTRY%" goto missing_entry

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%" >nul 2>&1
if not exist "%DATA_DIR%" goto data_directory_error

echo Starting AquaGuard Camera Agent (Portable)...
pushd "%DETECTOR_DIR%" >nul 2>&1
if errorlevel 1 goto detector_directory_error

start "AquaGuard Camera Agent" /min "%PYTHON_EXE%" -u "%AGENT_ENTRY%" 1>>"%AGENT_LOG%" 2>&1
set "AGENT_START_RESULT=%ERRORLEVEL%"
popd

if not "%AGENT_START_RESULT%"=="0" goto start_error

set /a HEALTH_ATTEMPT=0

:wait_for_agent
set /a HEALTH_ATTEMPT+=1
call :probe_agent
if errorlevel 2 goto unexpected_service
if not errorlevel 1 goto open_aquaguard

if %HEALTH_ATTEMPT% geq %MAX_HEALTH_ATTEMPTS% goto startup_timeout
timeout /t 1 /nobreak >nul 2>&1
goto wait_for_agent

:open_aquaguard
echo AquaGuard Camera Agent is online.
echo Opening AquaGuard...
start "" "%FRONTEND_URL%"
exit /b 0

:missing_python
echo.
echo AquaGuard cannot start because the bundled Python runtime is missing.
echo Expected: "%PYTHON_EXE%"
echo Contact the AquaGuard system administrator.
goto launcher_error

:missing_entry
echo.
echo AquaGuard cannot start because the Camera Agent entry point is missing.
echo Expected: "%AGENT_ENTRY%"
echo Contact the AquaGuard system administrator.
goto launcher_error

:data_directory_error
echo.
echo AquaGuard cannot create its local runtime data directory.
echo Check the Windows account permissions for: "%DATA_DIR%"
goto launcher_error

:detector_directory_error
echo.
echo AquaGuard cannot access its detector directory.
echo Expected: "%DETECTOR_DIR%"
goto launcher_error

:start_error
echo.
echo Windows could not start the AquaGuard Camera Agent.
echo Review the installation or contact the AquaGuard system administrator.
goto launcher_error

:unexpected_service
echo.
echo AquaGuard cannot use local port 5000 because it is occupied by another service.
echo Close the conflicting application or contact the AquaGuard system administrator.
goto launcher_error

:startup_timeout
echo.
echo AquaGuard Camera Agent did not respond within %MAX_HEALTH_ATTEMPTS% seconds.
echo Check the runtime log: "%AGENT_LOG%"
goto launcher_error

:launcher_error
echo.
pause
exit /b 1

:probe_agent
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; try { $response = Invoke-RestMethod -Uri '%HEALTH_URL%' -Method Get -TimeoutSec 2; if ($response.service -eq 'aquaguard-camera-api') { exit 0 } exit 2 } catch { exit 1 }"
exit /b %ERRORLEVEL%
"""

PORTABLE_STOP_BAT_CONTENT = r"""@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "AQUAGUARD_ROOT=%~dp0"
set "AQUAGUARD_PID_FILE=%AQUAGUARD_ROOT%detector\data\camera_agent.pid"
set "AQUAGUARD_EXPECTED_PYTHON=%AQUAGUARD_ROOT%python\python.exe"
set "AQUAGUARD_EXPECTED_ENTRY=%AQUAGUARD_ROOT%detector\run_camera_agent.py"

if not exist "%AQUAGUARD_PID_FILE%" (
  echo AquaGuard Camera Agent is not running, or no validated PID file is available.
  exit /b 0
)

powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; try { $pidFile = [IO.Path]::GetFullPath($env:AQUAGUARD_PID_FILE); $expectedPython = [IO.Path]::GetFullPath($env:AQUAGUARD_EXPECTED_PYTHON); $expectedEntry = [IO.Path]::GetFullPath($env:AQUAGUARD_EXPECTED_ENTRY); $pidText = (Get-Content -Raw -LiteralPath $pidFile).Trim(); $agentProcessId = 0; if ((-not [int]::TryParse($pidText, [ref]$agentProcessId)) -or ($agentProcessId -le 0)) { Write-Host 'Refusing to stop: the AquaGuard PID file is invalid.'; exit 3 }; $knownProcess = Get-Process -Id $agentProcessId -ErrorAction SilentlyContinue; if ($null -eq $knownProcess) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'AquaGuard Camera Agent is already stopped.'; exit 0 }; $agentProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $agentProcessId) -ErrorAction Stop; if ($null -eq $agentProcess) { Write-Host 'Refusing to stop: Windows could not validate the AquaGuard process.'; exit 7 }; $actualPython = if ($agentProcess.ExecutablePath) { [IO.Path]::GetFullPath($agentProcess.ExecutablePath) } else { '' }; $matchesPython = [string]::Equals($actualPython, $expectedPython, [StringComparison]::OrdinalIgnoreCase); if (-not $matchesPython) { Write-Host 'Refusing to stop: the PID does not match the AquaGuard portable Python.'; exit 4 }; $pythonArgument = '(?:\x22' + [regex]::Escape($expectedPython) + '\x22|' + [regex]::Escape($expectedPython) + ')'; $entryArgument = '(?:\x22' + [regex]::Escape($expectedEntry) + '\x22|' + [regex]::Escape($expectedEntry) + ')'; $commandPattern = '(?i)^\s*' + $pythonArgument + '\s+-u\s+' + $entryArgument + '\s*$'; if ([string]::IsNullOrWhiteSpace($agentProcess.CommandLine) -or ($agentProcess.CommandLine -notmatch $commandPattern)) { Write-Host 'Refusing to stop: the PID is not running the exact AquaGuard Camera Agent command.'; exit 5 }; Stop-Process -Id $agentProcessId -Force -ErrorAction Stop; $deadline = [DateTime]::UtcNow.AddSeconds(10); do { Start-Sleep -Milliseconds 250; $remaining = Get-Process -Id $agentProcessId -ErrorAction SilentlyContinue } while (($null -ne $remaining) -and ([DateTime]::UtcNow -lt $deadline)); if ($null -ne $remaining) { Write-Host 'AquaGuard Camera Agent did not stop within 10 seconds.'; exit 6 }; Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'AquaGuard Camera Agent stopped safely.'; exit 0 } catch { Write-Host 'AquaGuard could not validate or stop the Camera Agent. No unrelated process was stopped.'; exit 7 }"

set "STOP_RESULT=%ERRORLEVEL%"
if "%STOP_RESULT%"=="0" exit /b 0

echo.
echo No unrelated Python process was stopped.
pause
exit /b %STOP_RESULT%
"""

CLEAN_PLACEHOLDER_ENV = """# AquaGuard Portable Client Environment Template
# Authorized administrator must configure Supabase settings before deployment.

CAMERA_SOURCE=usb
CAMERA_FALLBACK_TO_WEBCAM=true
CAMERA_INDEX=0

CAMERA_WIDTH=1280
CAMERA_HEIGHT=720
CAMERA_FPS=15
JPEG_QUALITY=85
STREAM_FPS=12
PROCESSING_WIDTH=1280
PROCESSING_HEIGHT=720
OPENCV_THREADS=1
RTSP_FRAME_SKIP=3

FLASK_HOST=127.0.0.1
FLASK_PORT=5000

YOLO_ENABLED=true
YOLO_MODEL_PATH=models/flood_best.pt
YOLO_CONFIDENCE=0.35
YOLO_IMAGE_SIZE=416
YOLO_FRAME_INTERVAL=12
YOLO_MAX_DETECTIONS=3
YOLO_DEVICE=cpu

MIN_LEVEL_M=0.00
MAX_LEVEL_M=3.00
NORMAL_LEVEL_M=1.00
WARNING_LEVEL_M=2.00
CRITICAL_LEVEL_M=2.50

GAUGE_ENABLED=true
GAUGE_POINTS=0.70,0.12;0.80,0.13;0.75,0.88;0.64,0.87
GAUGE_TICK_INTERVAL_M=0.25
GAUGE_LABEL_INTERVAL_M=0.50
WATERLINE_ROW_COVERAGE=0.30
WATERLINE_FALLBACK_ROW_COVERAGE=0.08

DEFAULT_STATION_ID=1
SUPABASE_WRITE_INTERVAL=5
ALERT_COOLDOWN_SECONDS=300

WEATHER_ENABLED=true
WEATHER_SYNC_INTERVAL_SECONDS=600
WEATHER_REQUEST_TIMEOUT_SECONDS=15

# REQUIRED: Set valid Supabase credentials for this monitoring station
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key
"""


def ensure_embeddable_python(cache_dir: Path) -> Path:
    """Download or locate official python-3.12.10-embed-amd64.zip."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / PYTHON_EMBED_ZIP_NAME
    if not zip_path.is_file():
        print(f"Downloading {PYTHON_EMBED_URL} -> {zip_path}...")
        urllib.request.urlretrieve(PYTHON_EMBED_URL, zip_path)
    return zip_path


def copy_site_packages(source_site_packages: Path, target_site_packages: Path) -> None:
    """Copy site-packages preserving .pyd, DLL, and metadata."""
    target_site_packages.mkdir(parents=True, exist_ok=True)

    # Core packages required by AquaGuard detector runtime
    relevant_prefixes = (
        "flask",
        "werkzeug",
        "jinja2",
        "markupsafe",
        "itsdangerous",
        "click",
        "blinker",
        "cv2",
        "numpy",
        "ultralytics",
        "torch",
        "torchvision",
        "PIL",
        "pillow",
        "dotenv",
        "supabase",
        "postgrest",
        "gotrue",
        "storage3",
        "realtime",
        "httpx",
        "httpcore",
        "h11",
        "anyio",
        "sniffio",
        "certifi",
        "idna",
        "requests",
        "urllib3",
        "charset_normalizer",
        "pydantic",
        "pydantic_core",
        "annotated_types",
        "typing_extensions",
        "waitress",
        "yaml",
        "filelock",
        "fsspec",
        "sympy",
        "mpmath",
        "networkx",
    )

    copied_count = 0
    for item in source_site_packages.iterdir():
        name_lower = item.name.lower()

        # Skip caches and local venv artifacts
        if name_lower.startswith("__pycache__") or name_lower.startswith("pip"):
            continue

        is_match = False
        if any(name_lower.startswith(p) for p in relevant_prefixes):
            is_match = True
        elif name_lower.endswith(".dist-info") and any(
            name_lower.startswith(p) for p in relevant_prefixes
        ):
            is_match = True

        if is_match:
            dest = target_site_packages / item.name
            if item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dest)
            copied_count += 1

    print(f"Populated {copied_count} packages/modules to {target_site_packages}")


def build_portable_distribution(
    repo_root: Path,
    output_dir: Path,
    cache_dir: Path | None = None,
    create_zip: bool = False,
) -> Path:
    """Assemble AquaGuard-Portable folder."""
    if cache_dir is None:
        cache_dir = repo_root / "portable_runtime_cache"

    portable_root = output_dir / "AquaGuard-Portable"
    if portable_root.exists():
        shutil.rmtree(portable_root)
    portable_root.mkdir(parents=True, exist_ok=True)

    # 1. Extract Embeddable Python
    python_zip = ensure_embeddable_python(cache_dir)
    python_target = portable_root / "python"
    python_target.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(python_zip, "r") as zf:
        zf.extractall(python_target)

    # 2. Configure python312._pth for site-packages and detector module resolution
    pth_file = python_target / "python312._pth"
    pth_content = (
        "python312.zip\n"
        ".\n"
        "Lib\n"
        "Lib/site-packages\n"
        "../detector\n"
        "import site\n"
    )
    pth_file.write_text(pth_content, encoding="utf-8")

    # 3. Populate Lib/site-packages from active development python
    site_packages_source = Path(sys.prefix) / "Lib" / "site-packages"
    if not site_packages_source.exists():
        # Fallback to local python user site or known path
        site_packages_source = Path(sys.executable).parent / "Lib" / "site-packages"

    if site_packages_source.exists():
        copy_site_packages(site_packages_source, python_target / "Lib" / "site-packages")
    else:
        print(f"Warning: site-packages not found at {site_packages_source}")

    # 4. Copy detector files
    detector_src = repo_root / "detector"
    detector_dest = portable_root / "detector"
    detector_dest.mkdir(parents=True, exist_ok=True)

    for filename in REQUIRED_DETECTOR_FILES:
        src_file = detector_src / filename
        if src_file.is_file():
            shutil.copy2(src_file, detector_dest / filename)
        else:
            print(f"Warning: required file {src_file} missing!")

    # Copy YOLO model
    model_src = detector_src / "models" / "flood_best.pt"
    if model_src.is_file():
        model_dest_dir = detector_dest / "models"
        model_dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(model_src, model_dest_dir / "flood_best.pt")

    # Ensure empty data directory exists with .gitkeep
    data_dir = detector_dest / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    # Write clean placeholder .env
    (detector_dest / ".env").write_text(CLEAN_PLACEHOLDER_ENV, encoding="utf-8")

    # 5. Write portable launchers
    (portable_root / "AquaGuard.bat").write_text(
        PORTABLE_START_BAT_CONTENT, encoding="utf-8"
    )
    (portable_root / "STOP_AQUAGUARD.bat").write_text(
        PORTABLE_STOP_BAT_CONTENT, encoding="utf-8"
    )

    # Write portable README
    portable_readme = (
        "# AquaGuard Portable Monitoring Client\n\n"
        "This is the standalone portable distribution of the AquaGuard Camera Agent.\n\n"
        "## Quick Start (Barangay Operators)\n"
        "1. Turn on the PC.\n"
        "2. Plug in USB webcam OR ensure CCTV/router is powered on.\n"
        "3. Double-click **AquaGuard.bat**.\n"
        "4. The system starts the local agent and opens the web application.\n\n"
        "## First-Time Installation (Administrator Only)\n"
        "Before deploying to a monitoring PC, configure `detector/.env` with the valid\n"
        "Supabase credentials for this station.\n"
    )
    (portable_root / "README.txt").write_text(portable_readme, encoding="utf-8")

    print(f"Successfully assembled portable client at: {portable_root}")

    if create_zip:
        release_dir = repo_root / "release"
        release_dir.mkdir(parents=True, exist_ok=True)
        zip_output = release_dir / "AquaGuard-Portable.zip"
        print(f"Creating portable zip artifact at {zip_output}...")
        with zipfile.ZipFile(zip_output, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(portable_root):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(output_dir)
                    zf.write(file_path, arcname)
        print(f"Created {zip_output} ({zip_output.stat().st_size} bytes)")

    return portable_root


def main() -> int:
    parser = argparse.ArgumentParser(description="Build AquaGuard Portable Client")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "dist_portable",
        help="Target directory for portable package",
    )
    parser.add_argument(
        "--zip",
        action="store_true",
        help="Also build release/AquaGuard-Portable.zip",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    build_portable_distribution(
        repo_root=repo_root,
        output_dir=args.output_dir,
        create_zip=args.zip,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
