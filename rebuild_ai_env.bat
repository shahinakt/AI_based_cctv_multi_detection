@echo off
echo ========================================
echo REBUILD AI Worker Environment
echo ========================================
echo.
echo WARNING: This will DELETE the current ai_worker environment
echo and create a fresh one from scratch.
echo.
pause

cd /d "%~dp0"

echo [1/4] Removing corrupted ai_worker environment...
call conda deactivate 2>nul
call conda env remove -n ai_worker -y
echo.

echo [2/4] Creating fresh ai_worker environment with Python 3.10...
call conda create -n ai_worker python=3.10 -y
if %errorlevel% neq 0 (
    echo ERROR: Failed to create environment!
    pause
    exit /b 1
)
echo.

echo [3/4] Activating new environment...
call conda activate ai_worker
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate environment!
    pause
    exit /b 1
)
echo.

echo [4/4] Installing all packages (this may take 10-15 minutes)...
echo.
echo Installing PyTorch with CUDA support...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo.

echo Installing AI/Computer Vision packages...
pip install ultralytics opencv-python mediapipe
echo.

echo Installing remaining packages...
pip install numpy scipy albumentations filterpy
pip install fastapi uvicorn[standard] httpx websockets python-multipart
pip install psycopg2-binary sqlalchemy
pip install python-dotenv pillow pydantic
pip install web3 onnx aiofiles pynvml
echo.

echo ========================================
echo Testing installation...
echo ========================================
python -c "import torch; print(f'PyTorch: {torch.__version__} | CUDA Available: {torch.cuda.is_available()}')" || echo [FAILED] PyTorch
python -c "import ultralytics; print(f'Ultralytics: {ultralytics.__version__}')" || echo [FAILED] Ultralytics
python -c "import cv2; print(f'OpenCV: {cv2.__version__}')" || echo [FAILED] OpenCV
python -c "import mediapipe; print(f'MediaPipe: {mediapipe.__version__}')" || echo [FAILED] MediaPipe
python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')" || echo [FAILED] FastAPI
python -c "import web3; print(f'Web3: {web3.__version__}')" || echo [FAILED] Web3
echo.

echo ========================================
echo Environment rebuilt successfully!
echo ========================================
echo.
echo To activate this environment, run:
echo     conda activate ai_worker
echo.
pause
