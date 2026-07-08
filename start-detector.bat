@echo off
cd /d "%~dp0detector"

if not exist ".venv\Scripts\python.exe" (
  echo Missing detector virtual environment.
  echo Expected: %cd%\.venv\Scripts\python.exe
  echo.
  echo Create or restore detector\.venv, then run this file again.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" stream_api.py
pause
