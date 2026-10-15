# MYVOCAL Studio — STEP84 개발·검증 보고서

작성일: 2026-10-14

## 개발 기준과 변경 제한
- 입력 원본: `MYVOCAL-Studio-Step83-LocalOnly.zip`의 전체 소스·기존 EXE·자산·테스트.
- 사용자 지정 로드맵: **84단계 — 3D 무대 연출: 캐릭터 동작, 카메라, 조명, 배경을 이용해 공연 영상을 만든다.**
- 66개 원본 기획 항목 및 1~83단계 구현은 제거·대체하지 않았습니다. 85단계 가사·음소 Lip Sync 및 98단계 MP4 통합 출력은 개발하지 않았습니다.

## 누적 구현 항목
1. 기존 Character Studio에서 등록된 VRM 0.x/1.0/GLB/내장형 glTF 캐릭터에 **STEP84 · 3D 무대 연출** 진입 기능을 추가했습니다. STEP83 3D 모델 미리보기는 별도로 유지합니다.
2. 기존 STEP83 WebGL 렌더러를 확장하여 **실제 3D 삼각형 지오메트리**로 무대 바닥·앞단·배경 벽·LED 라인 구조를 렌더링합니다. 무대 스타일은 공연장, 네온, 극장 3종입니다.
3. 카메라 **고정/회전/트래킹/돌리/쇼트 전환** 5종과 수동 각도·높이·줌·강도 설정을 제공합니다. 시간 함수에 따라 미리보기와 영상의 프레임 연출을 계산합니다.
4. 조명 **스튜디오/따뜻함/차가움/박동** 4종 및 밝기·움직임을 지원합니다. 각 정점의 위치와 시간에 따른 간단한 밝기 계산을 기존 캐릭터 셰이딩에 적용합니다. 물리 기반 PBR·그림자 추적은 아닙니다.
5. 기존 VRM 캐릭터의 대기/끄덕임/팔 흔들기, glTF 내장 애니메이션, VRM 표정 선택과 강도·속도를 사용합니다. 선택된 모션이 모델의 본/표정에 매핑되어 있어야 시각적인 움직임이 발생합니다.
6. 실시간 타임라인(재생/정지/프레임 탐색), **현재 프레임 PNG**, **무대 JSON**, **무음 WebM 녹화**(MediaRecorder 지원 브라우저에서 2~30초, 24/30fps 설정)를 구현했습니다. 중단·오류 시 불완전한 결과를 다운로드하지 않으며 녹화 스트림을 정리합니다.
7. 캐릭터의 새로운 `stage3d` 필드로 무대 설정을 저장합니다. 기존 `rig3d`, `layerPlan`, `animation2d`, 원본 VRM/GLB는 수정하지 않습니다. 프로젝트 백업·복원에서 `stage3d.assetId`를 복원된 새 로컬 자산 ID로 다시 연결합니다.
8. 원본 권리/허가, 모델 자산 ID, 유효한 모션·조명·카메라, 프레임률·시간·수치 범위 검사로 저장·영상 출력을 보호합니다. 외부 네트워크 AI 모델 요청을 추가하지 않았습니다.

## 실제 실행 검증
- JavaScript 전체 테스트: **1,598/1,598 통과**, 신규 84단계 테스트 **18/18 통과**.
- 84단계의 시간별 카메라/조명 차이, 안전한 무대 설정 저장, 권한·잘못된 값 거부, WebGL 드로잉 경로를 가짜 WebGL 드라이버로 검증, WebM 녹화 API를 모의 MediaRecorder로 검증, 취소 시 파일 미반환, 실제 프로젝트 백업 복원에서 자산 ID 재매핑을 확인했습니다.
- Go: `go test ./...`, `go test -race -count=1 ./...`, `go vet ./...` 통과.
- Python: `python -m unittest -v test_cli_adapter` **4/4 통과**.
- 프런트엔드 누적 단일 HTML 빌드 `node scripts/build-standalone.cjs` 성공.
- Go Windows x64 GUI 실행 파일: `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-H=windowsgui'` 성공. 최신 Step84 HTML 내장 확인.
- 기존 Step83 ZIP과 SHA-256 파일별 보존 대조 및 최종 Step84 ZIP CRC 검사 수행.

## 미검증 / 한계 (완료로 주장하지 않는 범위)
- **실제 Windows 10/11 컴퓨터에서 EXE 실행, VRM 화면 조작, WebM 녹화/재생은 미검증**입니다. Linux 환경의 Chromium은 EGL/그래픽 초기화에 실패하여 화면 픽셀을 실제로 캡처하지 못했습니다.
- **실제 GPU WebGL 렌더링 픽셀 품질과 진짜 MediaRecorder/WebM 스트림은 검증하지 못했습니다.** 가짜 WebGL/MediaRecorder 테스트는 API 호출과 상태·안전 경로만 증명합니다. 대상 Windows PC와 그래픽 드라이버에서 반드시 실행 확인해야 합니다.
- 무대는 **간단한 절차적 WebGL 무대**이며 외부 3D 월드 제작, 사실적 조명·그림자, 고급 VRM 렌더러/PBR/물리 효과를 제공하지 않습니다.
- 출력 영상은 **무음 WebM**입니다. 음악·가사 자동 동기화 및 최종 MV 오디오 합성/MP4는 아직 개발 단계에 포함되지 않습니다. 실제 MP4 인코더를 구현했다고 주장하지 않습니다.
- 프로젝트 전체 1~83단계의 모든 AI 모델이 실제로 동작한다는 뜻이 아닙니다. 기존 별도 모델 요구사항 및 Windows 실기기 미검증 상태는 유지됩니다.

## 사용 방법
1. 전체 ZIP을 압축 해제하여 `MYVOCAL-Step84-Windows.exe` 실행 (실기기 검증 필요).
2. Character Studio → 이미 등록된 **3D 모델 캐릭터**의 **STEP84 · 3D 무대 연출** 선택.
3. 캐릭터, 배경·조명·카메라·모션 및 영상 길이·FPS를 선택하고 **재생/일시정지/탐색**으로 미리보기.
4. **무대 설정 저장**을 누르면 캐릭터의 `stage3d`에 설정을 보존합니다. PNG/JSON 개별 내보내기도 지원합니다.
5. 브라우저에서 WebGL·Canvas.captureStream·MediaRecorder(WebM)를 지원하면 **공연 영상 WebM 내보내기**로 무음 영상을 파일로 출력합니다. 중간 취소 가능합니다.
6. 구버전 프로젝트와 원본 3D 파일은 유지합니다. 백업 복원 시 무대와 원본 ID가 다시 연결됩니다.

## 주요 변경 소스
- 기존 수정: `src/lib/character3dRenderer.js`, `src/pages/Characters.jsx`, `src/lib/projectBundle.js`, 누적 단일 HTML 2개(독립 실행, 데스크톱 내장).
- 신규 추가: `src/lib/characterStage3d.js`, `src/lib/stage3dRecording.js`, `src/components/CharacterStage3dEditor.jsx`, `tests/character-stage-3d.test.mjs`.

## 다음 순서
**85단계 — 캐릭터 Lip Sync.** 가사·음소·발음 시간을 Viseme/입 모양으로 연결할 예정이며, 이번 84단계에서 앞당기지 않았습니다.
