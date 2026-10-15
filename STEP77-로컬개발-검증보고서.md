# MYVOCAL Studio — Step77 누적 개발 및 검증 보고서

검증 기준: 2026-10-14 · `MYVOCAL-Studio-Step76-LocalOnly.zip`의 **486개 원본 파일을 그대로 출발점으로 사용**.

## 계획에서 요구한 정확한 단계

**77단계: AI 장면 이미지 생성 — 스토리보드에 따라 배경과 캐릭터가 등장하는 장면 이미지를 만든다.**

- 76단계의 Performance/Story/Mixed 연출 및 캐릭터 등장 비율, 71~75단계의 수동 장면 편집/복원/애니매틱/컷 시트/컷북 **유지**.
- **78단계 AI 영상 클립 생성, 79단계 Image-to-MV, 80단계 Character-to-MV를 구현하거나 완료 처리하지 않음.**

## 구현: 실제 로컬 AI 엔진 연결

1. Windows 앱의 새로운 루프백 API `/api/images/health`, `/api/images/generate`를 추가함. 자신이 설치·구동한 **ComfyUI**(기본 `127.0.0.1:8188`)에만 접속; 허가되지 않은 원격 서버/클라우드 접속 없음. 실제 체크포인트 목록을 조회함.
2. ComfyUI의 기본 SD 계열 그래프(CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, SaveImage)를 POST `/prompt`로 전달. `/history/{id}`를 폴링해 실제 생성 출력 PNG/JPEG를 가져옴. 길이·용량·콘텐츠 유형·이미지 해상도 검증.
3. 장면 제목/설명/배경/의상/표정/행동/카메라/조명, 등록된 캐릭터 이름·설명·외형 **텍스트**, Step76 연출 역할을 생성 프롬프트에 결합. 생성 시 사용자 선택 체크포인트/스텝/시드/이미지 크기 사용.
4. 장면별로 AI 생성 이미지를 IndexedDB에 별도 파일로 저장하고, 프로젝트의 해당 장면에 `imageAssetId`와 출처/생성 키를 누적 저장. **기존 오디오, 미디어, 캐릭터 데이터 삭제·덮어쓰기 없음.** 장면·캐릭터·연출이 생성 중 바뀌면 완료 이미지를 자동 적용하지 않음.
5. 선택 장면, 장면 목록과 Step73 애니매틱에 실제 생성된 **정지 이미지** 표시. 이미지 개별 내보내기 지원. 기존 이미지와 현재 장면 설정이 다르면 재생성이 필요하다고 표시.
6. 기존 전체 프로젝트 `.myvocal.json` 백업의 이미지 Asset 포함 및 복원 시 새 Asset ID로 재매핑. Step71의 장면 계획 JSON은 여전히 원본 이미지를 포함하지 않음.
7. 웹 브라우저 단독 `file://` HTML에는 세션 보호 Go 브리지 없으므로 AI 생성 불가 메시지 처리. Windows EXE의 로컬 세션에만 연결 가능.

### 반드시 구분할 제한

- **실제 AI 추론 코드는 ComfyUI 별도 실행 및 지원 SD 체크포인트 설치가 있어야 작동함.** 이 ZIP/EXE에 모델 가중치나 ComfyUI 자체는 포함되지 않음.
- 본 환경에서는 **실제 ComfyUI GPU·모델을 구동하지 못해 모델 추론·품질은 미검증**. 아래의 HTTP 통합 테스트는 표준 API를 모방한 로컬 서버에 대한 검증이며 모델 추론이 성공했다는 뜻은 아님.
- 사진의 외형을 직접 조건화하는 ControlNet/IP-Adapter, 진정한 Character Identity Lock, AI 영상 생성, Lip Sync는 구현했다고 주장하지 않음.
- Windows 10/11 실기기에서 실행·GUI/저장·실제 GPU 이미지 생성은 미검증. `GOOS=windows` 빌드가 이 검증을 대체하지 않음.

## 호환·보존 검증

- Step76 압축 파일 내 **486개 파일 모두 보존, 삭제 0개**. 480개 바이트 동일, 기존 6개 파일을 Step77에 필요한 범위에서 수정, 새로운 파일 7개 추가(본 보고서와 매니페스트 제외).
- 수정 6개: `source/LOCAL-DEVELOPMENT.md`, `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`, `source/MYVOCAL-Studio-source/src/lib/projectBundle.js`, `source/MYVOCAL-Studio-source/src/pages/Video.jsx`, `source/desktop/index.html`, `source/desktop/main.go`.
- 66개 원본 기획안: `source/docs/MYVOCAL-66-ORIGINAL.md` SHA256 `8c061276b9cd6cf09a66541a1f335c8a5ab0aec0eba87f2b9f0a7cf3b7279a07`. 기존 보고서/모델/음원/과거 EXE 파일은 유지.
- `localStorage` 키, IndexedDB 데이터베이스/스토어, 데스크톱 고정 포트 및 전용 프로필 저장 위치 변경 없음. 신규 필드는 **있는 장면에만 선택적으로 추가**, 자동 마이그레이션 없음.

## 자동 테스트 결과

| 검증 항목 | 결과 |
|---|---|
| Step77 전용 JS 7개 | 7/7 통과 |
| 기존+신규 JS 전체 | **1,522/1,522 통과** |
| Go `go test -count=1 ./...` | 통과 |
| Go `go test -race -count=1 ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| 로컬 Python Singing Adapter | 4/4 통과 |
| 로컬 모의 ComfyUI HTTP 테스트 | 체크포인트 조회 → 생성 작업 접수 → 작업 완료 조회 → 정규 PNG 반환 통과 |
| ComfyUI 요청/권한/크기/체크포인트·경로 안전성 검사 | 테스트 통과 |
| 이미지 포함 프로젝트 백업 JSON 복원 | IndexedDB 신규 Asset ID 매핑·바이트 유지 테스트 통과 |
| HTML standalone/Go embedded HTML 동일 여부 | 바이트 일치 |
| Windows AMD64 GUI EXE 교차 빌드 | 성공 · PE32+ x86-64 |
| Windows PC 실기기 실행 및 실제 SD 모델 추론 | **미검증** |

## 설치 및 사용

`source/MYVOCAL-Studio-source/docs/STEP77-AI-SCENE-IMAGES.md` 참조. Windows EXE가 필요하며 사용자가 ComfyUI 서버와 SD 체크포인트를 PC에서 별도 준비한다. 먼저 백업한 프로젝트로 테스트하고 77단계 연결 상태를 확인한다.

**다음 순서는 78단계 — AI 영상 생성 엔진.** 사용자가 정한 100단계의 순서를 변경하지 않았으며 실제 동영상 생성을 구현했다고 표시하지 않았다.
