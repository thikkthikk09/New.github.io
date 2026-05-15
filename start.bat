@echo off
title ZipToURL Launcher
cd /d "%~dp0"

set "NODE="
set "NODEPATH=c:\Users\User\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
if exist "%NODEPATH%" set "NODE=%NODEPATH%"

where node >nul 2>&1
if %errorlevel%==0 if not defined NODE set "NODE=node"

if not defined NODE (
  echo Node.js not found.
  echo Install from https://nodejs.org OR open this folder in Cursor.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3847/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Server already running.
  start "" "http://localhost:3847"
  echo Opened http://localhost:3847 in your browser.
  pause
  exit /b 0
)

echo Starting ZipToURL server...
start "ZipToURL Server - keep this open" cmd /k ""%NODE%" server.js"

echo Waiting for server to start...
set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 30 (
  echo Server did not start. Check the ZipToURL Server window for errors.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3847/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto waitloop

echo.
echo Server ready!
start "" "http://localhost:3847"
echo Browser opened: http://localhost:3847
echo Keep the "ZipToURL Server" window open while uploading.
echo.
pause
