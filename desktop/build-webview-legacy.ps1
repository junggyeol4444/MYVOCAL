$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$exe = Join-Path $root 'MYVOCAL-Studio.exe'
$dll = Join-Path $root 'WebView2Loader.dll'
$zip = Join-Path $root 'MYVOCAL-Studio-Windows.zip'
if (-not (Get-Command 'go' -ErrorAction SilentlyContinue)) { throw 'Go 1.23+ is required.' }

Push-Location (Join-Path $root 'MYVOCAL-Studio-source')
try {
    if (-not (Get-Command 'npm' -ErrorAction SilentlyContinue)) { throw 'Node.js and npm are required to build the UI.' }
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'UI dependency installation failed.' }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript tests failed.' }
    & node scripts/build-standalone.cjs
    if ($LASTEXITCODE -ne 0) { throw 'UI build failed.' }
    Copy-Item -LiteralPath 'MYVOCAL-Studio-v1.8.html' -Destination (Join-Path $root 'desktop/index.html') -Force
} finally {
    Pop-Location
}

Push-Location $PSScriptRoot
try {
    & go test ./...
    if ($LASTEXITCODE -ne 0) { throw 'Go tests failed: refusing to build a release.' }
    & go build -trimpath '-ldflags=-s -w -H windowsgui' -o $exe .
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exe)) { throw 'Go EXE build failed.' }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $dll)) {
    $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('myvocal-sdk-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporary | Out-Null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $archive = Join-Path $temporary 'webview2.zip'
        $extract = Join-Path $temporary 'package'
        Invoke-WebRequest -Uri 'https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.4258.31' -OutFile $archive -UseBasicParsing
        Expand-Archive -LiteralPath $archive -DestinationPath $extract
        $officialLoader = Join-Path $extract 'runtimes\win-x64\native\WebView2Loader.dll'
        if (-not (Test-Path -LiteralPath $officialLoader)) { throw 'Official Microsoft WebView2 x64 loader missing from SDK package.' }
        Copy-Item -LiteralPath $officialLoader -Destination $dll
    } finally {
        Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $dll)) { throw 'WebView2Loader.dll must accompany the EXE.' }
$notice = Join-Path $PSScriptRoot 'NOTICE.txt'
$license = Join-Path $root 'MYVOCAL-Studio-source\third_party\react-MIT-LICENSE.txt'
$migrate = Join-Path $PSScriptRoot 'MIGRATE-TO-NATIVE.bat'
Compress-Archive -LiteralPath @($exe,$dll,$notice,$license,$migrate) -DestinationPath $zip -Force
Write-Host "Created: $exe"
Write-Host "Created: $zip (EXE + WebView2Loader.dll + notices)"
Write-Host 'Requires Microsoft Edge WebView2 Runtime on the target Windows PC.'
