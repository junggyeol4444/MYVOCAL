# MYVOCAL Studio — STEP87 개발·검증 보고서

- 실행 기준일: 2026-10-15 (Asia/Seoul)
- 사용자가 제공한 66개 원본 기획안, 사용자가 작성한 상세 100단계 로드맵, Step86 누적 소스 ZIP 및 Step86 검증보고서를 실제 확인했습니다.
- **이번 구현 단계: 87. AI 표정 연출 — 가사 감정, 보컬 Dynamics, 음악 에너지에 맞춰 표정을 변경한다.**
- **88단계(AI Dance Director) 이후는 구현하지 않았습니다.** Step86을 기준으로 전체 누적 수정했습니다.
- 로컬 전용: GitHub, 원격 컴퓨터, 클라우드 AI, 외부 서버 호출·결제 없음.

## 구현 내용

1. STEP85의 기존 가사·음소 및 발음 시간표를 입력으로 받아 가사별 표정 구간을 초기 생성합니다. 간단한 한국어·영어 감정 단어 규칙으로 `happy`(기쁨), `sad`(슬픔), `angry`(분노), `surprised`(놀람), `relaxed`(평온), `neutral`(기본)을 추천합니다. **학습된 AI 감정 인식 모델은 아닙니다.**
2. 사용자 편집 화면 `STEP87 · AI 표정 연출`을 Character Studio에 추가했습니다. `시작초, 종료초, 감정(auto/수동), Dynamics(0~1), 음악 에너지(0~1)` 형식으로 각 구간의 강약·에너지·감정을 검토/수정하고 타임라인에서 표정 강도를 확인합니다. 실제 노래 파일의 강약·에너지를 자동 분석하는 기능은 추가하지 않았습니다.
3. 저장한 표정 계획을 STEP82 2D Canvas 미리보기·WebM 녹화에 연결했습니다. 기존 이미지 레이어의 눈 주변 곡선으로 감정 표현을 보조하며, STEP85 음소가 활성화된 동안 87단계 입 모양 덮어쓰기를 막아 **Lip Sync가 입을 우선 제어**하도록 했습니다. 단일 이미지의 실제 얼굴 리깅이나 사실적인 표정 생성이 아닙니다.
4. STEP83 3D 모델 미리보기 및 STEP84 3D 공연 미리보기·무음 WebM 녹화 경로에 시간별 표정을 연결했습니다. VRM에 표정 morph binding이 있는 경우에만 해당 모프가 렌더링에 반영되며, 기존 STEP85 입 모프 경로는 유지합니다. 호환되는 표정 모프가 없으면 표정 외형이 바뀌지 않을 수 있습니다.
5. 캐릭터에 **새 `expression87` 필드**를 별도 저장하고, 기존 `lipSync`, `personLipSync`, `animation2d`, `layerPlan`, `rig3d`, `stage3d`, 원본 자산·설정은 수정·삭제하지 않습니다. 프로젝트 백업·복원 시 새 필드는 기존 캐릭터 프로필에 그대로 포함되고, 복원된 캐릭터 ID와 무관하게 STEP85 원본 타이밍의 서명으로 유효성을 확인합니다. 사용자가 STEP85 가사를 변경하면 기존 표정 계획을 삭제하지 않고 안전하게 비활성화하여 재검토를 요청합니다.
6. 87단계 타임라인의 최대 2,000구간/최대 1시간, 겹친 구간, 형식 오류, 잘못된 감정·숫자·값 범위, 권한 없는 자료 또는 허가 설명 누락을 거부합니다. 빈/손상/오래된 계획은 기존 표정 및 애니메이션 기능을 막지 않도록 처리합니다.

## 실제 실행 결과

