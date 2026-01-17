@echo off
echo ========================================
echo Building Android Development Build
echo ========================================
echo.
echo This will create a development APK that supports push notifications.
echo You can install this directly on your Android device.
echo.
pause

cd /d "%~dp0"

echo Installing EAS CLI globally...
call npm install -g eas-cli

echo.
echo Logging into Expo...
call eas login

echo.
echo Building Android development build (APK)...
echo This may take 15-30 minutes...
call eas build --profile development --platform android

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Download the .apk file from the link above
echo 2. Transfer to your Android device
echo 3. Enable "Install from Unknown Sources" in Settings
echo 4. Tap the .apk file to install
echo.
echo The APK link will also be sent to your email.
echo.
pause
