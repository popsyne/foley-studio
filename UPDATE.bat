@echo off
setlocal

REM ═══════════════════════════════════════════════════════════════
REM  FOLEY STUDIO — UPDATE SCRIPT
REM ═══════════════════════════════════════════════════════════════
REM
REM  Usage:
REM    1. Download the new foley-studio.zip from Claude
REM    2. Extract it somewhere temporary (e.g. Downloads\foley-studio)
REM    3. Drag the extracted "foley-studio" FOLDER onto this .bat file
REM       — OR —
REM       Run:  UPDATE.bat "C:\Users\You\Downloads\foley-studio"
REM
REM  This copies only the 4 files that change between versions:
REM    backend/server.py
REM    frontend/src/App.tsx
REM    frontend/src/api.ts
REM    frontend/src/types.ts
REM
REM  Your node_modules, venv, outputs, and config are untouched.
REM ═══════════════════════════════════════════════════════════════

echo.
echo   ◈ FOLEY STUDIO — Update
echo   ════════════════════════
echo.

REM Get the source folder from drag-and-drop or command line arg
set "SRC=%~1"

if "%SRC%"=="" (
    echo   ERROR: No source folder provided.
    echo.
    echo   How to use:
    echo     1. Extract the new foley-studio.zip somewhere
    echo     2. Drag the extracted "foley-studio" folder onto this .bat
    echo        — OR —
    echo        Run:  UPDATE.bat "C:\path\to\extracted\foley-studio"
    echo.
    pause
    exit /b 1
)

REM Strip trailing backslash if present
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

REM Validate source has the expected files
if not exist "%SRC%\backend\server.py" (
    echo   ERROR: Cannot find backend\server.py in:
    echo     %SRC%
    echo.
    echo   Make sure you're pointing at the "foley-studio" folder
    echo   ^(not the zip file, and not a parent folder^).
    echo.
    pause
    exit /b 1
)

REM Get this script's directory (where foley-studio is installed)
set "DEST=%~dp0"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"

echo   Source:  %SRC%
echo   Target:  %DEST%
echo.

REM Backup current files
set "BACKUP=%DEST%\_backup_%date:~-4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%"
set "BACKUP=%BACKUP: =0%"
mkdir "%BACKUP%" 2>nul

echo   Backing up current files to:
echo     %BACKUP%
echo.

if exist "%DEST%\backend\server.py"        copy /Y "%DEST%\backend\server.py"        "%BACKUP%\server.py"        >nul 2>nul
if exist "%DEST%\frontend\src\App.tsx"      copy /Y "%DEST%\frontend\src\App.tsx"      "%BACKUP%\App.tsx"          >nul 2>nul
if exist "%DEST%\frontend\src\api.ts"       copy /Y "%DEST%\frontend\src\api.ts"       "%BACKUP%\api.ts"           >nul 2>nul
if exist "%DEST%\frontend\src\types.ts"     copy /Y "%DEST%\frontend\src\types.ts"     "%BACKUP%\types.ts"         >nul 2>nul

REM Copy new files
echo   Copying new files...
echo.

copy /Y "%SRC%\backend\server.py"        "%DEST%\backend\server.py"
copy /Y "%SRC%\frontend\src\App.tsx"      "%DEST%\frontend\src\App.tsx"
copy /Y "%SRC%\frontend\src\api.ts"       "%DEST%\frontend\src\api.ts"
copy /Y "%SRC%\frontend\src\types.ts"     "%DEST%\frontend\src\types.ts"

REM Also update README if present
if exist "%SRC%\README.md" (
    copy /Y "%SRC%\README.md" "%DEST%\README.md" >nul
)

echo.
echo   ════════════════════════════════════════
echo   ✓ Update complete!
echo   ════════════════════════════════════════
echo.
echo   Next steps:
echo     1. Restart the backend  (close + rerun START_BACKEND.bat)
echo     2. Hard-refresh browser (Ctrl+Shift+R)
echo        Vite usually hot-reloads, but force it to be safe.
echo.
echo   Your old files are backed up in:
echo     %BACKUP%
echo.

pause
