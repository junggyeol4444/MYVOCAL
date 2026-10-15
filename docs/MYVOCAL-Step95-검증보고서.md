# MYVOCAL Studio — STEP93·94·95 누적 개발·검증 보고서

작성 기준: 2026-10-15 (Asia/Seoul)

## 기준 파일 및 작업 순서

- 기준 소스: 이 MYVOCAL Studio 대화에서 제공된 `MYVOCAL-Studio-Step92-LocalOnly.zip`을 ZIP 표준 라이브러리로 열어 원본 606개 항목 전부 CRC 검사, 별도 작업 디렉터리에 전체 압축 해제.
- 직전 검증: `MYVOCAL-Step92-검증보고서.md`를 실제 열람하고 90~92단계 구현 범위를 확인.
- 원본 설계: Step92 ZIP에 포함된 `docs/MYVOCAL-원본66개-기획안.md` 및 사용자 메시지에 직접 제공된 100단계 상세 개발 순서.
- 변경 순서: **93 AI 영상 자연어 수정 → 94 Character Replace → 95 Vocal Synth PV 고급 제작**. 96~100단계는 이번 실행에서 진행하지 않음.
- 외부 GitHub·원격 서버·사용자 PC·결제 서비스 사용 없음. 기존 소스·설정·자산·EXE·기획 문서를 삭제하지 않음.

## 93단계 — AI 영상 자연어 수정

- `src/lib/mvNaturalEdit93.js`: 한국어 장면 수정 지시를 안전한 속성 수정으로 변환, 적용 전 미리보기 스냅샷 고정, 수정 적용/되돌리기 이력(최대 20회).
- 배경/장소·의상/옷·카메라·표정/감정·동작/행동·조명의 속성 중 한 항목을 한 장면에서 수정합니다. 입력 예: `배경을 비 오는 밤거리로 바꿔`.
- 미지원·모호한 명령은 거부합니다. 설정에서 잠긴 배경/의상/카메라는 임의 변경하지 않습니다. 장면 시간·기존 원본 이미지·영상 파일은 수정하지 않습니다.
- `src/pages/Video.jsx`에 미리 검토/적용/되돌리기 UI 추가. `videoEdits93` 이력 저장 및 프로젝트 백업·복원 후 새 장면 ID로 이력 연결.
- **제한:** 학습된 자연어 AI 모델이 아닌 로컬 문법 파서입니다. 자유 대화·복합 지시·영상 픽셀 편집은 지원하지 않습니다. 지시 적용 뒤 필요한 이미지 재생성은 기존 Step77/79/80/92의 로컬 엔진을 별도로 사용해야 합니다.

## 94단계 — Character Replace

- `src/lib/characterReplace94.js`: 현재 선택 장면 또는 모든 장면의 출연 캐릭터 ID를 사용자 승인 후 교체. 등록된 권한 확인(본인/소유/허가 메모)을 요구하고 Identity Lock 상태에서 교체 거부.
- 원래 장면 길이·카메라·장소·동작 등 스토리보드는 보존. 기존 캐릭터 종속 이미지/영상/Step92 재생성 이력을 `characterReplace94.history`에 보존하고 새 캐릭터에 해당 미디어가 잘못 표시되지 않도록 기존 표시 연결을 분리.
- 장면별 되돌리기로 이전 캐릭터와 기존 이미지·영상 연결 복구. 최대 8회 이력. 전체 프로젝트 백업/복원에서 이력 속 이전 캐릭터와 미디어 자산 ID를 함께 재연결하도록 `projectBundle.js` 확장.
- **제한:** 캐릭터 교체는 안전한 프로젝트 연결 변경입니다. 교체된 캐릭터를 기존 영상에 자동 합성·재생성하거나 동일한 움직임·얼굴 품질을 입증하지 않습니다. 기존 로컬 모델로 새 장면을 다시 생성해야 합니다.

## 95단계 — Vocal Synth PV 고급 제작

