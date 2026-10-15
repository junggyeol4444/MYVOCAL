# MYVOCAL Studio — STEP86 개발·검증 보고서

- 개발 기준: **사용자가 제공한 66개 원본 기획안과 100단계 로드맵** (86. 실제 사람 Lip Sync — 허가받은 사람을 기반으로 한 영상에 가창 오디오의 입 모양을 맞춘다).
- 직전 누적 기준: `MYVOCAL-Studio-Step85-LocalOnly.zip`, `MYVOCAL-Step85-검증보고서.md`; 기존 STEP85 ZIP CRC 검사 성공, 원본 소스 압축 해제 후 누적 수정.
- 개발 진행 순서: **85 → 86**. 87단계(가사·보컬·음악 에너지에 따른 AI 표정 연출) 및 이후 단계는 구현하지 않았음.

## STEP86 구현

1. Character Studio에 **실제 사람 전용 STEP86 Lip Sync 편집기** 추가. 기존 STEP85 음소 타임라인 등록 UI, STEP82 2D/STEP83·84 3D UI는 그대로 유지.
2. **권한 검증:** `kind=person`, 권한 `owned`/`self`/`licensed`만 허용, 허가받은 자료(`licensed`)는 권한 설명 필수. 등록된 실제 사람의 로컬 영상(MP4/WebM/MOV 등)과 로컬 가창 오디오(WAV/MP3/M4A/OGG/WebM/FLAC)를 사용. 40MB 한도와 파일 확장자·MIME 검증 적용.
3. STEP85에서 사용자가 입력·검토한 음소 시간표를 **Viseme에 매핑**, 시간 보정(-10~+10초) 및 세기·입 좌표/크기를 조정해 영상의 실제 입 영역에 대해 Canvas 2D 변형(오벌 마스크 안의 기하학적 입 크기 변형)을 수행. 재생/일시정지/시간 탐색 및 입 영역 가이드 제공.
4. 선택한 가창 오디오와 사람 영상을 동시에 재생하는 미리보기. Video+Audio 트랙을 MediaRecorder에 연결하여 최대 30초·30 FPS, **가창 오디오 포함 WebM**으로 출력. 취소/실패 시 결과를 반환하지 않고 로컬 트랙을 종료.
5. `personLipSync`라는 **별도 프로필 필드**로 타이밍·입 영역·영상 ID·오디오 ID 등을 저장. 새 가창 음원은 캐릭터 로컬 자산에 등록하며 영상 원본이나 STEP85의 `lipSync` 원본을 변경하지 않음.
6. 기존 `.myvocal.json` 백업·복원에서 **STEP86 영상과 오디오의 자산 ID를 모두 새 로컬 ID로 연결**. STEP81 레이어/STEP82 애니메이션/STEP83 VRM/STEP84 무대 등의 자산 재연결 코드 유지. 전체 누적 소스에 신규 기능을 포함한 독립 HTML을 다시 빌드하여 Windows 실행파일에 내장.
7. 코드에 외부 서버·클라우드 AI 호출 추가 없음. 사용자 PC 원격 접속, GitHub 접근/수정, 결제 진행하지 않음.

## 실제 수행한 자동 검증

| 검증 | 결과 |
|---|---|
| STEP86 신규 단위·복원·녹화 동작/실패·취소 테스트 | **8/8 통과** |
| 전체 JavaScript (node --test) | **1608/1608 통과** |
| Go `go test ./...` | **통과** |
| Go `go test -race -count=1 ./...` | **통과** |
| Go `go vet ./...` | **통과** |
| Python `python -m unittest -v test_cli_adapter` | **4/4 통과** |
| 누적 단일 HTML `node scripts/build-standalone.cjs` | **성공, 109개 소스 모듈 포함** |
| Windows x64 GUI 크로스 빌드 (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0`) | **성공, PE32+ x86-64 형식 확인** |
| STEP85 대비 기존 파일 SHA-256 대조 | **575개 모두 존재, 571개 바이트 동일, 4개는 의도적 변경** |
| STEP86 ZIP 무결성 | **완성 산출물 생성 후 CRC 및 개별 해시 확인** |

원본 575개 중 수정된 기존 파일 4개: `src/pages/Characters.jsx`, `src/lib/projectBundle.js`, 누적 `MYVOCAL-Studio-v1.8.html`, 데스크톱 내장 `index.html`.

신규 코드/테스트 4개: `src/lib/personLipSync.js`, `src/lib/personLipRecording.js`, `src/components/PersonLipSyncEditor.jsx`, `tests/person-lip-sync.test.mjs`.

## 사용 방법

1. STEP85 누적 기능을 이용해 **실제 사람 프로필**(사용 권한 있는 영상 포함)을 등록하고, **STEP85 캐릭터 Lip Sync**에서 가사·음소·발음 시각을 저장.
2. 해당 인물의 **STEP86 · 실제 사람 Lip Sync**에서 영상과 가창 오디오를 고른 뒤 자료 사용 권한 확인.
3. 영상 미리보기의 입 영역을 실제 입술 부위에 맞추고 음소 시간 보정·강도·출력 길이를 검토. 입 영역 가이드는 출력 영상에 포함되지 않음.
4. **Lip Sync 설정·오디오 저장**을 누르면 설정과 새 로컬 음원이 프로필에 포함됨. **가창 포함 WebM 출력**을 눌러 현재 로컬 브라우저가 지원하면 2~30초 오디오+영상 WebM 내보내기.
5. 프로젝트 백업에서 원본 영상 및 등록한 가창 오디오가 캐릭터 자산으로 포함되며 복원 시 내부 참조를 재매핑함.

## 한계 및 미검증 사실

- **Windows 10/11 실기기 실행, 실제 로컬 사람 영상의 WebM 인코딩과 사운드 재생, 실제 GPU Canvas 픽셀 시각 품질은 미검증.** 자동 테스트는 가짜 MediaRecorder/IndexedDB 모의 객체로 API 호출·자원 정리·자산 참조를 검증한 것임.
- **AI 얼굴 인식, 움직이는 얼굴 추적, 실제 사람 입술을 사실적으로 재합성하는 신경망 모델, 음성에서 실시간 음소 강제 정렬은 구현하지 않았음.** 현재 입 영역을 사용자가 지정하며, 프레임 안에서 얼굴/입 위치가 움직이면 부정확해진다. Viseme 기반의 단순 기하학 변형은 자연스러운 입술 움직임 품질을 보장하지 않는다.
- STEP85의 **사용자 확인 음소 타이밍**이 정확해야 한다. 자동으로 가창 음원에서 음소 시간을 새로 추정한다고 주장하지 않음. 지정한 입력 자료와 WebM 코덱/MediaRecorder/AudioContext 지원 여부에 따라 재생·녹화 실패 가능.
- 출력은 **WebM**, 최종 MP4 통합 출력은 사용자가 정한 **98단계** 범위라 이번에 진행하지 않음.
- 기존 전체 1~85단계의 AI 모델이 실제로 모두 동작한다고 새로 검증한 것은 아님.

**다음 개발 순서는 87단계 — AI 표정 연출. 86단계의 소스·검증·누적 배포가 끝난 뒤 다음 실행에서만 진행.**
