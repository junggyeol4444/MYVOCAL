# MYVOCAL Studio — STEP88 개발·검증 보고서

- 기준 실행일: **2026-10-15 (Asia/Seoul)**
- 기준 소스: 현재 MYVOCAL 대화에 업로드된 `MYVOCAL-Studio-Step87-LocalOnly.zip` (압축 589개 항목, ZIP CRC 원본 검사 정상)
- 기준 검증보고서: `MYVOCAL-Step87-검증보고서.md` 실제 열람
- 기준 요구사항: 사용자의 원본 66개 기획 항목과 상세 100단계 로드맵 확인
- **수행 단계: 88. AI Dance Director — 비트·장르·구간 분석과 Motion Reference 적용**
- **89단계(직접 연기·악기 연주 연결)는 시작하지 않음.** Step87을 기준으로 누적 수정했고 1~87단계를 삭제하거나 별도 새 프로젝트로 대체하지 않음.
- 로컬 파일만 사용: GitHub/외부 서버/클라우드 AI/사용자 PC 원격 접속·결제 없음.

## STEP88 구현

1. `characterDanceDirector.js`에 로컬 **BPM(40~240)·장르 혼합·곡 섹션별 마디 수** 기반의 결정적 댄스 큐 생성기를 추가했습니다. 입력은 기존 음악 프로젝트의 `bpm`, `genreMix`, `sections[*].bars`, 선택적인 `sections[*].genreMix`입니다. 스텝·그루브·바운스·스웨이·팔 흔들기·포즈의 6개 동작을 섹션별로 선택하며 비트 위상에 맞춰 강도와 관절 회전을 계산합니다. 가사·오디오 신호 자체를 AI로 분석하는 모델은 사용하지 않습니다.
2. Character Studio에 **`STEP88 · AI Dance Director`** 편집 화면을 추가했습니다. 기존 음악 프로젝트 선택 또는 수동 BPM/장르 지정, 2~30초 안무 길이, 시간/동작/강도/참고영상 구간 수동 교정, 슬라이더 탐색, JSON 내보내기 및 저장이 가능합니다.
3. 원본의 `motion-reference` 비디오를 **로컬에서 불러오고 시청**하면서 동작 큐별 `referenceStartMs` 및 움직임 유형을 **사람이 직접 매핑**할 수 있습니다. 이 시간표에 지정된 수동 안무가 미리보기/녹화에 반영됩니다. **실제 영상에서 사람의 관절을 추출하거나 자동 모션 캡처하는 기능은 아닙니다**(다음 89단계의 직접 연기/참고 영상 활용과 혼동 금지).
4. 기존 STEP83 WebGL 3D 캐릭터 모션·STEP84 무대 미리보기/무음 WebM 녹화에 `calculateRigPose(...,dancePlan)`을 연결했습니다. VRM 휴머노이드 본(hips/spine/head/arms/legs)에 비트 동기 회전·작은 위치 이동을 기존 애니메이션 위에 **가산**하며, STEP85 Lip Sync 및 STEP87 표정이 우선/독립적으로 남습니다. 대응 본이 없으면 그 동작은 화면에 반영되지 않습니다.
5. 기존 STEP82 2D Canvas 애니메이션 및 WebM 출력 경로에 검토된 몸/얼굴 영역의 **비트 동기 이동·회전 근사**를 적용합니다. 원본 평면 그림의 실제 전신 스켈레톤·숨겨진 픽셀은 생성하지 않습니다.
6. 캐릭터의 신규 `dance88` 필드에 계획을 저장합니다. STEP85 `lipSync`, STEP86 `personLipSync`, STEP87 `expression87`, 기존 `rig3d`, `stage3d`, `layerPlan`, `animation2d`, 자산 및 권한 정보를 덮어쓰지 않습니다. 프로젝트 백업·복원에서는 **Motion Reference 자산 ID 및 연결 음악 프로젝트 ID를 새 ID로 재연결**합니다.
7. 권한 없는 등록, 참조 영상 ID 누락, 데이터 버전 오류, BPM·시간 제한 초과, 동작 이름·강도 오류, 시간 중첩, 음수가 포함된 참조 타임코드 및 256개를 넘는 큐를 거부합니다. 손상되거나 자산이 사라진 구 계획은 기존 모션을 차단하지 않고 STEP88만 비활성화합니다.

## 배포 구성

- 누적 소스 ZIP에는 **STEP87 원본 589개 파일 전체(이전 EXE들 포함)**, STEP88 변경 소스와 신규 테스트 3개, STEP88 검증보고서를 보존했습니다.
- **최신 STEP88 Windows x64 EXE는 별도 파일로 제공**합니다. 첨부 용량 제한 때문에 이를 ZIP에 다시 중복 수록하지 않았습니다. 해당 EXE는 Step88 최신 데스크톱 내장 HTML로 빌드되어 Windows PE 형식과 내용 포함 여부를 확인했습니다.

## 실제 실행한 테스트