- `src/lib/vocalSynthPv95.js`, `src/components/Pv95Editor.jsx`: 기존 MV 스토리보드 장면과 정렬된 보컬 가사 시간표를 로컬 Canvas PV 렌더러에 연결.
- 스타일: 2D Illustration, Anime, 3D Stage, Lyric, Motion Graphic, Cyber, Rock. 효과: none, pulse, shake, zoom, scanlines. 가사 위치·강도·24/30fps 선택, 768×432 미리보기·타임라인 탐색.
- 원본 등록된 장면 이미지를 IndexedDB에서 읽어 효과와 가사를 그리며, 정렬된 가사가 없거나 오래된 정렬인 경우 실제 가사 타임스탬프를 만들어내지 않습니다. 정렬 데이터 없을 때는 장면 제목을 화면에 표시합니다.
- `pv95` 프로젝트 설정 저장 및 편집용 JSON 계획 내보내기. 최대 30초를 브라우저의 Canvas.captureStream·MediaRecorder로 **무음 WebM** 내보내기(지원 브라우저에 한함). 중간 취소·오류 시 완성 파일을 저장하지 않습니다.
- **제한:** '3D Stage'는 Canvas 색상/효과 프리셋이며 실제 3D 공연 영상을 고급 합성하는 렌더러가 아닙니다. 실제 MP4·가창 음원 합성·종합 AI 비디오 렌더링은 98단계로 남겨 둡니다. 실기기 영상 파일의 시각 품질 및 시간 정밀도는 검증하지 못했습니다.

## 검증 결과 (실행 기록)

| 항목 | 결과 |
|---|---|
| 93~95 신규 테스트 | **10/10 통과** (93 3, 94 3, 95 4) |
| JavaScript 전체 | **1,660/1,660 통과** (`node --test --test-concurrency=2 tests/*.test.mjs`) |
| Go 일반 테스트 | **통과** (`go test ./...`) |
| Go Race 테스트 | **통과** (`go test -race -count=1 ./...`) |
| Go Vet | **통과** (`go vet ./...`) |
| Python | **4/4 통과** (`python -m unittest -v test_cli_adapter`) |
| 단일 HTML 빌드 | **성공** (`node scripts/build-standalone.cjs`, 124개 모듈) |
| 단일 HTML과 desktop 내장 HTML | SHA-256 일치 |
| Windows x64 GUI EXE | **교차 빌드 성공**, `PE32+ executable ... GUI, x86-64`, 93·94·95코드 포함 |
| Step92 원본 파일 | **606개 전부 보존**, 이 중 602개 바이트 동일, 기존 소스·HTML 4개 의도적 변경 |
| 새 기능 소스/테스트 | 7개 추가 (소스 4, 테스트 3) |
| 최종 누적 ZIP | 압축 CRC, ZIP 내 파일 대 작업본 SHA-256, UTF-8 한글 경로 전부 검사 (하단 별도 확인) |

**테스트 해석:** 자동 테스트는 로컬 JS 계산·편집·저장·복원 및 API 코드 경로 확인입니다. 실제 Windows 10/11 PC 실행/종료/복원, 실제 GPU 렌더링, MediaRecorder가 출력한 WebM 재생·화질, 원본 영상 AI 자연어 편집·AI 재생성 품질은 미검증입니다. Windows 교차 빌드를 실기기 동작 검증으로 표시하지 않습니다. 학습 모델 연결이 필요한 과거 단계의 최종 AI 품질도 검증됐다는 뜻은 아닙니다.

## 소스 보존/배포

- 수정된 기존 파일 4개: `source/MYVOCAL-Studio-source/src/pages/Video.jsx`, `src/lib/projectBundle.js`, `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`, `source/desktop/index.html`.
- 신규 추가 7개: `src/lib/mvNaturalEdit93.js`, `src/lib/characterReplace94.js`, `src/lib/vocalSynthPv95.js`, `src/components/Pv95Editor.jsx`, `tests/mv-natural-edit-93.test.mjs`, `tests/character-replace-94.test.mjs`, `tests/vocal-synth-pv-95.test.mjs`.
- 기존 Step92 ZIP의 Python `.pyc` 캐시 3개는 테스트에서 자동 변경되어 ZIP 원본과 바이트가 동일하도록 복구한 뒤 재포장함.
- 배포: `MYVOCAL-Studio-Step95-LocalOnly.zip` 전체 소스 (이전 EXE·원본 문서·자산 포함), `MYVOCAL-Step95-Windows.exe` 별도 파일, 이 검증보고서.
- 다음 미착수 단계는 **96단계 AI Creative Director**. 사용자 로드맵의 96→97→98→99→100 순서를 유지함.

### Windows EXE SHA-256

`5a1fb410a7cb33acbe3978c73dac692100945a28f0550a4fd4f535b135b6215b`
