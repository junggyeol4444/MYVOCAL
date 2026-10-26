# MYVOCAL Studio — Windows EXE 개발 상태

## 사용자 지정 출력

- 실행 파일: Windows 10/11 x64 네이티브 Win32 GUI `MYVOCAL-Studio.exe`
- GUI: Win32 버튼·입력·목록·파일 선택·폴더 선택, Windows API 사용
- 사용 금지: 웹 UI, HTML, HTTP 서버, 브라우저, WebView2
- 외부 사이트·클라우드 서버 사용하지 않음. 설치된 로컬 Python/모델은 직접 실행.
- 사용자 자료는 임의 삭제·덮어쓰기·이동하지 않음.

## 2026-10-27 main 웹 소스 제거

요청대로 현재 main 트리에서 기존 HTML·React·JavaScript 웹 앱, HTTP 라우팅/호스트 Go 코드, WebView2 로더·브라우저 호스트, 구형 웹 배포 파일과 소스 참조를 삭제했다.

- 정리 커밋: `05959fa5e8bd4ef30a209c85661956422d0341ab`
- 제거 735개 파일, 남은 26개 파일 (이후 네이티브 소스 갱신 반영)
- 기존 브라우저 프로젝트의 사용자 PC 데이터는 저장소 정리와 무관하며 접근·삭제하지 않았다.
- 원본 66개 기획안은 `docs/MYVOCAL-원본66개-기획안.md`에 유지한다.
- EXE용 네이티브 소스: `desktop/native/`; 로컬 AI 엔진: `desktop/*_worker.py` 및 보조 Python 파일.

## 현재 개발된 로컬 GUI 기능 (전체 66개 완료 아님)

1. MusicGen 모델로 오프라인 WAV 작곡
2. RVC 녹음 학습으로 새로운 체크포인트 생성
3. Demucs 악기 분리
4. MIDI 음정 보정 및 가창 녹음 편집
5. 2D 캐릭터 립싱크 영상
6. RVC 모델로 보컬 음색 변환
7. DiffSinger 모델로 음소/F0 기반 신경망 가창
8. 3~6분 MusicGen 장편 생성과 중단 재개
9. Win32 내장 오프라인 PCM 믹싱

입력에서 로컬 파일/폴더를 선택하는 Windows 전용 대화상자 코드를 구현했다. Python/AI 모델을 함께 묶은 것이 아니라 기존 설치된 로컬 실행 환경을 사용한다.

## 아직 개발해야 하는 기능

원본 기획안 전체 66개를 순수 네이티브 화면과 로컬 기능으로 구현하는 작업이 남았다. 특히 기존 프로젝트 데이터의 무손실 이용, 다양한 작사·작곡·편곡과 편집 작업, 캐릭터 일관성과 2D/3D 실사 MV, 보컬-영상 합성, 완전한 음악+MV 원클릭 제작 흐름은 미완성이다.

이 단계에서 전체 사용자 기능 동등성을 주장하지 않는다. 저장소에서 기존 웹 소스를 삭제했다고 프로젝트 데이터가 네이티브에서 자동으로 열리는 것도 아니다.

## 빌드 및 배포

Windows PowerShell (저장소 루트):
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\desktop\build-windows.ps1`

최종 출력: `MYVOCAL-Studio.exe` 및 `MYVOCAL-Studio-workers`를 포함한 `MYVOCAL-Studio-Native-Windows.zip`.

진행 순서는 사용자가 지정한 **남은 기능 개발 → 전체 검증 → 오류 수정**. Windows 실기기 GUI 조작, GPU 모델 품질 등 확인하지 않은 사항은 완료라고 하지 않는다.
