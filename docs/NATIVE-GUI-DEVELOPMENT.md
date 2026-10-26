# MYVOCAL Studio — 네이티브 EXE 개발 현황

기존 웹 UI(React/HTML/HTTP/WebView2)를 EXE 창에 표시하는 방식은 사용자 요구와 다르므로, 별도 Windows Win32 컨트롤 기반 네이티브 GUI 소스를 구현했다.

- 실제 빌드 실행 경로: desktop/build-windows.ps1 → desktop/build-native-windows.ps1
- 네이티브 GUI: desktop/native/main_windows.go
- 실제 로컬 엔진 직결: desktop/native/runner.go
- 기존 Python 근거 소스: desktop/musicgen_worker.py, rvc_official_worker.py, music_stems_worker.py, score_vocal_worker.py, viseme_2d_worker.py
- HTTP 리스너, HTML 페이지, 브라우저, WebView2, 로컬 웹 서버를 새 네이티브 GUI에서 실행하지 않음. 외부 모델 다운로드도 하지 않음.
- 원본 HTML·React 프로젝트 및 기존 사용자 브라우저 프로필·IndexedDB는 삭제하거나 자동으로 이전하지 않음. 기존 프로젝트 데이터는 그대로 남음.

## 현재 연결된 일부 기능

1. 기존 로컬 MusicGen 모델로 실제 WAV 생성 (새 출력 파일만 생성)
2. 설치된 공식 RVC를 통한 녹음 데이터셋 학습·신규 모델 생성
3. 기존 로컬 Demucs로 4/6개 음원 stem 분리
4. 원본 가창 WAV와 MIDI 음표 JSON을 이용한 오프라인 음정 보정
5. 기존 이미지·보컬 WAV·음소 JSON을 통한 2D 립싱크 WebM 생성
6. 기존 RVC 체크포인트를 이용한 직접 보컬 WAV 변환 (선택적 FAISS 인덱스)
7. 설치된 DiffSinger 학습 체크포인트와 음소/F0 악보를 이용한 직접 신경망 가창 WAV 생성

미완료: 기존 기획안 66개 기능 전체 네이티브 GUI 포팅 및 7가지 현재 연결 기능의 실제 통합검증, React/IndexedDB 프로젝트 저장소의 네이티브 무손실 이관, 본인 음색으로 한국어 전곡 AI 가창 실품질 검증, 일괄 Music+MV 원클릭 통합, 3D 캐릭터 동작, Windows 10/11 GUI 전체 사용자 동선 및 GPU 모델 실측. 이 문서나 커밋을 최종 완성으로 표시하지 말 것.

## 네이티브 빌드

PowerShell에서 저장소 루트 기준으로 실행:

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\desktop\build-windows.ps1

생성되는 MYVOCAL-Studio.exe, MYVOCAL-Studio-workers 디렉터리와 사용 안내를 ZIP으로 묶는다. 모델 및 Python 의존성은 사용자 PC에 기존 설치된 것을 사용하며 강제 재설치/유료 API 의존 없음. 기능 관련 모델이 없으면 작업을 실행하지 않고 오류를 출력한다.

## 개발 순서

사용자 지정 순서: 남은 개발 완료 → 검증 → 발견 오류 수정. 이번 작업은 코드 추가·Windows PE32+ 교차 빌드 단계이며 Windows 실기기 실행/모델 결과 성공으로 주장하지 않는다. 사용자 음성·사진·프로젝트 자산 삭제 또는 무단 덮어쓰기 금지.
