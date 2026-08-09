@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "AQUAGUARD_ROOT=%~dp0"
set "DETECTOR_DIR=%AQUAGUARD_ROOT%detector"
set "DATA_DIR=%DETECTOR_DIR%\data"
set "PYTHON_EXE=%DETECTOR_DIR%\.venv\Scripts\python.exe"
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

"%PYTHON_EXE%" -c "import waitress" >nul 2>&1
if errorlevel 1 goto missing_waitress

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%" >nul 2>&1
if not exist "%DATA_DIR%" goto data_directory_error

echo Starting AquaGuard Camera Agent...
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
echo AquaGuard cannot start because its detector environment is missing.
echo Expected: "%PYTHON_EXE%"
echo Contact the AquaGuard system administrator.
goto launcher_error

:missing_entry
echo.
echo AquaGuard cannot start because the Camera Agent entry point is missing.
echo Expected: "%AGENT_ENTRY%"
echo Contact the AquaGuard system administrator.
goto launcher_error

:missing_waitress
echo.
echo AquaGuard cannot start because the production Camera Agent dependencies are incomplete.
echo Contact the AquaGuard system administrator to restore the detector environment.
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
echo AquaGuard Camera Agent did not become ready after repeated health checks.
echo Camera availability does not control this check.
echo Review the safe local log: "%AGENT_LOG%"
goto launcher_error

:launcher_error
echo.
pause
exit /b 1

:probe_agent
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ProgressPreference = 'SilentlyContinue'; try { $response = Invoke-RestMethod -Uri $env:HEALTH_URL -Method Get -TimeoutSec 2; if (($response.service -eq 'AquaGuard Camera API') -and ($response.running -eq $true)) { exit 0 }; exit 2 } catch { if ($null -ne $_.Exception.Response) { exit 2 }; exit 1 }" >nul 2>&1
exit /b %ERRORLEVEL%
