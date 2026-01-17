@echo off
echo ========================================
echo Building iOS Development Build
echo ========================================
echo.
echo This will create a development build for iOS that supports push notifications.
echo You'll need an Apple Developer account.
echo.
pause

cd /d "%~dp0"

echo Installing EAS CLI globally...
call npm install -g eas-cli

echo.
echo Logging into Expo...
call eas login

echo.
echo Building iOS development build...
echo This may take 15-30 minutes...
call eas build --profile development --platform ios

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Download the .ipa file from the link above
echo 2. Install on device using one of these methods:
echo    - TestFlight (recommended)
echo    - Apple Configurator 2
echo    - Xcode Devices window
echo.
echo For TestFlight:
echo    eas submit --platform ios --latest
echo.
pause
