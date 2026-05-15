@echo off
title Push ZipToURL to GitHub
cd /d "%~dp0"

set GIT=
for %%G in (
  "C:\Program Files\Git\bin\git.exe"
  "C:\Program Files (x86)\Git\bin\git.exe"
  "%LOCALAPPDATA%\Programs\Git\bin\git.exe"
) do if exist %%G set GIT=%%~G

if "%GIT%"=="" (
  echo Git is not installed.
  echo.
  echo 1. Download and install: https://git-scm.com/download/win
  echo 2. Restart this window and run push-to-github.bat again
  echo.
  pause
  exit /b 1
)

if not exist .git (
  "%GIT%" init
  "%GIT%" branch -M main
)

"%GIT%" add .
"%GIT%" status
echo.
set /p MSG=Commit message [ZipToURL]: 
if "%MSG%"=="" set MSG=ZipToURL app
"%GIT%" commit -m "%MSG%" 2>nul
if errorlevel 1 (
  echo Nothing new to commit, or commit failed.
)

echo.
echo === Next steps ===
echo 1. Open https://github.com/new
echo 2. Repository name: ziptourl
echo 3. Do NOT enable "Add a README" if repo is empty
echo 4. Create repository, then run ONE of these ^(replace YOUR_USER^):
echo.
echo    "%GIT%" remote add origin https://github.com/YOUR_USER/ziptourl.git
echo    "%GIT%" push -u origin main
echo.
echo === Uploads on the internet ===
echo GitHub Pages CANNOT run uploads. After push:
echo 1. Go to https://dashboard.render.com
echo 2. New + ^> Web Service ^> Connect your GitHub repo "ziptourl"
echo 3. Render uses render.yaml automatically - click Deploy
echo 4. Open your Render URL ^(e.g. https://ziptourl.onrender.com^)
echo.
pause
