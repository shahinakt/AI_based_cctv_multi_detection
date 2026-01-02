@echo off
echo ========================================
echo Quick Deploy to Local Network
echo ========================================
echo.

cd /d "%~dp0"

echo Deploying EvidenceRegistry contract to localhost...
echo Make sure the Hardhat node is running!
echo (Run start_blockchain.bat in another terminal)
echo.

call npm run deploy:localhost

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Deployment successful!
    echo ========================================
    echo Check the output above for the contract address.
    echo The address has been saved to .env file.
) else (
    echo.
    echo ========================================
    echo Deployment failed!
    echo ========================================
    echo Make sure the local node is running.
)
echo.
pause
