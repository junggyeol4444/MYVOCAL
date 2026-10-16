# MYVOCAL Studio — Windows EXE 빌드

현재 빌드 대상: Windows x64, Go 1.23 이상.

## 1. 기존 v1.8 화면 포함

`desktop/index.html`에 v1.8 UI가 이미 포함되어 있습니다. UI 소스가 변경된 경우:

```powershell
cd MYVOCAL-Studio-source
npm install
npm test
npm run build:standalone
Copy-Item MYVOCAL-Studio-v1.8.html ..\desktop\index.html -Force
```

## 2. Windows에서 프로그램 빌드

저장소 루트에서:

```powershell
.\desktop\build-windows.bat
```

또는:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\desktop\build-windows.ps1
```

Go 테스트가 실패하면 EXE 빌드를 중단합니다. 기본 실행 파일은 `MYVOCAL-Studio.exe`입니다. 배포용 `MYVOCAL-Studio-Windows.zip`에는 EXE, 공식 x64 `WebView2Loader.dll`, 라이선스 알림 파일이 포함됩니다. DLL이 없으면 빌드 과정에서 공식 Microsoft WebView2 NuGet SDK에서 다운로드합니다.

실행 PC에는 **Microsoft Edge WebView2 Runtime**이 설치되어 있어야 합니다. 앱 창은 새 설치에서 WebView2 네이티브 창으로 열리지만, UI와 기존 로컬 API 사이의 `127.0.0.1:58319` 내부 HTTP 연결은 아직 남아 있습니다.

기존 Edge/Chrome 프로필의 프로젝트는 다른 WebView2 프로필로 자동 이동하지 않습니다. 기존 저장소를 보호하기 위해 과거 프로필은 종전 실행 모드를 유지합니다.

## 3. GitHub Windows 자동 빌드

`.github/workflows/windows-compatibility.yml`은 Windows 환경에서 Go 테스트, vet, EXE 빌드 후 ZIP 아티팩트를 생성하도록 구성되어 있습니다. 아티팩트 생성 및 Windows 10/11 실기기 GUI 동작은 별도의 검증 결과를 확인해야 합니다.

현재 빌드에 실제 생성형 작사·작곡·Voice Model 학습·AI Singing·AI 영상 모델 전체가 내장되어 있다고 가정하지 마세요.

## 기존 브라우저 프로젝트를 네이티브 창으로 이전

기존 앱의 **설정**에서 **전체 작업공간 ZIP 백업**을 먼저 실행하여 오디오/사진 원본이 포함된 파일을 안전한 위치에 저장합니다. 모든 창을 닫고 Windows ZIP의 `desktop/MIGRATE-TO-NATIVE.bat`를 실행합니다. 새 네이티브 창의 설정에서 **새 프로필에서 ZIP 복원**으로 백업을 가져온 뒤 **백업 복원 확인 · 네이티브 기본 창으로 전환**을 누릅니다. 원본 브라우저 프로필과 그 데이터는 삭제하지 않습니다. 완료 전에 종료하면 종전 실행 설정이 유지됩니다.

이 절차는 기존 Chromium 프로필에서 별도 WebView2 프로필로 데이터를 *복사*하는 명시적 이전 작업입니다. 앱 내부 API는 아직 127.0.0.1 전용 HTTP를 사용하며 네이티브 메시지 IPC 전환은 완료되지 않았습니다.

## 개발자 시험: 네이티브 요청의 TCP 서버 제거

WebView2의 `WebResourceRequested` 이벤트로 동일한 고정 origin(`http://127.0.0.1:58319`)의 화면과 앱 API를 Go 프로세스의 HTTP Handler에 직접 연결하는 시험 경로입니다. **TCP 소켓 서버는 열지 않지만, Chromium의 origin 식별 문자열은 기존 자료의 localStorage/IndexedDB 호환성 때문에 유지합니다.** 신경망 AI 구현과는 무관합니다.

시험 실행: Windows PowerShell에서 `$env:MYVOCAL_NATIVE_INPROCESS='1'; .\MYVOCAL-Studio-Windows.exe` (브라우저 호스트가 아니라 WebView2 호스트인 프로필만 대상). 이 경로는 GUI·대용량 보컬 렌더링 부하 테스트 전이므로 일반 사용자 기본값으로 활성화하지 않았습니다. HTTP 서버를 사용하는 기존 경로는 그대로 유지합니다.
