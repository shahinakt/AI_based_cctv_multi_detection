@echo off
echo ========================================
echo Start Backend API Server
echo ========================================
echo.

cd /d "%~dp0backend"

echo Activating Python environment...
call conda activate ai_worker

echo.
echo Starting FastAPI backend on http://localhost:8000
echo The mobile app will connect to this automatically.
echo.
echo Press Ctrl+C to stop the server.
echo.

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
