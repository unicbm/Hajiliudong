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

:: Stop specific services by port
echo [INFO] Stopping SiliconFlow services...

:: Stop proxy service on port 11435
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :11435') do (
    if not "%%a"=="0" (
        echo [INFO] Stopping proxy service (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
        if not errorlevel 1 (
            echo [SUCCESS] Proxy service stopped
        )
    )
)

:: Stop dashboard service on port 3000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3000') do (
    if not "%%a"=="0" (
        echo [INFO] Stopping dashboard service (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
        if not errorlevel 1 (
            echo [SUCCESS] Dashboard service stopped
        )
    )
)

:: Wait for processes to stop completely
ping -n 2 127.0.0.1 >nul

echo [SUCCESS] SiliconFlow services stopped

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