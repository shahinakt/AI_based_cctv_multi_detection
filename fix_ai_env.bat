@echo off
echo ========================================
echo Fix AI Worker Environment
echo ========================================
echo.

echo This will install/reinstall all required packages.
echo Make sure ai_worker conda environment is activated!
echo.
pause

cd /d "%~dp0"

echo [1/2] Upgrading pip...
python -m pip install --upgrade pip
echo.

echo [2/2] Installing all requirements...
pip install -r ai_worker\requirements.txt
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo SUCCESS! Environment is ready.
    echo ========================================
) else (
    echo ========================================
    echo ERROR! Some packages failed to install.
    echo ========================================
    echo Try installing problematic packages individually:
    echo     pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
    echo     pip install ultralytics opencv-python mediapipe
)

echo.
pause
