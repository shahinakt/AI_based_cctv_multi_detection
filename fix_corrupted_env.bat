@echo off
echo ========================================
echo Fix Corrupted Packages
echo ========================================
echo.

echo [1/5] Uninstalling corrupted starlette...
pip uninstall starlette -y
echo.

echo [2/5] Uninstalling fastapi (will reinstall)...
pip uninstall fastapi -y
echo.

echo [3/5] Clearing pip cache...
pip cache purge
echo.

echo [4/5] Installing PyTorch with CUDA support...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo.

echo [5/5] Installing remaining packages...
pip install ultralytics opencv-python mediapipe fastapi uvicorn[standard] httpx websockets python-multipart psycopg2-binary sqlalchemy python-dotenv pillow pydantic web3 onnx aiofiles numpy scipy albumentations filterpy
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo SUCCESS! All packages installed.
    echo ========================================
    echo.
    echo Testing critical imports...
    python -c "import torch; print(f'PyTorch: {torch.__version__} (CUDA: {torch.cuda.is_available()})')"
    python -c "import ultralytics; print(f'Ultralytics: {ultralytics.__version__}')"
    python -c "import cv2; print(f'OpenCV: {cv2.__version__}')"
    python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')"
    echo.
    echo All core packages working!
) else (
    echo ========================================
    echo ERROR! Installation failed.
    echo ========================================
)

echo.
pause
