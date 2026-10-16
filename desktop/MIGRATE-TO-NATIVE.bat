@echo off
setlocal
cd /d "%~dp0.."
if exist "MYVOCAL-Studio-Windows.exe" (
  "MYVOCAL-Studio-Windows.exe" --migrate-native
  exit /b %errorlevel%
)
if exist "MYVOCAL-Studio.exe" (
  "MYVOCAL-Studio.exe" --migrate-native
  exit /b %errorlevel%
)
echo MYVOCAL Studio EXE was not found next to the desktop folder.
exit /b 1
