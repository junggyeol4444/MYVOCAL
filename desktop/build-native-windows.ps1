# Win32 desktop EXE package. No npm, HTML, HTTP server or WebView2.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$native = Join-Path $PSScriptRoot 'native'
$workers = Join-Path $root 'MYVOCAL-Studio-workers'
$exe = Join-Path $root 'MYVOCAL-Studio.exe'
$zip = Join-Path $root 'MYVOCAL-Studio-Native-Windows.zip'
if (-not (Get-Command 'go' -ErrorAction SilentlyContinue)) { throw 'Go 1.23+ 설치가 필요합니다.' }
if (-not (Test-Path -LiteralPath $native -PathType Container)) { throw 'desktop/native 소스가 없습니다.' }

Push-Location $native
try {
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'
    $env:CGO_ENABLED = '0'
    & go build -trimpath '-ldflags=-s -w -H windowsgui' -o $exe .
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw 'Win32 네이티브 EXE 빌드 실패'
    }
} finally { Pop-Location }

New-Item -ItemType Directory -Path $workers -Force | Out-Null
$required = @(
  'musicgen_worker.py',
  'rvc_official_worker.py', 'rvc_pitch_coverage.py',
  'rvc_training_dataset_quality.py', 'rvc_inference_audio_quality.py',
  'music_stems_worker.py', 'score_vocal_worker.py', 'viseme_2d_worker.py'
)
foreach ($name in $required) {
    $source = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "기존 로컬 엔진 소스 누락: $source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $workers $name) -Force
}
$guide = Join-Path $root 'NATIVE-EXE-README.txt'
@'
MYVOCAL Studio Native (Windows 10/11 x64)
EXE 실행 시 Windows 네이티브 GUI가 열립니다. 브라우저/HTML/HTTP/WebView2 없음.
작곡, RVC 음색 학습, Demucs 악기 분리, MIDI 보컬 음정 보정, 2D 립싱크 MV는
기존 Python 엔진을 직접 실행합니다. 각각 설치된 로컬 Python/모델이 필요합니다.
EXE 파일과 MYVOCAL-Studio-workers 폴더를 같은 위치에 보관하십시오.
기존 브라우저/WebView2 프로젝트의 데이터는 자동으로 가져오거나 지우지 않습니다.
현재 네이티브 UI는 원본 66항목 중 일부 기능만 연결한 개발본입니다.
실기기 GUI 및 실제 GPU 학습/합성 검증은 별도 단계입니다.
'@ | Set-Content -LiteralPath $guide -Encoding UTF8
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath @($exe, $workers, $guide) -DestinationPath $zip
Write-Host "Native EXE: $exe"
Write-Host "Package: $zip"
Write-Host '원본 HTML/JS 소스·사용자 데이터는 삭제하지 않았습니다.'
