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
echo [4] Send main to the Hostinger server and update it
echo [5] Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto PUSH_NORMAL
if "%choice%"=="2" goto PUSH_TOKEN
if "%choice%"=="3" goto CLEAR_CREDS
if "%choice%"=="4" goto SERVER_UPDATE
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

:SERVER_UPDATE
echo.
rem The server's address is kept in deploy\server-host.txt (not committed)
set "host="
if exist "deploy\server-host.txt" set /p host=<"deploy\server-host.txt"
if "%host%"=="" (
    set /p host="Server IP: "
)
if "%host%"=="" (
    echo No address entered. Cancelled.
    goto END
)
echo %host%>"deploy\server-host.txt"
rem The code goes to the server's own git store (remote "vps"), not through GitHub
set "GIT_SSH_COMMAND=ssh -i "%USERPROFILE%\.ssh\nibras_vps" -o IdentitiesOnly=yes"
echo Sending the code to the server %host% ...
git push vps main
if errorlevel 1 (
    echo.
    echo [ERROR] Could not send the code. Check the key %USERPROFILE%\.ssh\nibras_vps and the remote "vps" ^(git remote -v^).
    goto END
)
echo Updating the server %host% ...
ssh -i "%USERPROFILE%\.ssh\nibras_vps" -o IdentitiesOnly=yes root@%host% "sudo -iu nibras bash /var/www/nibras/deploy/update.sh main"
goto END

:END
echo.
pause
:EXIT
