@echo off
chcp 65001 > nul
title Nibras Academy - Local Server
cd /d "%~dp0"

echo ========================================================
echo          أكاديمية نبراس - تشغيل السيرفر المحلي
echo          Nibras Academy - Local Server Runner
echo ========================================================
echo.

:: 1. فحص وجود Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] Node.js غير مثبت على جهازك!
    echo يرجى تحميل وتثبيت Node.js من: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. فحص ملف الإعدادات .env
if not exist ".env" (
    echo [تنبيه] ملف .env غير موجود. جاري نسخه من .env.example...
    if exist ".env.example" (
        copy .env.example .env > nul
        echo [تم] تم إنشاء ملف .env بنجاح.
    ) else (
        echo [خطأ] لم يتم العثور على .env أو .env.example!
        pause
        exit /b 1
    )
)

:: 3. فحص مجلد الحزم والمكتبات node_modules
if not exist "node_modules\" (
    echo [1/3] تثبيت الحزم والمكتبات (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [خطأ] فشل تثبيت المكتبات عبر npm.
        pause
        exit /b 1
    )
) else (
    echo [1/3] المكتبات والحزم جاهزة.
)

:: 4. فتح المتصفح تلقائياً بعد ثانيتين
echo [2/3] فتح المتصفح على http://localhost:3000...
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

:: 5. تشغيل السيرفر
echo [3/3] جاري تشغيل السيرفر الآن...
echo.
echo --------------------------------------------------------
echo السيرفر يعمل الآن على الرابط: http://localhost:3000
echo لإيقاف السيرفر: اضغط Ctrl + C أو أغلق هذه النافذة.
echo --------------------------------------------------------
echo.

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [تنبيه] توقف السيرفر عن العمل.
)

pause
