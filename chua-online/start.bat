@echo off
rem Double-click to start Chua Online: server window, game window for LIVE Studio, control panel.
cd /d "%~dp0"
set "NODE_DIR=d:\laragon\bin\nodejs\node-v26.3.1-win-x64"
if not exist "%NODE_DIR%\node.exe" (
  echo Khong tim thay Node tai %NODE_DIR%
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
start "Chua Online - server" cmd /k npm.cmd start
timeout /t 3 /nobreak >nul
call npm.cmd run window
start "" http://127.0.0.1:3000/panel.html
