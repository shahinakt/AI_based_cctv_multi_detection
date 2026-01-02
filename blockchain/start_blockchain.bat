@echo off
echo ========================================
echo Blockchain Setup and Deployment Script
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js found: 
node --version
echo.

echo [2/5] Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed!
    pause
    exit /b 1
)
echo npm found:
npm --version
echo.

echo [3/5] Installing dependencies...
if not exist node_modules (
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed.
)
echo.

echo [4/5] Compiling smart contracts...
call npm run compile
if %errorlevel% neq 0 (
    echo ERROR: Failed to compile contracts!
    pause
    exit /b 1
)
echo.

echo [5/5] Starting local Hardhat node...
echo.
echo The blockchain node will start on http://127.0.0.1:8545
echo Keep this window open. Deploy the contract in a NEW terminal with:
echo     cd blockchain
echo     npm run deploy:localhost
echo.
echo Press Ctrl+C to stop the node when done.
echo.
call npm run node
