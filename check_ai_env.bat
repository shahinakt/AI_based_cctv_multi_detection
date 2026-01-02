@echo off
echo ========================================
echo AI Worker Environment Diagnostic
echo ========================================
echo.

echo [1] Checking Python version...
python --version
echo.

echo [2] Checking pip version...
pip --version
echo.

echo [3] Checking conda environment info...
conda info
echo.

echo [4] Listing installed packages...
echo.
conda list
echo.

echo ========================================
echo [5] Checking CRITICAL packages...
echo ========================================

echo Checking torch...
python -c "import torch; print(f'PyTorch: {torch.__version__}')" 2>nul || echo [MISSING] PyTorch not installed

echo Checking ultralytics (YOLO)...
python -c "import ultralytics; print(f'Ultralytics: {ultralytics.__version__}')" 2>nul || echo [MISSING] Ultralytics not installed

echo Checking opencv...
python -c "import cv2; print(f'OpenCV: {cv2.__version__}')" 2>nul || echo [MISSING] OpenCV not installed

echo Checking mediapipe...
python -c "import mediapipe; print(f'MediaPipe: {mediapipe.__version__}')" 2>nul || echo [MISSING] MediaPipe not installed

echo Checking fastapi...
python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')" 2>nul || echo [MISSING] FastAPI not installed

echo Checking numpy...
python -c "import numpy; print(f'NumPy: {numpy.__version__}')" 2>nul || echo [MISSING] NumPy not installed

echo Checking web3...
python -c "import web3; print(f'Web3: {web3.__version__}')" 2>nul || echo [MISSING] Web3 not installed

echo Checking sqlalchemy...
python -c "import sqlalchemy; print(f'SQLAlchemy: {sqlalchemy.__version__}')" 2>nul || echo [MISSING] SQLAlchemy not installed

echo.
echo ========================================
echo Diagnostic Complete!
echo ========================================
echo.
echo If you see [MISSING] packages, run:
echo     pip install -r ai_worker/requirements.txt
echo.
pause
