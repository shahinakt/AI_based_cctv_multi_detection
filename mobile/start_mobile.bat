@echo off
REM Mobile App Quick Start Script
echo ========================================
echo AI CCTV Mobile App - Quick Start
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo Node.js found!
echo.

echo [2/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo Dependencies installed!
echo.

echo [3/4] Generating Tailwind styles...
call npx tailwind-rn@latest --input tailwind.css --output tailwind.json
if errorlevel 1 (
    echo WARNING: Failed to generate Tailwind styles
    echo You may need to run this manually later
)
echo.

echo [4/4] Starting Expo...
echo.
echo ========================================
echo Starting mobile app...
echo.
echo Scan the QR code with:
echo - Expo Go app (Android)
echo - Camera app (iOS)
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npx expo start

pause
