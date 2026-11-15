@echo off
chcp 65001 >nul
title Nibras local attendance
cd /d "%~dp0"
if not exist node_modules (
  echo Installing for the first time...
  call npm install --no-audit --no-fund
)
:loop
node server.js
echo The server stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
