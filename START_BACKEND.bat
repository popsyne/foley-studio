@echo off
title Foley Studio - Backend
echo.
echo  ============================
echo   FOLEY STUDIO - Backend
echo  ============================
echo.

cd /d "%~dp0backend"

if not exist "venv" (
    echo [1/3] Creating Python venv...
    python -m venv venv
    echo [2/3] Installing core dependencies...
    venv\Scripts\pip.exe install fastapi uvicorn numpy
) else (
    echo [OK] venv exists
)

echo [3/3] Starting server...
echo.
echo  If you see MOCK MODE, open config.txt and set your
echo  MODEL_PATH to your .safetensors file, then restart.
echo.
venv\Scripts\python.exe server.py
pause
