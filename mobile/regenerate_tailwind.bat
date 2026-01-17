@echo off
echo ════════════════════════════════════════════════════════
echo Regenerating Tailwind CSS for React Native
echo ════════════════════════════════════════════════════════
echo.
echo This will update tailwind.json with all supported classes
echo including the custom classes defined in tailwind.css
echo.

cd /d "%~dp0"

echo Generating tailwind.json...
call npx tailwind-rn --input tailwind.css --output tailwind.json

echo.
echo ✓ Done! tailwind.json has been updated.
echo.
echo The following custom classes are now available:
echo  • justify-start
echo  • rounded
echo  • bg-yellow-300
echo  • text-black
echo  • mb-5
echo.
echo Restart your Expo app for changes to take effect.
echo.
pause
