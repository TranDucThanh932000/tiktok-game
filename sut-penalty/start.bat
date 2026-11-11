@echo off
rem Bam dup de mo Sut Penalty: cua so server, cua so game 9:16 cho LIVE Studio/OBS, bang dieu khien.
cd /d "%~dp0"
set "NODE_DIR=d:\laragon\bin\nodejs\node-v26.3.1-win-x64"
if not exist "%NODE_DIR%\node.exe" (
  echo Khong tim thay Node tai %NODE_DIR%
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
if not exist node_modules call npm.cmd install
start "Sut Penalty - server" cmd /k npm.cmd start
timeout /t 3 /nobreak >nul
call npm.cmd run window
start "" http://127.0.0.1:3017/panel.html