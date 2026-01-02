@echo off
echo ===============================================
echo CHECKING BACKEND SERVER STATUS
echo ===============================================
echo.

REM Check if backend is already running on port 8000
echo Checking if port 8000 is in use...
netstat -ano | findstr ":8000" > nul
if %errorlevel% equ 0 (
    echo.
    echo [OK] Backend appears to be running on port 8000
    echo.
    goto :menu
) else (
    echo.
    echo [WARNING] Port 8000 is not in use - backend may not be running!
    echo.
)

:menu
echo What would you like to do?
echo.
echo 1. Start Backend Server (if not running)
echo 2. Test Backend Connection
echo 3. View Backend Logs
echo 4. Exit
echo.
choice /c 1234 /n /m "Enter your choice (1-4): "

if errorlevel 4 goto :eof
if errorlevel 3 goto :logs
if errorlevel 2 goto :test
if errorlevel 1 goto :start

:start
echo.
echo Starting backend server...
cd /d "%~dp0backend"

REM Check if conda is available
where conda >nul 2>nul
if %errorlevel% equ 0 (
    echo Using conda environment: ai_worker
    call conda activate ai_worker
    start "Backend Server" cmd /k "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) else (
    REM Try venv
    if exist "venv\Scripts\activate.bat" (
        echo Using venv environment
        call venv\Scripts\activate.bat
        start "Backend Server" cmd /k "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    ) else (
        echo ERROR: Neither conda nor venv found!
        echo Please set up your Python environment first.
        pause
        goto :eof
    )
)

echo.
echo Backend server starting in new window...
echo Wait a few seconds for it to initialize.
timeout /t 3 > nul
goto :test

:test
echo.
echo Testing backend connection...
powershell -Command "$result = try { (Invoke-WebRequest -Uri 'http://localhost:8000/docs' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }; if ($result -eq 200) { Write-Host '[SUCCESS] Backend is responding!' -ForegroundColor Green } else { Write-Host '[FAILED] Cannot connect to backend on port 8000' -ForegroundColor Red }"
echo.
echo You can test the API at: http://localhost:8000/docs
echo.
pause
goto :eof

:logs
echo.
echo Opening backend directory...
cd /d "%~dp0backend"
start .
pause
goto :eof
