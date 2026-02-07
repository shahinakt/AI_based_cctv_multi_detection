@echo off
echo ========================================
echo AI CCTV MULTI-DETECTION SYSTEM
echo Complete Startup Script (All Modules)
echo ========================================
echo.
echo This script will start:
echo   [1] Backend API Server      (Port 8000)
echo   [2] Blockchain Network      (Hardhat localhost)
echo   [3] AI Worker Service       (Port 8765)
echo   [4] Frontend Web UI         (Port 5173)
echo   [5] Mobile App (Expo)       (Port 8081)
echo.
echo ========================================
echo.

REM ============================================================
REM AUTO-DETECT IP ADDRESS FOR MOBILE APP
REM ============================================================
echo [SETUP] Detecting your computer's IP address for mobile app...
setlocal enabledelayedexpansion
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set "ip=%%a"
    set "ip=!ip:~1!"
    if not "!ip!"=="" (
        if not "!ip:~0,3!"=="127" (
            set "MY_IP=!ip!"
            goto :found_ip
        )
    )
)

:found_ip
if not defined MY_IP (
    echo [SETUP] ⚠️ Could not detect IP automatically, using localhost
    set "MY_IP=localhost"
) else (
    echo [SETUP] ✅ Detected IP: !MY_IP!
)
echo.

REM Check if virtual environment exists
if not exist "backend\venv\" (
    echo ❌ Backend virtual environment not found!
    echo.
    echo Please set up the backend first:
    echo   cd backend
    echo   python -m venv venv
    echo   venv\Scripts\activate
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Ask which modules to start
echo Select modules to start:
echo.
set /p START_BACKEND="Start Backend? (Y/n): "
set /p START_BLOCKCHAIN="Start Blockchain? (Y/n): "
set /p START_AI="Start AI Worker? (Y/n): "
set /p START_FRONTEND="Start Frontend? (Y/n): "
set /p START_MOBILE="Start Mobile App? (Y/n): "
echo.

REM Default to Yes if empty
if "%START_BACKEND%"=="" set START_BACKEND=Y
if "%START_BLOCKCHAIN%"=="" set START_BLOCKCHAIN=Y
if "%START_AI%"=="" set START_AI=Y
if "%START_FRONTEND%"=="" set START_FRONTEND=Y
if "%START_MOBILE%"=="" set START_MOBILE=Y

echo ========================================
echo Starting Selected Modules...
echo ========================================
echo.

REM Module count
set MODULE_COUNT=0

REM ============================================================
REM [1] START BACKEND (HIGHEST PRIORITY - MUST START FIRST!)
REM ============================================================
if /i "%START_BACKEND%"=="Y" (
    echo [BACKEND] Starting Backend API Server...
    start "Backend API Server" cmd /c "cd /d "%~dp0backend" && call venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    set /a MODULE_COUNT+=1
    
    echo [BACKEND] Waiting for backend to initialize (10 seconds)...
    timeout /t 10 /nobreak >nul
    
    echo [BACKEND] Checking if backend is ready...
    curl -s http://localhost:8000/health >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [BACKEND] ✅ Backend is ready!
    ) else (
        echo [BACKEND] ⚠️ Backend health check failed, but continuing...
        echo [BACKEND] Check the Backend window for errors
    )
    echo.
) else (
    echo [BACKEND] ⏭️ Skipped
    echo.
)

REM ============================================================
REM [2] START BLOCKCHAIN (OPTIONAL BUT RECOMMENDED)
REM ============================================================
if /i "%START_BLOCKCHAIN%"=="Y" (
    echo [BLOCKCHAIN] Starting Blockchain Network...
    
    REM Check if blockchain dependencies are installed
    if not exist "blockchain\node_modules\" (
        echo [BLOCKCHAIN] Installing dependencies first...
        start "Blockchain Setup" cmd /c "cd /d "%~dp0blockchain" && npm install && npm run compile && npm run deploy:localhost && pause"
    ) else (
        start "Blockchain Network" cmd /c "cd /d "%~dp0blockchain" && npm run compile && npm run deploy:localhost && pause"
    )
    
    set /a MODULE_COUNT+=1
    echo [BLOCKCHAIN] ✅ Started in separate window
    timeout /t 3 /nobreak >nul
    echo.
) else (
    echo [BLOCKCHAIN] ⏭️ Skipped
    echo.
)

REM ============================================================
REM [3] START AI WORKER (DEPENDS ON BACKEND)
REM ============================================================
if /i "%START_AI%"=="Y" (
    echo [AI WORKER] Starting AI Worker Service...
    
    REM Check if conda is available
    where conda >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [AI WORKER] Using conda environment 'ai_worker'
        start "AI Worker Service" cmd /c "conda activate ai_worker && cd /d "%~dp0" && python -m ai_worker"
    ) else (
        echo [AI WORKER] Conda not found, using system Python
        start "AI Worker Service" cmd /c "cd /d "%~dp0" && python -m ai_worker"
    )
    
    set /a MODULE_COUNT+=1
    echo [AI WORKER] ✅ Started in separate window
    timeout /t 3 /nobreak >nul
    echo.
) else (
    echo [AI WORKER] ⏭️ Skipped
    echo.
)

