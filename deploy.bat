@echo off
chcp 65001 > nul
title Nibras Academy - Deploy Helper
cd /d "%~dp0"

echo ========================================================
echo          أكاديمية نبراس - مساعد الرفع والنشر
echo          Nibras Academy - Deployment Helper
echo ========================================================
echo.
echo اختر العملية التي تريد القيام بها:
echo [1] رفع التعديلات إلى GitHub (git push origin main)
echo [2] رفع التعديلات إلى GitHub باستخدام Personal Access Token (PAT)
echo [3] حذف بيانات GitHub القديمة المحفوظة في ويندوز (لإتاحة تسجيل حساب جديد)
echo [4] النشر على Vercel (vercel --prod)
echo [5] الخروج
echo.

set /p choice="أدخل رقم الاختيار (1-5): "

if "%choice%"=="1" goto PUSH_NORMAL
if "%choice%"=="2" goto PUSH_TOKEN
if "%choice%"=="3" goto CLEAR_CREDS
if "%choice%"=="4" goto VERCEL_DEPLOY
if "%choice%"=="5" goto EXIT
goto INVALID

:PUSH_NORMAL
echo.
echo جاري الرفع إلى فرع main على GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [تنبيه] فشل الرفع. إذا كان الخطأ 403 Permission Denied،
    echo يرجى اختيار الرقم [2] لاستخدام Token أو الرقم [3] لتحديث حسابك المسجل.
) else (
    echo.
    echo [نجاح] تم الرفع إلى GitHub بنجاح!
)
goto END

:PUSH_TOKEN
echo.
echo يرجى لصق الـ GitHub Personal Access Token (PAT) الخاص بحسابك:
set /p gtoken="Token: "
if "%gtoken%"=="" (
    echo تم إلغاء العملية، لم يتم إدخال Token.
    goto END
)
echo جاري الرفع باستخدام الـ Token...
git push https://%gtoken%@github.com/nibrasacademy11-del/nibras1120.git main
if %errorlevel% neq 0 (
    echo.
    echo [خطأ] فشل الرفع، يرجى التأكد من صلاحيات الـ Token (صلاحية repo).
) else (
    echo.
    echo [نجاح] تم الرفع إلى GitHub بنجاح!
)
goto END

:CLEAR_CREDS
echo.
echo جاري حذف بيانات الاعتماد القديمة من Windows Credential Manager...
cmdkey /delete:LegacyGeneric:target=git:https://github.com 2>nul
echo [تم] تم مسح الاعتماد المحفوظ. عند تشغيل أمر git push الآن سيطلب منك تسجيل الدخول بالمتصفح للحساب الجديد.
goto END

:VERCEL_DEPLOY
echo.
echo فحص تسجيل الدخول في Vercel...
call vercel whoami >nul 2>nul
if %errorlevel% neq 0 (
    echo تسجيل الدخول إلى Vercel أولاً...
    call vercel login
)
echo جاري النشر إلى الإنتاج في Vercel (Production Deployment)...
call vercel --prod
goto END

:INVALID
echo اختيار غير صحيح.
goto END

:END
echo.
pause
:EXIT
