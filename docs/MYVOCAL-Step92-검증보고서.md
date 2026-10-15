# MYVOCAL Studio — STEP90·91·92 누적 개발·검증 보고서

작성일: 2026-10-15 (Asia/Seoul)

## 기준과 개발 순서

- **기준 입력:** 이 MYVOCAL 대화에서 생성된 `MYVOCAL-Studio-Step89-LocalOnly.zip`(실제 압축 CRC 검사·전체 압축 해제 완료) 및 `MYVOCAL-Step89-검증보고서.md`(실제 열람).
- **기획 기준:** ZIP 내부 `docs/MYVOCAL-원본66개-기획안.md` 및 사용자가 이 대화에 제공한 정확한 100단계 로드맵.
- **이번 적용 단계:** 90. 다중 캐릭터·가상 밴드 → 91. MV Style Learning → 92. Identity-Safe Regeneration. **93단계 이후는 구현하지 않았습니다.**
- **제한:** 로컬 전용. 사용자 컴퓨터 접속·설치, 원격 GitHub, 외부 서버·클라우드 생성 AI, 결제는 진행하지 않음.

## STEP90 — 다중 캐릭터·가상 밴드

- `src/lib/virtualBand90.js`: 음악 프로젝트 단위 `band90` 공연 계획(최대 6명, 2~30초, 24/30FPS), 멤버별 가수·하모니·Guitar/Bass/Drums/Piano/Strings/Synth 역할과 등장 시작·종료 시간, 동시 출연 프레임 계산. 본인/허가 자료 여부와 중복 멤버·시간을 검증합니다.
- `src/components/VirtualBand90Editor.jsx`: 기존 등록된 **2D 레이어 이미지, 실제 3D VRM/GLB WebGL 렌더러, 권한 있는 사람의 로컬 영상 프레임**을 함께 Canvas 화면에 배치합니다. 2D는 기존 82/85/87/88/89단계 기능을, 3D는 기존 83/84/85/87/88/89단계 렌더러를 호출합니다. 멤버별 타임라인 탐색·재생, 계획 JSON, **무음 WebM** 녹화 버튼을 제공합니다.
- Music Video Studio의 90단계 패널에서 편집하며 설정은 기존 프로젝트에 별도 `band90` 필드로 저장합니다. 백업·복원 후 멤버 ID를 새 캐릭터 ID로 연결합니다.
- **구현 한계:** 악기 MIDI 오디오 믹싱·가창 음원 내보내기·MP4는 포함하지 않습니다(98단계). 3D 모프/본은 원본 모델 지원에 의존합니다. 비디오 시킹을 통한 실제 사람의 합성 프레임 정밀도와 전체 WebM 품질은 실기기에서 미검증입니다. 전신 정확한 모션캡처·실제 연주 손가락 물리 구현도 아닙니다.

## STEP91 — MV Style Learning

- `src/lib/mvStyleLearning91.js`: 권한 있는 MV의 16개 화면 구역·평균 RGB·밝기·대비를 로컬 계산하고 프레임별 차이에서 컷 위치와 평균 컷 간격을 추정해 `mvStyle91` 분석 프로필을 구성합니다.
- `src/components/MvStyle91Editor.jsx`: Learning Studio의 MV Style Learning에 등록한 MP4/WebM(40MB 이하, 최대 5분)을 브라우저 로컬 비디오 디코더로 탐색해 최대 240프레임만 분석합니다. 임계값·프로필 이름·수동 스타일 메모, JSON 추출과 기존 Learning 자료에 대한 프로필 저장을 지원합니다.
- 자료 원본 `assetId`는 그대로 유지하며 `owned/self/licensed` 권한 검사(licensed는 사용 허가 메모 요구)를 적용합니다. Reference 전용 자료를 학습 프로필로 승격하지 않습니다.
- **구현 한계:** 이 작업은 규칙 기반 영상 특징 분석이며, AI 모델 파인튜닝이나 의미론적 카메라 움직임·타이포그래피·조명 디자인 인식이 아닙니다. 프레임 차이가 실제 편집 컷과 다를 수 있습니다. 등록 자료 외부 업로드 없음.

## STEP92 — Identity-Safe Regeneration