| 검사 항목 | 결과 |
|---|---|
| STEP87 신규 자동 테스트 | **10/10 통과** (감정 규칙·시간 보정·입모양 우선·2D Canvas·3D WebGL 모프·프로젝트 복원·권한·오류 거부 등) |
| JavaScript 전체 `node --test tests/*.test.mjs` | **1,618/1,618 통과** |
| Go `go test ./...` | **통과** |
| Go `go test -race -count=1 ./...` | **통과** |
| Go `go vet ./...` | **통과** |
| Python (올바른 디렉터리에서) `python3 -m unittest -v test_cli_adapter` | **4/4 통과** |
| 단일 HTML `node scripts/build-standalone.cjs` | **성공, 누적 111개 소스 모듈** |
| Windows x64 GUI 교차 빌드 | **성공, PE32+ x86-64 GUI**, STEP87 코드 내장 확인 |
| STEP86 원본 ZIP 압축 검사 | **통과** |
| 원본 584개 파일 SHA-256 보존 대조 | **584개 모두 존재; 576개 동일; 8개 의도적으로 변경** |
| STEP87 전체 누적 ZIP | **ZIP CRC + 각 엔트리 SHA-256 검사 수행** |

### 기존 파일 8개 변경

- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`
- `source/MYVOCAL-Studio-source/src/lib/characterAnimation2d.js`
- `source/MYVOCAL-Studio-source/src/lib/character3dRenderer.js`
- `source/MYVOCAL-Studio-source/src/components/CharacterAnimationEditor.jsx`
- `source/MYVOCAL-Studio-source/src/components/Character3dEditor.jsx`
- `source/MYVOCAL-Studio-source/src/components/CharacterStage3dEditor.jsx`
- `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html` (누적 빌드)
- `source/desktop/index.html` (Windows 내장 누적 빌드)

### 추가된 소스·테스트 3개

- `source/MYVOCAL-Studio-source/src/lib/characterExpressionDirector.js`
- `source/MYVOCAL-Studio-source/src/components/CharacterExpressionEditor.jsx`
- `source/MYVOCAL-Studio-source/tests/character-expression-director.test.mjs`

## 사용 방법

1. Character Studio에서 **권한이 있는 2D 또는 3D 캐릭터**를 등록하고 STEP85 Lip Sync의 가사·음소·발음 시간을 저장합니다.
2. 같은 캐릭터에서 **STEP87 · AI 표정 연출**을 누릅니다. 가사 시간대별 구간과 `auto` 감정 값이 기본으로 표시됩니다.
3. 감정 태그와 보컬 Dynamics·음악 에너지 값(각각 0~1)을 검토·수정하고 시간 슬라이더에서 표정과 강도를 확인합니다.
4. **표정 연출 저장**을 누릅니다. 이후 STEP82 2D 애니메이션 또는 STEP83 3D 캐릭터/STEP84 3D 무대 미리보기와 기존 영상 녹화 경로에서 새 표정 계획을 적용합니다.
5. STEP85 가사를 변경한 경우 STEP87을 열어 **현재 가사 기준 타임라인 재생성** 후 검토·다시 저장합니다. 이전 표정 계획은 다시 저장하기 전까지 별도 필드에 남아 있습니다.

## 미검증 사항 및 한계

- **실제 Windows 10/11 컴퓨터의 EXE 실행·재시작·저장/복원 동작은 이번 환경에서 검증하지 못했습니다.** Linux에서 빌드한 Windows x64 PE 실행 파일임을 확인한 것입니다.
- **실제 GPU/WebGL 장치의 VRM 표정 픽셀 품질, 실사/실물 표정 품질, 브라우저 WebM 코덱 출력 화질·오디오 품질은 미검증입니다.** Canvas/WebGL 등 자동 테스트는 모의 인터페이스 호출과 모프 정점 데이터 경로 검증입니다.
- 음악 에너지·보컬 강약은 이 단계에서 사용자가 직접 입력한 값입니다. 학습된 AI 감정 분류기, 노래 파일의 실제 다이내믹스 자동 추출, 사실적인 표정 합성·눈동자 제어·입술 근육 리깅은 구현하지 않았습니다. 따라서 이름이 `AI 표정 연출`이어도 학습 모델 기반 자동 표정 연출의 완전한 품질을 보장하지 않습니다.
- 이전 1~86단계의 모든 외부 AI 모델의 실제 사용 가능 여부를 새로 검증한 것은 아닙니다. 구 버전에서 알려진 실기기/엔진 의존성 및 STEP86 사람 Lip Sync의 자연스러움 미검증은 유지됩니다.
- 88단계 Dance Director나 98단계 MP4 통합 출력은 앞당겨 구현하지 않았습니다.

**다음 단계: 88. AI Dance Director — 비트·장르·구간을 분석해 춤 동작을 만들고 Motion Reference를 적용한다.**
