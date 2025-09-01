@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title SiliconFlow Key Rotator - Startup Script
color 0A

echo.
echo ====================================================================
echo                    SiliconFlow Key Rotator
echo                         Startup Script
echo ====================================================================
echo.
echo [INFO] Starting services...
echo.

:: Check Node.js installation
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not detected
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check dependencies
if not exist "node_modules" (
    echo [INFO] First run - Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed
    echo.
)

:: Check keys file
if not exist "keys.txt" (
    echo [WARNING] keys.txt file not found
    echo Please ensure you have configured API keys
    echo.
)

echo [INFO] Starting proxy server (port 11435)...
start "SiliconFlow Proxy Server" cmd /c "npm start && pause"

:: Wait for main service to start
timeout /t 3 /nobreak >nul

echo [INFO] Starting dashboard service (port 3000)...
start "SiliconFlow Dashboard" cmd /c "npm run dashboard && pause"

:: Wait for dashboard service to start
echo [INFO] Waiting for services to start...
timeout /t 5 /nobreak >nul

:: Check service status
echo [INFO] Checking service status...
curl -s http://localhost:11435/health >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Proxy server may not have started successfully
) else (
    echo [SUCCESS] Proxy server started successfully
)

curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Dashboard server may not have started successfully
) else (
    echo [SUCCESS] Dashboard server started successfully
)

echo.
echo ====================================================================
echo                         Services Started
echo ====================================================================
echo.
echo [URL] Dashboard: http://localhost:3000/dashboard
echo [URL] Proxy API: http://localhost:11435
echo [URL] Health Check: http://localhost:11435/health
echo.
echo [INFO] Opening dashboard...

:: Open default browser to access dashboard
start http://localhost:3000/dashboard

echo.
echo ====================================================================
echo                         Usage Instructions
echo ====================================================================
echo.
echo 1. Dashboard shows real-time key status and balance
echo 2. System automatically disables keys with insufficient balance
echo 3. Configure in your Claude Code Router:
echo    - Base URL: http://localhost:11435/v1
echo    - API Key: any value (managed by system)
echo.
echo [TIP] Closing this window won't stop the services
echo       To stop services, close the service windows or run stop-all.bat
echo.

pause