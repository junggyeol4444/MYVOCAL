@echo off
setlocal
where go >nul 2>nul
if %errorlevel% neq 0 (
  echo Go 1.23 or later is required to build the desktop EXE.
  pause
  exit /b 1
)
cd /d "%~dp0"
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0
go build -trimpath -ldflags="-s -w -H windowsgui" -o "..\MYVOCAL-Studio.exe" .
if %errorlevel% neq 0 (
  echo Build failed.
  pause
  exit /b 1
)
echo Created ..\MYVOCAL-Studio.exe
pause
