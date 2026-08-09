@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "AQUAGUARD_ROOT=%~dp0"
set "AQUAGUARD_PID_FILE=%AQUAGUARD_ROOT%detector\data\camera_agent.pid"
set "AQUAGUARD_EXPECTED_PYTHON=%AQUAGUARD_ROOT%detector\.venv\Scripts\python.exe"
set "AQUAGUARD_VENV_CONFIG=%AQUAGUARD_ROOT%detector\.venv\pyvenv.cfg"
set "AQUAGUARD_EXPECTED_ENTRY=%AQUAGUARD_ROOT%detector\run_camera_agent.py"

if not exist "%AQUAGUARD_PID_FILE%" (
  echo AquaGuard Camera Agent is not running, or no validated PID file is available.
  exit /b 0
)

powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; try { $pidFile = [IO.Path]::GetFullPath($env:AQUAGUARD_PID_FILE); $expectedPython = [IO.Path]::GetFullPath($env:AQUAGUARD_EXPECTED_PYTHON); $venvConfig = [IO.Path]::GetFullPath($env:AQUAGUARD_VENV_CONFIG); $expectedEntry = [IO.Path]::GetFullPath($env:AQUAGUARD_EXPECTED_ENTRY); $pidText = (Get-Content -Raw -LiteralPath $pidFile).Trim(); $agentProcessId = 0; if ((-not [int]::TryParse($pidText, [ref]$agentProcessId)) -or ($agentProcessId -le 0)) { Write-Host 'Refusing to stop: the AquaGuard PID file is invalid.'; exit 3 }; $knownProcess = Get-Process -Id $agentProcessId -ErrorAction SilentlyContinue; if ($null -eq $knownProcess) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'AquaGuard Camera Agent is already stopped.'; exit 0 }; $agentProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $agentProcessId) -ErrorAction Stop; if ($null -eq $agentProcess) { Write-Host 'Refusing to stop: Windows could not validate the AquaGuard process.'; exit 7 }; $declaredPython = ''; if (Test-Path -LiteralPath $venvConfig -PathType Leaf) { $declaredLine = Get-Content -LiteralPath $venvConfig | Where-Object { $_ -match '^\s*executable\s*=' } | Select-Object -First 1; if ($null -ne $declaredLine) { $declaredValue = ($declaredLine -split '=', 2)[1].Trim(); if ([IO.Path]::IsPathRooted($declaredValue)) { $declaredPython = [IO.Path]::GetFullPath($declaredValue) } } }; $actualPython = if ($agentProcess.ExecutablePath) { [IO.Path]::GetFullPath($agentProcess.ExecutablePath) } else { '' }; $matchesVenv = [string]::Equals($actualPython, $expectedPython, [StringComparison]::OrdinalIgnoreCase); $matchesDeclaredBase = (-not [string]::IsNullOrWhiteSpace($declaredPython)) -and [string]::Equals($actualPython, $declaredPython, [StringComparison]::OrdinalIgnoreCase); if (-not ($matchesVenv -or $matchesDeclaredBase)) { Write-Host 'Refusing to stop: the PID does not use the AquaGuard virtual-environment Python.'; exit 4 }; $pythonArgument = '(?:\x22' + [regex]::Escape($expectedPython) + '\x22|' + [regex]::Escape($expectedPython) + ')'; if (-not [string]::IsNullOrWhiteSpace($declaredPython)) { $declaredPythonArgument = '(?:\x22' + [regex]::Escape($declaredPython) + '\x22|' + [regex]::Escape($declaredPython) + ')'; $pythonArgument = '(?:' + $pythonArgument + '|' + $declaredPythonArgument + ')' }; $entryArgument = '(?:\x22' + [regex]::Escape($expectedEntry) + '\x22|' + [regex]::Escape($expectedEntry) + ')'; $commandPattern = '(?i)^\s*' + $pythonArgument + '\s+-u\s+' + $entryArgument + '\s*$'; if ([string]::IsNullOrWhiteSpace($agentProcess.CommandLine) -or ($agentProcess.CommandLine -notmatch $commandPattern)) { Write-Host 'Refusing to stop: the PID is not running the exact AquaGuard Camera Agent command.'; exit 5 }; Stop-Process -Id $agentProcessId -Force -ErrorAction Stop; $deadline = [DateTime]::UtcNow.AddSeconds(10); do { Start-Sleep -Milliseconds 250; $remaining = Get-Process -Id $agentProcessId -ErrorAction SilentlyContinue } while (($null -ne $remaining) -and ([DateTime]::UtcNow -lt $deadline)); if ($null -ne $remaining) { Write-Host 'AquaGuard Camera Agent did not stop within 10 seconds.'; exit 6 }; Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'AquaGuard Camera Agent stopped safely.'; exit 0 } catch { Write-Host 'AquaGuard could not validate or stop the Camera Agent. No unrelated process was stopped.'; exit 7 }"

set "STOP_RESULT=%ERRORLEVEL%"
if "%STOP_RESULT%"=="0" exit /b 0

echo.
echo No unrelated Python process was stopped.
pause
exit /b %STOP_RESULT%