| 검사 | 결과 |
|---|---|
| 신규 STEP88 `node --test tests/character-dance-director.test.mjs` | **9/9 통과**: 비트·구간·장르 생성, 3D 본 포즈, 2D Canvas, 참고 영상 수동 구간, 기존 상태 보존, 권한·입력 거부, 프로젝트 ZIP 백업 형식의 복원·ID 재연결, UI 경로 검사 |
| 전체 JavaScript `node --test --test-concurrency=2 tests/*.test.mjs` | **1,627/1,627 통과** |
| Go `go test ./...` | **통과** |
| Go `go test -race -count=1 ./...` | **통과** |
| Go `go vet ./...` | **통과** |
| Python `python -m unittest -v test_cli_adapter` | **4/4 통과** |
| 단일 HTML 빌드 `node scripts/build-standalone.cjs` | **성공: 113개 모듈** |
| 데스크톱 내장 HTML와 생성된 단일 HTML 일치 | **SHA-256 일치**, JavaScript parity 테스트 통과 |
| Windows x64 GUI EXE 교차 빌드 (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0`) | **성공**, PE32+ x86-64 Windows GUI 확인; STEP88 신규 코드 내장 확인 |
| 이전 STEP87 ZIP 자체 CRC | **통과** |
| 원본 589개 항목 SHA-256 / 변경 범위 | 아래 비교 참조 |
| 최종 STEP88 누적 ZIP | **전체 CRC + 각 파일 SHA-256 검증 수행** |

### JavaScript 전체 테스트 중 발견·수정한 검증 실패

최초 병렬 검사에서는 `standalone-parity.test.mjs`가 `SIGKILL`로 종료됐습니다. 원인은 변경된 소스 HTML을 `desktop/index.html`에 복사하지 않아 두 파일이 달랐던 상태였습니다. 수정하여 **동일 파일 SHA-256**을 확인한 후 `--test-concurrency=2`로 **1,627/1,627**을 재실행해 통과했습니다. 기존 검증 오류를 숨기지 않습니다.

### Step87 원본 대비 파일 보존

- 원본 ZIP의 **589개 파일 모두 존재**하며 이번 단계에서 삭제한 항목은 없습니다.
- 기존 파일 **580개는 완전 동일한 SHA-256**, **9개는 STEP88에 필요한 의도적 변경**입니다.
- 수정 9개: `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`, `src/components/Character3dEditor.jsx`, `CharacterStage3dEditor.jsx`, `CharacterAnimationEditor.jsx`, `src/lib/character3dRenderer.js`, `characterAnimation2d.js`, `projectBundle.js`, 독립 단일 HTML(`source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`), Windows 내장 HTML(`source/desktop/index.html`).
- 추가 3개: `src/lib/characterDanceDirector.js`, `src/components/CharacterDanceEditor.jsx`, `tests/character-dance-director.test.mjs`.
- Python 테스트가 다시 쓴 기존 `.pyc` 3개는 **Step87 ZIP의 원래 SHA-256 바이트로 되돌렸습니다**. 캐시 변경을 배포 수정으로 집계하지 않았습니다.

## 사용 방법

1. Character Studio에서 본인 제작 또는 허가받은 2D(검토된 STEP81 레이어)·3D 모델 캐릭터를 선택하고 **STEP88 · AI Dance Director**를 엽니다.
2. 기존 음악 프로젝트를 선택하면 BPM, 장르 혼합 및 곡 구간별 마디 수를 활용합니다. 또는 BPM/장르를 직접 설정합니다. 최대 30초 춤 큐를 생성합니다.
3. `시작초,종료초,동작,강도,참고영상 시작초` 형식의 행을 검토/수정할 수 있습니다. Motion Reference를 등록한 경우에만 참고 영상 시작초를 쓸 수 있습니다. 참고 영상은 원본을 시청하며 안무를 **수동으로 해석**합니다.
4. 춤 계획 저장을 누른 뒤 STEP83 캐릭터 모델, STEP84 3D 무대 또는 STEP82 2D 애니메이션을 다시 엽니다. 기존 미리보기·녹화에서 시간별 춤을 적용합니다.
5. 기존 STEP84는 최대 30초 **무음 WebM**을 출력합니다. 음악 믹싱 및 MP4 최종 출력(98단계)을 앞당겨 구현하지 않았습니다.

## 미검증 및 한계

- **실제 Windows 10/11 실기기의 EXE 실행·재시작·프로젝트 저장/복원 미검증.** Linux에서 Windows PE 교차 빌드를 수행한 결과만 검증했습니다.
- **실제 GPU/WebGL의 VRM/GLB/3D 무대 화면 픽셀 품질·관절 각도 자연스러움·WebM 실인코딩 품질 미검증.** 2D Canvas와 3D 본 포즈는 자동·모의 인터페이스로 동작 경로를 검사했습니다.
- 동작 합성은 **기초 규칙 기반 안무**입니다. 춤 AI 모델 학습/추론, 오디오 파형 비트 감지, 비디오에서 자동 3D 포즈 추출, 고급 역운동학(IK), 바닥 접촉 물리, 다중 배우 연기·악기 연주 연결은 **구현하지 않았습니다**.
- Motion Reference는 **동작 참고 영상을 사용자가 보며 수동 큐와 시간표에 반영**하는 수준입니다. 임의의 영상 모션을 그대로 재현했다고 주장하지 않습니다.
- STEP87까지의 기존 외부 모델/프로바이더 종단 실행 성공을 새로 검증한 것은 아닙니다.

**다음 순서: 89단계 — 직접 연기 및 악기 연주 연결.** 이번 실행에는 89단계 변경이 없습니다.
