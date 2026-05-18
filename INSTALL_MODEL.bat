@echo off
title Foley Studio - Install
echo.
echo  =====================================================
echo   FOLEY STUDIO - Install Stable Audio Open 1.0
echo  =====================================================
echo.
echo  This installs PyTorch + stable-audio-tools so you can
echo  generate real audio from a Stable Audio Open model file.
echo.
echo  Before running this, make sure you have:
echo    1. Python 3.10 or 3.11 installed
echo    2. An NVIDIA GPU with recent drivers
echo.
echo  After install, edit config.txt to point at your
echo  model .safetensors file.
echo.
echo  Press any key to start, or close this window to cancel.
pause >nul

cd /d "%~dp0backend"

if not exist "venv" (
    echo.
    echo [1/5] Creating Python venv...
    python -m venv venv
) else (
    echo [1/5] venv exists - OK
)

echo.
echo [2/5] Upgrading pip...
venv\Scripts\pip.exe install --upgrade pip setuptools wheel

echo.
echo [3/5] Installing PyTorch with CUDA 12.4...
echo       (Large download ~2.5 GB - be patient)
venv\Scripts\pip.exe install torch torchaudio --index-url https://download.pytorch.org/whl/cu124

echo.
echo [4/5] Installing stable-audio-tools...
echo       (This also downloads the T5 text encoder ~850 MB on first run)
venv\Scripts\pip.exe install stable-audio-tools einops

echo.
echo [5/5] Installing server dependencies...
venv\Scripts\pip.exe install fastapi uvicorn numpy soundfile

echo.
echo  =====================================================
echo   Installation complete!
echo  =====================================================
echo.
echo  NEXT STEPS:
echo    1. Open config.txt in this folder
echo    2. Paste the path to your .safetensors model file
echo       into the MODEL_PATH line, then save
echo    3. Double-click START_BACKEND.bat
echo.
echo  Don't have the model yet? Download it free (no account):
echo  https://huggingface.co/stabilityai/stable-audio-open-1.0
echo.
echo  Optional: for 48kHz AudioSR upscaling, also run:
echo    backend\venv\Scripts\pip.exe install audiosr==0.0.7
echo.
pause
