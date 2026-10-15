# MYVOCAL Studio — STEP89 개발·검증 보고서

- 수행일: **2026-10-15 (Asia/Seoul)**
- 기준 원본: **현재 MYVOCAL 대화의** `MYVOCAL-Studio-Step88-LocalOnly.zip` **실제 접근, CRC 검사, 전체 압축 해제**, 검증보고서 `MYVOCAL-Step88-검증보고서.md` 열람.
- 기준 요구사항: 제공된 **66개 원본 기획안**, **100단계 개발 순서** 확인.
- 수행 단계: **89. 직접 연기 및 악기 연주 연결 — 웹캠·참고 영상의 움직임과 MIDI 악기 트랙을 캐릭터 연기에 연결한다.**
- 90단계(다중 캐릭터·가상 밴드)와 이후 단계는 수행하지 않음. 로컬 전용, 외부 AI 호출·GitHub·원격 PC 접속·결제 없음.

## STEP89 구현 및 한계

1. `src/lib/characterPerformance89.js` — 기존 프로젝트의 BPM·MIDI `startBeat`, `length`, `pitch`, `velocity`를 읽어 **30초 안의 Guitar/Piano/Drums/Bass/Strings/Synth 연주 시작·종료 큐**로 변환합니다. 음소·보컬 트랙은 손대지 않으며, `mute` 트랙은 생략합니다. 기존 음악 프로젝트 파일 자체는 수정하지 않습니다.
2. `src/components/CharacterPerformance89Editor.jsx` — Character Studio에 **STEP89 · 직접 연기 및 악기 연주 연결** 화면을 추가합니다. 사용자 선택으로 브라우저 **웹캠 권한(getUserMedia; 오디오 요청 없음)** 또는 기존 등록·허가된 `motion-reference` 동영상을 로컬에서 재생하면서, 최대 30초간 저해상도 영상의 **좌/중/우 프레임간 밝기 변화량**을 시간표로 기록합니다. 사용자가 기록한 움직임 값을 CSV 형태로 수동 보정하고 JSON으로 출력할 수 있습니다.
3. 영상 원본 프레임, 음성, 얼굴 식별자 또는 포즈 좌표를 `performance89`에 저장하지 않습니다. 시간(ms)과 세 구간의 움직임 강도(0~1)만 보관하며, 웹캠 사용을 끝내거나 화면을 닫으면 스트림 트랙을 중지합니다. 영상과 원본 캐릭터 자산을 수정하지 않습니다.
4. `src/lib/character3dRenderer.js` — 기존 `calculateRigPose` 호출 형태를 보존하고, 추가된 `calculateRigPoseWithPerformance`를 통해 **저장된 움직임 시간표와 MIDI 연주 펄스를 VRM의 좌우 팔·팔꿈치·몸통·머리·허리 본 회전에 가산**합니다. 83단계 모델 미리보기와 84단계 무대·무음 WebM 렌더링에 동일한 공연 타임라인이 적용됩니다. 호환 본이 없으면 움직임은 나타나지 않습니다.
5. `src/lib/characterAnimation2d.js` — 81단계에서 검토된 몸·얼굴의 2D 영역에 영상 움직임의 제한적 흔들림·이동을 합성합니다. 기존 82단계 WebM 출력에도 새 시간표를 적용합니다. **손가락 연주, 악기 오브젝트와의 접촉, 전신 관절 추적, 실제 연기 영상 합성은 구현하지 않았습니다.**
6. `performance89`는 캐릭터의 **별도 선택적 필드**로 저장됩니다. 85단계 Lip Sync, 86단계 실제 사람 Lip Sync, 87단계 표정, 88단계 춤, 기존 이미지·모델·무대의 저장 데이터를 덮어쓰지 않습니다. 백업·복원 시 `referenceAssetId`, 연결 음악 프로젝트 ID 및 연주 MIDI 트랙 ID를 새 값으로 변경합니다.
7. 로컬 입력만 허용하며 캐릭터 사용 권한, 영상 참조 자산, 날짜/큐 시간/수치/개수 범위, 악기 종류 및 유효한 MIDI 데이터 검사를 거칩니다. 복원 후 참고 영상이나 프로필이 없으면 89단계 기능만 비활성화하고 기존 모션은 유지합니다.

### 구현 범위 해석

