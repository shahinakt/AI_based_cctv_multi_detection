@echo off
echo ========================================
echo AI CCTV Mobile App - Expo Dev Server
echo ========================================
echo.

cd /d "%~dp0mobile"

echo Starting Expo development server...
echo.
echo Once started, you can:
echo   1. Scan QR code with Expo Go app on your phone
echo   2. Press 'a' for Android emulator
echo   3. Press 'w' for web browser preview
echo.
echo Make sure your phone is on the same WiFi!
echo.

call npm start

pause
