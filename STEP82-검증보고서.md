# MYVOCAL Studio — STEP82 개발 및 검증 보고서

작성일: 2026-10-14

## 1. 개발 기준·범위
- **STEP81 누적 패키지를 그대로 출발점**으로 하여 **82단계: 2D 캐릭터 애니메이션**만 개발했습니다.
- 66개 원본 기획 및 100단계 순서를 변경하지 않았습니다. 83단계 3D/85단계 자동 Lip Sync는 구현하지 않았습니다.
- Step81 사용자 검토가 끝난 2D 캐릭터의 6개 영역(`body/hair/face/leftEye/rightEye/mouth`)을 재사용합니다.

## 2. 이번 단계 구현
1. Character Studio 카드에 **STEP82 · 2D 애니메이션** 버튼과 저장·검증 상태 표시, 81단계 레이어 저장 전 사용 제한.
2. 실제 IndexedDB 원본 PNG/JPEG/WebP 파일을 로컬로 읽어 Canvas에 프레임을 합성하는 렌더러.
3. 자동 주기 **눈 깜빡임**, **입 열기/닫기**(사용자가 설정하는 주기; 가사/음소 미사용), **고개 기울기**, **몸 흔들림**, **머리카락 흔들림**, **수동 표정 오버레이**, **카메라 줌/이동**.
4. 차분함·역동적·발라드·정지 프리셋, 재생/일시정지/처음으로, 임의 시점 탐색, 길이/FPS/표정과 8개 움직임 변수 수정.
5. 현재 프레임 **실제 PNG 다운로드**, MediaRecorder/Canvas.captureStream을 지원하는 브라우저에서 **무음 WebM 실시간 녹화**와 다운로드, 동작 설정 JSON 내보내기.
6. 사용자 캐릭터 프로필 `animation2d`에 설정 저장, Step81 레이어 영역 변경 감지, 원본 사진·기존 설정 보존.
7. 프로젝트 ZIP/JSON 백업 복원 시 원본 이미지 자산 ID를 재발급받아도 Step82 설정의 `sourceAssetId`를 함께 재매핑.
8. 기존 Step81 안내 문구와 Windows 포함 단일 HTML UI 갱신. 외부 네트워크 호출·외부 AI 모델 불필요.

## 3. 검증 결과 (실제로 실행한 검사)
- JavaScript 전체 회귀 검사: **1,563 / 1,563 통과**, 그중 Step82 신규 테스트 **9개 통과**.
- Go 전체 테스트 (`go test ./...`): **통과**.
- Go Race (`go test -race -count=1 ./...`): **통과**.
- Go Vet (`go vet ./...`): **통과**.
- Python 도구 테스트: **4 / 4 통과**.
- Canvas 픽셀 렌더 검사: 합성 캐릭터로 **6개 시점의 실제 PNG를 렌더링했고 6개 해시가 모두 달랐음** (Node/skia-canvas), 2D 애니메이션 포즈가 화면에 반영됨을 확인.
- Windows x64 GUI 실행 파일: **Go 크로스 컴파일 성공** (`PE32+ x86-64`), 새 단일 HTML 내장.
- 기존 Step81 파일 **534개 보존**, 529개 바이트 동일, 기존 파일 5개만 필요한 범위에서 변경, 기존 파일 삭제 0개.

## 4. 아직 검증되지 않은 기능 / 현재 한계
- **Windows 10/11 실기기 실행, 실제 화면 클릭, WebM 다운로드 결과 및 WebM FPS·코덱 재생은 미검증**. 이 실행 환경에서는 브라우저 제어가 관리자 정책에 의해 차단되었습니다.
- 기존 STEP81은 실제 분할 레이어가 아니라 사용자가 검토한 직사각형 영역입니다. Step82 렌더링도 원본 그림 위의 영역 변환 합성이므로 **가려진 픽셀 복구·정확한 부위 마스킹·정밀 리깅은 불가능**합니다. 평면 얼굴에 이음새 또는 중첩 흔적이 남을 수 있습니다.
- 주기적으로 움직이는 입은 **가사·음소·발음 타이밍·오디오 기반 립싱크가 아닙니다**. 자동 Lip Sync는 기획상 85단계입니다.
- WebM은 브라우저의 MediaRecorder 지원이 필요하고, 결과는 **무음 단일 캐릭터 클립**입니다. FFmpeg MP4·음악 동기화·뮤직비디오 완성 출력은 이번 단계에 포함하지 않았습니다.
- 실제 모델 추론이나 3D 리깅은 사용하지 않습니다.

## 5. 실행 방법
1. 압축의 `MYVOCAL-Step82-Windows.exe`를 Windows PC에서 실행합니다. 원래 브라우저 프로필과 기존 저장 데이터는 유지됩니다.
2. `Character Studio`에서 **사용 권한이 있는 2D 캐릭터**를 고릅니다. STEP81 2D 레이어 분석·수정에서 6개 영역을 수정하고 검토·저장합니다.
3. STEP82 2D 애니메이션에서 Canvas 미리보기를 확인하고 프리셋·표정·동작과 재생 길이/FPS를 수정합니다.
4. 재생/일시정지 및 프레임 탐색. 현재 프레임 PNG를 저장합니다. 브라우저에서 WebM 녹화가 지원되면 WebM 출력으로 짧은 무음 동작 클립을 내려받습니다.
5. **캐릭터 동작 설정 저장**을 눌러 `animation2d` 프로필에 기록합니다. 기존 원본 그림과 81단계 영역은 바뀌지 않습니다.

## 6. 변경한 소스
- `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`
- `source/MYVOCAL-Studio-source/src/components/CharacterLayerEditor.jsx`
- `source/MYVOCAL-Studio-source/src/lib/projectBundle.js`
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`
- `source/desktop/index.html`

### 추가 파일
- `MYVOCAL-Step82-Windows.exe`
- `source/MYVOCAL-Studio-source/src/components/CharacterAnimationEditor.jsx`
- `source/MYVOCAL-Studio-source/src/lib/characterAnimation2d.js`
- `source/MYVOCAL-Studio-source/tests/character-animation2d.test.mjs`


## 7. 검증 진술 주의
- 테스트 통과와 Windows 실기기에서 실제로 클릭해 실행했다는 주장은 서로 다릅니다. 실기기는 검증하지 못했습니다.
