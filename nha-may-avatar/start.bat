@echo off
rem Bam dup de mo Nha may avatar: cua so server, cua so game 9:16 cho LIVE Studio/OBS, trang dieu khien.
rem Neu server da chay thi chi mo lai cua so, khong loi trung cong.
cd /d "%~dp0"
set "NODE_DIR=d:\laragon\bin\nodejs\node-v26.3.1-win-x64"
if not exist "%NODE_DIR%\node.exe" (
  echo Khong tim thay Node tai %NODE_DIR%
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
set "CO_DUYEN_NO_BROWSER=1"
node "%~dp0..\shared\windows-launcher.cjs" "%~dp0." nha-may-avatar 3140 1
if errorlevel 1 (
  pause
  exit /b 1
)
call npm.cmd run window
start "" http://127.0.0.1:3140/
