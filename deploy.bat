@echo off
title Nibras Academy - Deployment Helper
cd /d "%~dp0"

echo ========================================================
echo        Nibras Academy - Deploy Helper
echo ========================================================
echo.
echo Choose an option:
echo [1] Push to GitHub (git push origin main)
echo [2] Push to GitHub using Personal Access Token (PAT)
echo [3] Clear old GitHub credentials from Windows
echo [4] Deploy to Vercel (vercel --prod)
echo [5] Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto PUSH_NORMAL
if "%choice%"=="2" goto PUSH_TOKEN
if "%choice%"=="3" goto CLEAR_CREDS
if "%choice%"=="4" goto VERCEL_DEPLOY
if "%choice%"=="5" goto EXIT
echo Invalid choice.
goto END

:PUSH_NORMAL
echo.
echo Pushing to GitHub main branch...
git push origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed.
    echo If you see 403 Permission Denied, choose option 2 to use a Token or option 3 to update your GitHub account.
) else (
    echo.
    echo [SUCCESS] Pushed to GitHub successfully!
)
goto END

:PUSH_TOKEN
echo.
echo Paste your GitHub Personal Access Token:
set /p gtoken="Token: "
if "%gtoken%"=="" (
    echo No token entered. Cancelled.
    goto END
)
echo Pushing with Token...
git push https://%gtoken%@github.com/nibrasacademy11-del/nibras1120.git main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Make sure your Token has the "repo" scope.
) else (
    echo.
    echo [SUCCESS] Pushed to GitHub successfully!
)
goto END

:CLEAR_CREDS
echo.
echo Removing old GitHub credentials from Windows Credential Manager...
cmdkey /delete:LegacyGeneric:target=git:https://github.com >nul 2>nul
echo [OK] Saved credentials removed. Run option 1 to sign in with your new account.
goto END

:VERCEL_DEPLOY
echo.
echo Checking Vercel login...
call vercel whoami >nul 2>nul
if errorlevel 1 (
    echo Please log in to Vercel first...
    call vercel login
)
echo Deploying to Vercel production...
call vercel --prod
goto END

:END
echo.
pause
:EXIT