- `src/lib/identityRegeneration92.js`: STEP79 사람 사진 또는 STEP80 2D 캐릭터 **기존 등록 원본이 연결된 씬**만 대상으로 권한 검증합니다. 기존 씬의 정체성 필드 잠금은 필수, 사용자 설정의 의상·장소·카메라 잠금도 검사합니다. 일부 비잠금 문장만 수정할 수 있습니다.
- 로컬 이미지 생성기의 **원본 사진/그림 기반 img2img** 경로를 연결하고, 완료 시 씬·원본·잠금·캐릭터 권한이 작업 시작과 동일한지 다시 확인합니다. 기존 이미지 자산을 삭제·덮어쓰지 않으며 새 이미지 ID로 저장합니다. 기존 이미지·영상 연결을 이전 이력(최대 8세트)으로 남기고 '이전 이미지 복원'을 제공합니다.
- 프로젝트 전체 백업·복원 시 이전 이미지/영상 자산도 포함하고 새 자산 ID로 바꿉니다. 기존 Lip Sync·3D 무대·89단계 연기 정보는 변경하지 않습니다.
- **구현 한계:** 데이터 및 장면 설정의 Identity Lock과 참조 이미지 입력을 강제하지만, 생성 이미지 픽셀의 얼굴·배경·의상 일치 품질까지 **보장하지 않습니다**. 생성은 별도로 설치된 **로컬 ComfyUI/호환 체크포인트가 있어야** 작동합니다. 모델 추론 실제 실행·실사 시각 품질은 이 환경에서 검증하지 않았습니다. 기존 영상 클립을 직접 재생성하는 기능은 구현하지 않았습니다.

## 실제 검증

| 검증 | 결과 |
|---|---|
| 신규 STEP90~92 테스트 | **13/13 통과** (STEP90 4, STEP91 4, STEP92 5; 마지막 테스트에 STEP90·92 백업/복원 동시 검증 포함) |
| JavaScript 전체 테스트 | **1,650/1,650 통과** (`node --test --test-concurrency=2 tests/*.test.mjs`) |
| Go | `go test ./...` **통과** |
| Go Race | `go test -race -count=1 ./...` **통과** |
| Go Vet | `go vet ./...` **통과** |
| Python | `python -m unittest -v test_cli_adapter` **4/4 통과** |
| 독립 HTML 빌드 | `node scripts/build-standalone.cjs` **성공**, 누적 120모듈 |
| 내장 HTML | 독립 HTML과 `source/desktop/index.html` **SHA-256 일치** |
| Windows x64 실행 파일 | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-H=windowsgui'` **성공**, PE32+ x86-64 Windows GUI 및 신규 90~92 코드 내장 확인 |
| Step89 원본 ZIP 검사 | 전체 ZIP CRC 통과, **기존 597개 파일 모두 보존** |
| 파일별 SHA-256 원본 대조 | **기존 592개 바이트 동일**, 기존 소스·HTML **5개만 의도적 수정** (Python 테스트가 수정한 `.pyc` 3개는 원본 바이트로 복원) |
| 최종 누적 ZIP | **606개 파일**(Step89 원본 597개 + 신규 소스 5개 + 신규 테스트 3개 + 보고서 1개) 전체 CRC·SHA-256 및 UTF-8 한글 경로 검사 **통과** |

### 변경·추가 파일

- 수정(5): `source/MYVOCAL-Studio-source/src/pages/Video.jsx`, `src/pages/Learning.jsx`, `src/lib/projectBundle.js`, `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`, `source/desktop/index.html`.
- 신규 소스(5): `src/lib/virtualBand90.js`, `src/lib/mvStyleLearning91.js`, `src/lib/identityRegeneration92.js`, `src/components/VirtualBand90Editor.jsx`, `src/components/MvStyle91Editor.jsx`.
- 신규 테스트(3): `tests/virtual-band-90.test.mjs`, `tests/mv-style-91.test.mjs`, `tests/identity-regeneration-92.test.mjs`.
- 기존 STEP89 문서·기획·자산·코드·설정·테스트를 삭제하지 않았습니다.

## 현재 미검증 항목

- **실제 Windows 10/11 PC에서 최신 EXE 실행·종료·재실행 및 프로젝트 내보내기/복원 미검증**입니다. Windows x64 교차 빌드는 Windows에서 실제 구동한 테스트가 아닙니다.
- 실제 **GPU/WebGL 캐릭터 두 명 이상 렌더 성능, 사람 영상 프레임 동기화, MediaRecorder WebM 결과**, 실제 등록 비디오로 STEP91 분석하는 브라우저 시각 품질 미검증입니다. 자동 테스트는 계산·코드 연결·백업과 모의 검증을 의미합니다.
- **실제 로컬 ComfyUI 체크포인트로 STEP92 이미지 생성 성공과 identity consistency 미검증**입니다. 반드시 사용권한 자료와 환경에서 수동 검사해야 합니다.
- 과거 1~89단계의 외부 모델 설치가 필요한 모든 기능을 실제 제품 종단에서 새로 검증했다는 의미는 아닙니다.

## 배포 및 후속 순서

- 전체 누적 소스: `MYVOCAL-Studio-Step92-LocalOnly.zip`. EXE는 중복 용량을 줄이기 위해 ZIP 밖의 `MYVOCAL-Step92-Windows.exe`로 별도 제공하며 이전 단계 배포 파일은 소스 ZIP 안에서 유지합니다.
- 검증보고서: `MYVOCAL-Step92-검증보고서.md`.
- **다음 로드맵 순서: 93단계 — AI 영상 자연어 수정.** 이 실행에서는 작업하지 않았습니다.

### Windows EXE SHA-256

`485e6404495ab7ccd03cb92179a59daacc963586a283a54deb91b625f4c25018`
