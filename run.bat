@echo off
setlocal EnableExtensions
title VoiceCraft
cd /d "%~dp0"

echo.
echo  ============================================
echo   VoiceCraft - Text to Speech
echo  ============================================
echo.

rem ---------- 1. Node.js check (auto-install via winget) ----------
where node >nul 2>&1
if errorlevel 1 goto try_winget

for /f "tokens=1 delims=." %%a in ('node -v') do set MAJOR=%%a
set MAJOR=%MAJOR:v=%
if not defined MAJOR goto try_winget
if %MAJOR% LSS 18 goto old_node
goto node_ok

:try_winget
echo  Node.js nahi mila. Winget se auto-install kar rahe hain...
echo  (Agar Windows popup aaye to "Yes" click karo, 1-2 minute lag sakta hai)
echo.
winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements >nul 2>&1

rem Current window me PATH refresh karo (installer is session ko update nahi karta)
set "NODEPATH="
for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul') do set "NODEPATH=%%b"
if not defined NODEPATH for /f "tokens=2*" %%a in ('reg query "HKCU\SOFTWARE\Node.js" /v InstallPath 2^>nul') do set "NODEPATH=%%b"
if defined NODEPATH set "PATH=%NODEPATH%;%PATH%"

where node >nul 2>&1
if errorlevel 1 goto no_node
echo  Node.js install ho gaya: 
node -v
echo.

:node_ok
echo  Node.js found:
node -v
echo.

rem ---------- 2. Packages install (sirf pehli baar) ----------
if exist "node_modules\vite\bin\vite.js" goto have_modules
echo  Packages install ho rahe hain... (sirf pehli baar, internet chahiye)
echo  Iske baad dobara run.bat chalao, turant khulega.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
:have_modules

rem ---------- 3. Build (sirf tab jab dist folder na ho) ----------
if exist "dist\index.html" goto built
echo  Building app...
call npm run build
if errorlevel 1 goto fail
:built

echo.
echo  Browser khulega: http://127.0.0.1:4173
echo  App band karne ke liye ye window close kar do.
echo.

rem ---------- 4. Server + app start ----------
node server\start-local.mjs
if errorlevel 1 goto fail
exit /b 0

:no_node
echo.
echo  Node.js auto-install nahi ho paya. Manual install karo:
echo  1. https://nodejs.org se LTS download karo
echo  2. Install karo, PC restart karo
echo  3. Fir se run.bat double-click karo
echo.
pause
exit /b 1

:old_node
echo  Node.js 18+ chahiye. Current version:
node -v
echo  https://nodejs.org se newer LTS install karo.
echo.
pause
exit /b 1

:fail
echo.
echo  Start fail hua. Ye try karo:
echo  1. Internet on rakho aur run.bat dobara double-click karo
echo  2. Agar antivirus/firewall block kare to "Allow" karo
echo  3. Node.js LTS reinstall: https://nodejs.org
echo.
pause
exit /b 1
