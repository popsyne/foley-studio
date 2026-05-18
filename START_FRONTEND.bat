@echo off
title Foley Studio - Frontend
echo.
echo  ============================
echo   FOLEY STUDIO - Frontend
echo  ============================
echo.

cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [1/2] Installing npm dependencies...
    call npm install
) else (
    echo [OK] node_modules already exists
)

echo [2/2] Starting dev server...
echo.
echo  Open http://localhost:5173 in your browser
echo.
call npm run dev
pause
