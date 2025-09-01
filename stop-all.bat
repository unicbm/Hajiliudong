@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title SiliconFlow Key Rotator - Stop Services
color 0C

echo.
echo ====================================================================
echo                    SiliconFlow Key Rotator
echo                        Stop Services Script
echo ====================================================================
echo.

echo [INFO] Stopping all services...
echo.

:: Stop Node.js processes (may include our services)
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| find /v "PID"') do (
    if not "%%i"=="" (
        echo [INFO] Stopping Node.js process: %%i
        taskkill /pid %%i /f >nul 2>&1
    )
)

:: Wait for processes to stop completely
timeout /t 2 /nobreak >nul

:: Check port occupation
echo [INFO] Checking port occupation...

netstat -ano | findstr :11435 >nul
if not errorlevel 1 (
    echo [WARNING] Port 11435 still occupied
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :11435') do (
        echo [INFO] Stopping process: %%a
        taskkill /pid %%a /f >nul 2>&1
    )
) else (
    echo [SUCCESS] Port 11435 released
)

netstat -ano | findstr :3000 >nul
if not errorlevel 1 (
    echo [WARNING] Port 3000 still occupied
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        echo [INFO] Stopping process: %%a
        taskkill /pid %%a /f >nul 2>&1
    )
) else (
    echo [SUCCESS] Port 3000 released
)

echo.
echo ====================================================================
echo                         Services Stopped
echo ====================================================================
echo.
echo [SUCCESS] All SiliconFlow Key Rotator services have been stopped
echo [INFO] Dashboard: Closed
echo [INFO] Proxy Service: Closed
echo.

pause