@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%MYVOCAL-Studio-Windows.exe" (
  "%ROOT%MYVOCAL-Studio-Windows.exe" --migrate-native
  exit /b %errorlevel%
)
if exist "%ROOT%MYVOCAL-Studio.exe" (
  "%ROOT%MYVOCAL-Studio.exe" --migrate-native
  exit /b %errorlevel%
)
if exist "%ROOT%..\MYVOCAL-Studio.exe" (
  "%ROOT%..\MYVOCAL-Studio.exe" --migrate-native
  exit /b %errorlevel%
)
echo MYVOCAL Studio EXE was not found. Extract the entire Windows ZIP before running migration.
exit /b 1
