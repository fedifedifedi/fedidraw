@echo off
rem FediDraw - double-click to launch the app locally.
rem   start.bat        -> this computer only (http://localhost:4173)
rem   start.bat lan    -> also reachable from a phone on the same Wi-Fi
setlocal
cd /d "%~dp0web"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first launch only...
  for /l %%i in (1,1,5) do (
    call npm install --no-audit --no-fund && goto installed
    echo Download interrupted, retrying...
  )
  echo Could not install the dependencies. Check your internet connection and try again.
  pause
  exit /b 1
)
:installed

echo Building FediDraw...
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo FediDraw is running. Close this window or press Ctrl+C to stop it.
if /i "%~1"=="lan" (
  call npx vite preview --host --open
) else (
  call npx vite preview --open
)
