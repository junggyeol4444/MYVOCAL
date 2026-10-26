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
  'music_stems_worker.py', 'score_vocal_worker.py', 'viseme_2d_worker.py',
  'midi_soundfont_worker.py'
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
MusicGen 작곡, RVC 음색 학습·변환, Demucs 악기 분리, DiffSinger 가창, 2D 립싱크 MV,
Windows 마이크 녹음, WAV 컷·정규화·페이드, 다중 악기 MIDI 작곡·불러오기·저장,
SoundFont MIDI→WAV 렌더링을 네이티브 화면에서 선택합니다.
MIDI 작곡 창에서 @ Piano 0 다음에 60 0 1 100 처럼 음표를 적을 수 있습니다.
프로젝트 생성/불러오기 후 프로젝트 파일에 편집 상태를 저장합니다.
SoundFont 실제 오디오 렌더링은 사용자 PC에 설치된 로컬 Python·pretty_midi·FluidSynth DLL과
사용자 소유 SF2/SF3 음원을 직접 사용합니다. 모델과 엔진을 강제 설치하지 않습니다.
EXE 파일과 MYVOCAL-Studio-workers 폴더를 같은 위치에 보관하십시오.
기존 브라우저/WebView2 프로젝트의 데이터는 자동으로 가져오거나 지우지 않습니다.
현재 네이티브 UI는 원본 66항목 중 일부 기능만 연결한 개발본입니다.
실기기 GUI 및 실제 GPU 학습/합성 검증은 별도 단계입니다.
'@ | Set-Content -LiteralPath $guide -Encoding UTF8
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath @($exe, $workers, $guide) -DestinationPath $zip
Write-Host "Native EXE: $exe"
Write-Host "Package: $zip"
Write-Host 'MYVOCAL 네이티브 Windows EXE와 오프라인 엔진 패키지 생성 완료.'