- **웹캠·참고 영상의 움직임은 실제 프레임 밝기 차이를 세 구간으로 측정한 값**이지, 실제 얼굴/손/발 포즈를 자동 검출하거나 전문 AI 모션캡처한 결과가 아닙니다. 사용자 움직임·조명 변화·카메라 흔들림을 구분하지 못할 수 있습니다.
- **MIDI 악기 연주**는 노트 시간표를 기준으로 기본 팔 움직임을 연출합니다. 손가락 위치, 악기 모델·현/건반/드럼스틱 물리, 영상 원본 움직임 복제는 지원하지 않습니다.
- 실제 가창 음원 믹싱/MP4 인코딩(98단계), 90단계 여러 캐릭터 가상 밴드를 앞당겨 구현하지 않았습니다.

## 실제 실행 테스트

| 항목 | 결과 |
|---|---|
| 신규 STEP89 자동 테스트 | **10/10 통과** (MIDI 변환, 권한/안전 검증, 프레임 밝기 변화 및 보정, 2D/3D 렌더 연계, 기존 데이터 보존, 백업·복원 ID 재매핑, UI 경로) |
| 전체 JavaScript `node --test --test-concurrency=2 tests/*.test.mjs` | **1,637/1,637 통과** |
| Go `go test ./...` | **통과** |
| Go `go test -race -count=1 ./...` | **통과** |
| Go `go vet ./...` | **통과** |
| Python `python -m unittest -v test_cli_adapter` | **4/4 통과** |
| `node scripts/build-standalone.cjs` | **성공: 115개 모듈** |
| 단독 HTML ↔ Windows 앱 내장 HTML | **바이트 SHA-256 동일** |
| Windows x64 GUI `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-H=windowsgui'` | **성공, PE32+ x86-64 Windows GUI, STEP89 코드 내장 확인** |
| Step88 원본 누적 ZIP | **CRC 정상, 파일 593개 전부 보존** |
| 원본 대비 파일 해시 | **기존 파일 584개 SHA-256 동일, 9개 의도된 소스/HTML 수정** |
| STEP89 누적 ZIP | **전체 597개 파일 CRC·SHA-256, UTF-8 한글 경로 검사 정상** |

### 기존 테스트 실패 및 수정 기록

초기 JavaScript 전체 테스트에서 Step88의 기존 함수 시그니처 문자열 검사 1개가 실패했습니다. 기존 `calculateRigPose(model,settings,time,dancePlan)` 인터페이스를 되살리고, 신규 `calculateRigPoseWithPerformance`를 별도 추가하여 기존 테스트를 변경하지 않고 **1,637/1,637 전체 통과**시켰습니다.

## Step88 보존 및 배포

- STEP88 ZIP의 **기존 593개 파일 전부 유지**, **584개 바이트 동일**, **9개 관련 소스·내장 HTML만 수정**.
- 신규 3개 소스: `src/lib/characterPerformance89.js`, `src/components/CharacterPerformance89Editor.jsx`, `tests/character-performance-89.test.mjs`.
- 최종 보고서 파일 1개 추가 → **597개 파일 ZIP**. 테스트로 갱신된 원래 Python `.pyc` 캐시 3개는 원본 ZIP의 바이트로 복원했습니다.
- 최신 Windows EXE는 별도 파일 `MYVOCAL-Step89-Windows.exe`로 배포합니다(기존 단계 ZIP 방식과 동일). 누적 ZIP에 Step88 이전 기존 소스·자산·실행 파일이 보존됩니다.
- SHA-256 (Windows EXE): `e08fbd8fc50432e5650eba825e9ef057edd16abd5ee59bbacecaa10cb08ff8e8`.

## 실제 기기에서 아직 확인할 사항

- **Windows 10/11 실기기에서 Step89 EXE 실행·웹캠 권한 부여·카메라 시작/중지·재실행·데이터 저장/복원은 미검증**입니다. 실제 카메라 권한 흐름은 브라우저/앱 환경 정책에 따라 제한될 수 있습니다.
- **실제 카메라·참고 영상 재생·녹화, GPU/WebGL VRM 본 움직임·동작 자연스러움, 실제 WebM 인코딩 화질은 미검증**입니다. 자동 테스트는 계산 및 모의 렌더·복원 연결만 증명합니다.
- 과거 단계의 외부 AI 모델 종단 기능까지 새로 검증한 것은 아닙니다.

**다음 개발 순서: 90단계 — 다중 캐릭터·가상 밴드.** 이 단계는 실제로 수행하지 않았습니다.
