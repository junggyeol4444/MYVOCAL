# MYVOCAL Studio — Step78 누적 개발 및 검증 보고서

기준 날짜: 2026-10-14. **Step77 누적 ZIP(원본 495파일)**을 작업 출발점으로 사용.

## 계획의 정확한 구현 단계

**78단계: AI 영상 생성 엔진 — 영상 생성 Provider를 연결해 장면별 영상 클립을 만든다.**

- Step77의 장면 이미지 생성/스토리보드, Step76의 연출 모드, 이전 음악·음성·캐릭터·Learning 기능과 프로젝트 라이브러리/백업 보존.
- **79단계 Image-to-MV, 80단계 Character-to-MV, 81~100단계 기능을 조기 구현하거나 완료로 주장하지 않음.**

## 실제 구현

1. Windows EXE의 기존 로컬 Go 서버에서 **`GET /api/video/health`**, **`POST /api/video/generate`** 구현. 단일 사용자 기존 세션 헤더 검증, 임의 외부 URL 차단, localhost `127.0.0.1` ComfyUI 포트만 사용.
2. ComfyUI의 **ImageOnlyCheckpointLoader** SVD 계열 모델 목록과 필수 기본 노드 7종 조회. 없는 모델/노드, 잘못된 포트에 오류 표시.
3. 선택 장면 Step77 PNG/JPEG 입력 → ComfyUI `/upload/image` → SVD image-to-video workflow `/prompt` → `/history/{id}` 폴링 → `/view`에서 실제 애니메이션 WebP 클립 수신. 14/25프레임, 6/8fps, 스텝, Motion Bucket, 시드 설정.
4. 파일 크기/입력 실제 PNG·JPEG 검증, 경로 순회 제한, 모델 선택 확인, 결과 WebP RIFF/ANIM/프레임 수 검사. 최대 입력 12MiB, 최종 클립 40MiB.
5. 생성 클립을 기존 IndexedDB Asset DB에 별도 저장; 장면의 `videoClipAssetId`/`videoGeneration`이 생성 출처/모델/프레임/fps/seed를 관리. 기존 이미지, 음원, 트랙, 캐릭터 자료를 삭제하거나 자동 덮어쓰지 않음.
6. 선택 장면 영상 미리보기(움직이는 WebP), `.webp` 개별 내보내기, 이미지·장면·연출 변경에 따른 기존 영상 오래됨 표시. 생성 중 프로젝트·장면 변화 시 새 결과 자동 적용 방지.
7. **기존 `.myvocal.json` 전체 프로젝트 백업/복원에 새 영상 파일까지 포함**. 이미지와 영상 파일은 서로 독립된 새 Asset ID로 복원.
8. 사용 방법: `source/MYVOCAL-Studio-source/docs/STEP78-AI-SCENE-VIDEO.md`.

## 범위 제한(중요)

- **ComfyUI, SVD/SVD-XT 체크포인트, GPU는 패키지에 포함되지 않음.** 실제 모델에서 움직이는 영상을 생성하려면 사용자가 PC에 이를 설치해야 함.
- 이 개발 환경에는 **실제 SVD 영상 체크포인트/GPU 모델 구동 환경이 없어 실제 AI 모델 추론·시각적 품질은 미검증**. 로컬 HTTP 모의 서버는 정상 API 처리만 검증한다.
- 지원 결과는 **움직이는 애니메이션 WebP 영상**. FFmpeg MP4 자동 변환 실험은 실패했으므로 사용자 화면에 MP4 변환을 제공하지 않음. 최종 MP4 출력/음악 결합은 98단계 요구 사항이며 이 단계에서 완료하지 않음.
- SVD 클립은 14/6≈2.33초 또는 25/8=3.125초 등 짧은 길이. 곡 구간과 길이 자동 일치, 장면 간 전환/전체 MV 편집, Lip Sync, 다중 캐릭터 영상 생성, Identity Lock의 실제 고정은 지원한다고 주장하지 않음.
- **Windows 10/11 실기기 실행·GUI 클릭·실제 GPU 추론은 미검증**. `GOOS=windows` 빌드 성공은 실기기 실행 검증이 아님.
- Vite 개발 번들(`npm run build`)은 이 컨테이너에 npm 패키지가 미설치되어 실행하지 못함. 기존 설치형 실행 프로그램에 사용되는 **standalone HTML 빌더(시스템 TypeScript)**로 갱신했으며, HTML 원본과 Go 임베딩 HTML 바이트 동일.

## 검사 결과

| 검사 | 결과 |
|---|---|
| 신규 Step78 JS 테스트 | **5/5 통과** |
| 전체 JS 테스트 | **1,527/1,527 통과** |
| Go `go test -count=1 ./...` | 통과 |
| Go `go test -race -count=1 ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| 기존 Python singing adapter | **4/4 통과** |
| 모의 로컬 ComfyUI → animated WebP | 노드 조회, PNG 업로드, 작업 등록, 완료 조회, 14프레임 WebP 반환 확인 |
| 원본 및 새 파일 테스트 | 손상 WebP/위험 포트/체크포인트/입력/세션 거절 통과 |
| 영상 포함 백업/복원 | 이미지와 영상의 별도 ID, 원본 미디어 바이트 유지 테스트 통과 |
| Windows x64 EXE 교차 빌드 | **성공**, PE32+ x86-64 GUI |
| HTML 단일 파일/Go 내장 파일 | SHA-256 일치 |
| 원본 Step77 보존 | **495개 전부 유지**, 바이트 동일 **489개**, 기존 수정 **6개**, 삭제 **0개** |
| 원본 66개 기획안 | 수정 없음 · SHA256 `8c061276b9cd6cf09a66541a1f335c8a5ab0aec0eba87f2b9f0a7cf3b7279a07` |

## 기존 파일 변경 목록

- `source/LOCAL-DEVELOPMENT.md`
- `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`
- `source/MYVOCAL-Studio-source/src/lib/projectBundle.js`
- `source/MYVOCAL-Studio-source/src/pages/Video.jsx`
- `source/desktop/index.html`
- `source/desktop/main.go`

## 새 파일

- `MYVOCAL-Step78-Windows.exe`
- `source/MYVOCAL-Studio-source/docs/STEP78-AI-SCENE-VIDEO.md`
- `source/MYVOCAL-Studio-source/src/lib/mvSceneVideos.js`
- `source/MYVOCAL-Studio-source/tests/mv-scene-videos.test.mjs`
- `source/desktop/testdata/step78-synthetic-14.webp`
- `source/desktop/video_generation.go`
- `source/desktop/video_generation_test.go`


**다음 계획 순서: 79단계 — Image-to-MV (허가받은 사람 사진을 바탕으로 뮤직비디오 주인공 생성).** 실행하지 않았으며 78단계만 누적 구현.