REM ============================================================
REM [4] START FRONTEND (WEB UI)
REM ============================================================
if /i "%START_FRONTEND%"=="Y" (
    echo [FRONTEND] Starting Frontend Web UI...
    
    REM Check if frontend dependencies are installed
    if not exist "frontend\node_modules\" (
        echo [FRONTEND] Installing dependencies first...
        start "Frontend Web UI" cmd /c "cd /d "%~dp0frontend" && npm install && npm run dev"
    ) else (
        start "Frontend Web UI" cmd /c "cd /d "%~dp0frontend" && npm run dev"
    )
    
    set /a MODULE_COUNT+=1
    echo [FRONTEND] ✅ Started in separate window
    timeout /t 3 /nobreak >nul
    echo.
) else (
    echo [FRONTEND] ⏭️ Skipped
    echo.
)

REM ============================================================
REM [5] START MOBILE APP (EXPO)
REM ============================================================
if /i "%START_MOBILE%"=="Y" (
    echo [MOBILE] Starting Mobile App (Expo)...
    
    REM Update mobile .env with detected IP address
    echo [MOBILE] Updating mobile\.env with IP: !MY_IP!
    (
    echo # Mobile App Environment Configuration
    echo # Auto-updated on %date% at %time%
    echo.
    echo # Backend URL - Updated automatically
    echo EXPO_PUBLIC_API_URL=http://!MY_IP!:8000
    echo.
    echo # Debug mode
    echo DEBUG=true
    ) > mobile\.env
    echo [MOBILE] ✅ Updated mobile\.env
    
    REM Check if backend is accessible (if backend was started)
    if /i "%START_BACKEND%"=="Y" (
        echo [MOBILE] Checking if backend is accessible...
        powershell -Command "try { Invoke-WebRequest -Uri 'http://!MY_IP!:8000/health' -TimeoutSec 3 -UseBasicParsing | Out-Null; Write-Host '[MOBILE] ✅ Backend is accessible at http://!MY_IP!:8000' -ForegroundColor Green } catch { Write-Host '[MOBILE] ⚠️ Backend not yet accessible (might still be starting up)' -ForegroundColor Yellow }"
    )
    
    REM Check if mobile dependencies are installed
    if not exist "mobile\node_modules\" (
        echo [MOBILE] Installing dependencies first...
        start "Mobile App (Expo)" cmd /c "cd /d "%~dp0mobile" && npm install && npm start --clear"
    ) else (
        start "Mobile App (Expo)" cmd /c "cd /d "%~dp0mobile" && npm start --clear"
    )
    
    set /a MODULE_COUNT+=1
    echo [MOBILE] ✅ Started in separate window
    echo.
    echo [MOBILE] IMPORTANT: For mobile access
    echo          - Backend URL: http://!MY_IP!:8000
    echo          - Phone and PC must be on SAME WiFi
    echo          - Test in phone browser: http://!MY_IP!:8000/docs
    echo.
) else (
    echo [MOBILE] ⏭️ Skipped
    echo.
)

REM ============================================================
    echo                     Backend URL: http://!MY_IP!:8000
REM SUMMARY
REM ============================================================
echo ========================================
echo ✅ STARTUP COMPLETE!
echo ========================================
echo.
echo Started %MODULE_COUNT% module(s)
echo.

if /i "%START_BACKEND%"=="Y" (
    echo  ✅ Backend API:     http://localhost:8000
    echo                     http://localhost:8000/docs (API docs)
)
if /i "%START_BLOCKCHAIN%"=="Y" (
    echo  ✅ Blockchain:      Hardhat Network (check blockchain window)
)
if /i "%START_AI%"=="Y" (
    echo  ✅ AI Worker:       http://localhost:8765
)
if /i "%START_FRONTEND%"=="Y" (
    echo  ✅ Frontend:        http://localhost:5173
)
if /i "%START_MOBILE%"=="Y" (
    echo  ✅ Mobile App:      Expo DevTools (check mobile window)
    echo                     Scan QR code with Expo Go app
)

echo.
echo ========================================
echo IMPORTANT NOTES:
echo ========================================
echo  • All services are running in separate windows
echo  • Close those windows to stop services
echo  • Backend MUST be running for other services to work
echo  • Use Ctrl+C in each window to stop gracefully
echo.
echo Press any key to open Frontend in browser...
pause >nul

if /i "%START_FRONTEND%"=="Y" (
    echo Opening browser...
    timeout /t 3 /nobreak >nul
    start http://localhost:5173
)

echo.
echo ========================================
echo All modules are now running!
echo Keep this window open for reference.
echo ========================================
pause
