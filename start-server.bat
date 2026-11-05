@echo off
title Nibras Academy - Local Server
cd /d "%~dp0"

echo ========================================================
echo         Nibras Academy - Starting Server
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        echo Copying .env.example to .env...
        copy /y ".env.example" ".env" >nul
    )
)

if not exist "node_modules\" (
    echo [1/3] Installing dependencies with npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
echo [1/3] Dependencies ready.

echo [2/3] Opening browser at http://localhost:3000...
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

echo [3/3] Starting server on http://localhost:3000...
echo --------------------------------------------------------
echo Server is running on: http://localhost:3000
echo Press Ctrl + C to stop the server at any time.
echo --------------------------------------------------------
echo.

node server.js

if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with an error.
)

pause
