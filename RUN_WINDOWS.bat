@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo      SiliconFlow Key Rotator - One-Click Setup & Start       
echo ================================================================
echo.

:: Set project directory
cd /d "%~dp0"

:: Check PowerShell availability
echo Checking PowerShell...
powershell -Command "Get-Host" >nul 2>&1
if errorlevel 1 (
echo ERROR: PowerShell is required but not found on this system.
echo Please install PowerShell (comes with Windows 10+) and try again.
echo.
pause
exit /b 1
)

:: Check Node.js availability
echo Checking Node.js..
node --version >nul 2>&1
if errorlevel 1 (
echo ERROR: Node.js is not installed or not in PATH.
echo Please install Node.js 18+ from https://nodejs.org/
echo.
pause
exit /b 1
)

:: Check npm availability
echo Checking npm..
npm --version >nul 2>&1
if errorlevel 1 (
echo ERROR: npm is not available.
echo Please ensure Node.js is properly installed.
echo.
pause
exit /b 1
)

:: Create .env file if it doesn't exist
if not exist ".env" (
echo Creating .env file from template...
copy /y .env.example .env >nul 2>&1
echo .env file created! You can edit it if needed.
echo.
)
:: Install dependencies if needed
if not exist "node_modules" (
echo Installing dependencies...
call npm install
if errorlevel 1 (
echo ERROR: Failed to install dependencies.
echo Please check your Node.js/npm installation and try again.
echo.
pause
exit /b 1
)
)

:: Ask user about keys file
echo.
echo ------------------------------------------------
echo Available options for SiliconFlow keys:
echo 1. Use existing keys.txt file
echo 2. Select a custom key file ^
echo 3. Auto-detect keys from project directory
echo ------------------------------------------------
echo.

set /p choice="Enter choice (1/2/3) [1]: " || set /p choice="1"

if "%choice%"=="2" (
echo.
echo Browse and select your key file...
echo.
echo A file browser will open. Select your key file.
echo Available formats: .txt, .csv, .json
echo.
echo Alternatively, enter file path directly below:
set /p customPath="Enter file path: "
if not "%customPath%"=="" (
echo Running key preparation script with custom path...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win_prepare_keys.ps1" -Source "%customPath%"
if errorlevel 1 (
echo Key preparation failed. Using auto-detection...
goto auto_detect
)
) else (
goto auto_detect
)
) else if "%choice%"=="3" (
:auto_detect
echo Auto-detecting SiliconFlow keys...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win_prepare_keys.ps1"
if errorlevel 1 (
echo.
echo Key preparation failed!
echo Please ensure your keys are in correct format.
echo.
echo Format: sk-siliconflow-... (starts with sk-)
echo.
pause
exit /b 1
)
) else (
echo Using existing keys.txt (if available)...
if exist "keys.txt" (
echo keys.txt file found.
) else (
echo No keys.txt found, auto-detecting...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win_prepare_keys.ps1"
)
)

:: Check if keys were prepared successfully
if exist "keys.txt" (
echo.
echo ✅ Keys file prepared successfully!
) else (
echo.
echo ❌ No keys found or file access error.
echo Please add your SiliconFlow API keys and try again.
echo.
pause
exit /b 1
)

:: Start the service
echo.
echo ================================================================
echo              Starting SiliconFlow Key Rotator...              
echo ================================================================
echo.
echo 📍 Endpoint: http://localhost:11435
echo 📊 Health: http://localhost:11435/health
echo 🔗 Claude Router: http://localhost:11435/v1
echo.
echo 🚀 Press Ctrl+C to stop the service
echo 📓 Keep this window open while using Claude Code Router
echo ================================================================
echo.

:: Start the Node.js server
call npm run dev
if errorlevel 1 (
echo.
echo ❌ Failed to start the service!
echo Check the error messages above for details.
echo.
pause
exit /b 1
)

:: Pause when closing
pause