@echo off
echo ========================================
echo Building for Both iOS and Android
echo ========================================
echo.
echo This will create development builds for both platforms.
echo This may take 30-60 minutes total.
echo.
pause

cd /d "%~dp0"

echo Installing EAS CLI globally...
call npm install -g eas-cli

echo.
echo Logging into Expo...
call eas login

echo.
echo Building for both platforms...
call eas build --profile development --platform all

echo.
echo ========================================
echo Builds Complete!
echo ========================================
echo.
echo Check your email or the Expo dashboard for download links.
echo.
pause
