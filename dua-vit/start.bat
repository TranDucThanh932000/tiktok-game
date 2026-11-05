@echo off
rem Double-click to start Tha Vit: server window, game window (for OBS / LIVE Studio), admin panel.
cd /d "%~dp0"
set "NODE_DIR=d:\laragon\bin\nodejs\node-v26.3.1-win-x64"
if not exist "%NODE_DIR%\node.exe" (
  echo Khong tim thay Node tai %NODE_DIR%
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
if not exist node_modules call npm.cmd install
start "Tha Vit - server" cmd /k npm.cmd start
timeout /t 3 /nobreak >nul
call npm.cmd run window
start "" http://127.0.0.1:3003/admin.html
