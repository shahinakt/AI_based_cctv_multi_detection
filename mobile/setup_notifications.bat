@echo off
echo ╔══════════════════════════════════════════════════════════╗
echo ║     Push Notifications Setup - Getting Started          ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo This wizard will help you set up real push notifications
echo for iOS and Android devices.
echo.
echo ──────────────────────────────────────────────────────────
echo.

:MENU
echo Please select an option:
echo.
echo  [1] Build for Android only (15-20 min)
echo  [2] Build for iOS only (20-30 min) - Requires Apple Dev Account
echo  [3] Build for BOTH platforms (30-45 min)
echo  [4] Check build status
echo  [5] View setup guide
echo  [6] Install EAS CLI first time
echo  [0] Exit
echo.
set /p choice="Enter your choice (0-6): "

if "%choice%"=="1" goto ANDROID
if "%choice%"=="2" goto IOS
if "%choice%"=="3" goto BOTH
if "%choice%"=="4" goto STATUS
if "%choice%"=="5" goto GUIDE
if "%choice%"=="6" goto INSTALL
if "%choice%"=="0" goto END
echo Invalid choice. Please try again.
goto MENU

:INSTALL
echo.
echo Installing EAS CLI globally...
call npm install -g eas-cli
echo.
echo Logging into Expo...
call eas login
echo.
echo ✓ EAS CLI installed and logged in!
echo.
pause
goto MENU

:ANDROID
echo.
echo ════════════════════════════════════════════════════════
echo Building Development Build for ANDROID
echo ════════════════════════════════════════════════════════
echo.
echo This will:
echo  ✓ Create an APK file you can install on Android devices
echo  ✓ Enable real push notifications
echo  ✓ Take about 15-20 minutes
echo.
pause
call build_dev_android.bat
goto END

:IOS
echo.
echo ════════════════════════════════════════════════════════
echo Building Development Build for iOS
echo ════════════════════════════════════════════════════════
echo.
echo REQUIREMENTS:
echo  ✓ Apple Developer Account ($99/year)
echo  ✓ You'll be prompted to authenticate
echo.
echo This will:
echo  ✓ Create an IPA file for iOS devices
echo  ✓ Enable real push notifications
echo  ✓ Take about 20-30 minutes
echo.
pause
call build_dev_ios.bat
goto END

:BOTH
echo.
echo ════════════════════════════════════════════════════════
echo Building Development Builds for BOTH PLATFORMS
echo ════════════════════════════════════════════════════════
echo.
echo This will create builds for:
echo  ✓ Android (APK)
echo  ✓ iOS (IPA) - Requires Apple Developer Account
echo.
echo Total time: 30-45 minutes
echo.
pause
call build_both_platforms.bat
goto END

:STATUS
echo.
echo Checking build status...
call eas build:list --limit 5
echo.
pause
goto MENU

:GUIDE
echo.
echo Opening setup guide...
echo.
echo Full documentation available at:
echo   mobile/PUSH_NOTIFICATIONS_SETUP.md
echo   mobile/QUICK_REFERENCE.txt
echo.
type QUICK_REFERENCE.txt
echo.
pause
goto MENU

:END
echo.
echo ════════════════════════════════════════════════════════
echo Next Steps:
echo ════════════════════════════════════════════════════════
echo.
echo After build completes:
echo.
echo ANDROID:
echo  1. Download .apk from the link provided
echo  2. Transfer to your Android device
echo  3. Enable "Unknown Sources" in Settings
echo  4. Install the .apk
echo.
echo iOS:
echo  1. Download .ipa or use TestFlight
echo  2. Install on your iOS device
echo  3. Trust certificate in Settings
echo.
echo Then test by triggering an incident from AI worker!
echo.
echo For detailed instructions, see:
echo   mobile/PUSH_NOTIFICATIONS_SETUP.md
echo.
pause
