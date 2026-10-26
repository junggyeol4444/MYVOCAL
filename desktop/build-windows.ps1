# Default Windows release is a native Win32 EXE, not the historical HTML host.
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-native-windows.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
