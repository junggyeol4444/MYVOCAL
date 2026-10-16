# MYVOCAL Studio — v1.8 기반 소스

원본 66개 항목의 기획안: [MYVOCAL-원본66개-기획안.md](../docs/MYVOCAL-원본66개-기획안.md)

이 저장소의 UI는 React이며 Windows 데스크톱 실행기는 상위 `desktop/`의 Go 소스입니다.

## 소스 검사 및 실행

```powershell
cd MYVOCAL-Studio-source
npm install
npm test
npm run build:standalone
```

데스크톱에 포함된 화면은 `desktop/index.html`입니다. React 소스를 수정한 뒤 독립 HTML을 다시 생성하면 `MYVOCAL-Studio-v1.8.html`의 내용을 `desktop/index.html`에 반영해야 EXE에도 변경사항이 포함됩니다.

Windows EXE 빌드는 `desktop/build-windows.bat` 또는 `desktop/build-windows.ps1`을 사용합니다. 자세한 사항은 `docs/BUILD-EXE.md`를 참고하세요.

## 현재 구현 범위의 구분

- 현재 소스에 프로젝트 데이터, 로컬 오디오/MIDI 편집, 규칙 기반 작곡 및 WAV 처리 기능이 있습니다.
- 규칙 기반 작곡을 실제 생성형 음악 AI로 취급하지 않습니다.
- Voice Training의 준비·데이터셋 관리와 실제 AI Voice Model 학습은 다릅니다.
- 가창 샘플러·외부 엔진 연결과 실제 학습된 목소리의 AI Singing은 다릅니다.
- 영상 작업 계획·스토리보드·로컬 영상 엔진 연동을 완성된 AI 뮤직비디오 생성으로 간주하지 않습니다.
- 실제 Windows 10/11 PC의 GUI 실행과 원본 자료 보존 검증은 별도로 필요합니다.

기존 프로젝트는 브라우저별 로컬 저장소와 IndexedDB에 남아 있습니다. 네이티브 WebView2 새 프로필로 기존 데이터를 자동 이전하지 않습니다. 이전하기 전에 기존 프로그램에서 프로젝트와 자료를 백업해야 합니다.
