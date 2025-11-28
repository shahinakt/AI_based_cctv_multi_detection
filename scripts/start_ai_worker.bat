@echo off
REM Start AI Worker FastAPI server on port 8765
REM Run from project root: scripts\start_ai_worker.bat

REM Activate virtualenv if you use one (uncomment and edit path)
REM call C:\path\to\venv\Scripts\activate.bat

set BACKEND_URL=http://localhost:8000
set EVIDENCE_DIR=%~dp0\ai_worker\data\captures

echo Starting AI Worker API server (uvicorn ai_worker.api_server:app --host 0.0.0.0 --port 8765)
python -m uvicorn ai_worker.api_server:app --host 0.0.0.0 --port 8765

pause
