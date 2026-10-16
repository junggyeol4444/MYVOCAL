@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
if errorlevel 1 (
  echo MYVOCAL Studio Windows build failed.
  exit /b 1
)
echo MYVOCAL Studio Windows build completed.
