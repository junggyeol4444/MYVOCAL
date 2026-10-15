# MYVOCAL Studio — Step79 누적 개발·검증 보고서

- 개발 범위: **79단계 Image-to-MV**. 기준 ZIP: `MYVOCAL-Studio-Step78-LocalOnly.zip`. 원래 66개 기획안 및 100단계 순서 변경 없음.
- Step80 Character-to-MV와 Step81~100은 **진행하지 않았습니다.**

## 실제 구현

1. 사용자가 등록한 `person` 유형의 프로필 중 `self` 또는 허가 출처가 기록된 `licensed`만 선택. Reference 전용 및 일반 일러스트 캐릭터는 이 기능에서 제외.
2. 등록한 PNG/JPEG 사진을 로컬 IndexedDB에서 직접 읽고, 세션 보호된 `/api/person-mv/generate` 브리지에서 ComfyUI `LoadImage → ImageScale → VAEEncode → KSampler` 의 실제 **img2img 사진 입력**으로 전달. 기존의 텍스트 프롬프트만 쓰는 방식이 아님.
3. 장면 설명·외형·연출 정보와 함께 인물 사진을 이미지로 변환하고 결과를 별도 이미지 Asset으로 저장. 사용자가 명시적으로 실행한 경우 기존 SVD `/api/video/generate`를 이어 호출해 WebP 짧은 영상 클립까지 별도 저장.
4. 선택 장면 / 기존 다른 캐릭터를 제외한 여러 장면 순차 제작. 사용자가 취소하면 진행 중인 요청 중단. 결과는 장면마다 순차 저장하며 원본 사진·기존 이미지·동영상·오디오를 삭제하지 않음.
5. 기존 백업·복원에서 `personMv` 참조 인물 ID, 원본 사진 Asset ID를 복원 후 새 ID로 재매핑. 사진 없이 생성한 Step77/78의 기존 이미지 출처 키 포맷 보존.
6. 기존 `mvStoryboard` 검사에서 Step77/78/79 생성 미디어 참조를 무해한 내부 메타데이터로 허용해 수동 스토리보드 편집과 생성 자산 연결의 충돌 방지.

## 검증 결과

| 구분 | 결과 |
|---|---|
| JavaScript 전체 테스트 | **1,534 / 1,534 통과** (`node --test --test-concurrency=4 tests/*.test.mjs`) |
| 신규 Step79 JavaScript 테스트 | **7 / 7 통과** (권한·실제 사진 선택·바인딩·레거시 키·저장·복원·프런트 요청) |
| Go `go test ./...` | 통과 |
| Go `go test -race -count=1 ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Go ComfyUI 모의 HTTP 서버 | 원본 사진 실제 PNG 바이트 업로드, 노드 조회, `img2img` 그래프, 작업 등록, 완료 확인, PNG 수신 확인 |
| Python `unittest discover` | **4 / 4 통과** |
| Windows x64 EXE | Windows GUI용 PE32+ 교차 빌드 성공 |
| 실제 Windows 10/11 실기기 실행·UI 클릭 | **미검증** |
| 실제 ComfyUI 체크포인트 GPU 생성·시각적 얼굴 동일성 | **미검증** |
| 실제 전체 곡 MP4 합성·Lip Sync | **미구현 — 해당 로드맵 후속 단계** |

## 이전 누적 파일 비교

- Step78 원본 **504개 모두 보존**, 바이트 완전 동일 **496개**, 기존 파일 수정 **8개**, 삭제 **0개**.
- 수정 파일: `source/LOCAL-DEVELOPMENT.md`, `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`, `source/MYVOCAL-Studio-source/src/lib/mvSceneImages.js`, `source/MYVOCAL-Studio-source/src/lib/mvStoryboard.js`, `source/MYVOCAL-Studio-source/src/lib/projectBundle.js`, `source/MYVOCAL-Studio-source/src/pages/Video.jsx`, `source/desktop/index.html`, `source/desktop/main.go`.
- 추가 파일: `source/desktop/person_mv.go`, `source/desktop/person_mv_test.go`, `source/MYVOCAL-Studio-source/src/lib/imageToMv.js`, `source/MYVOCAL-Studio-source/tests/image-to-mv.test.mjs`, `source/MYVOCAL-Studio-source/docs/STEP79-IMAGE-TO-MV.md`, `MYVOCAL-Step79-Windows.exe`, 이 보고서 및 파일 변경·무결성 목록.

## 미검증·제약

- ComfyUI/이미지 SD/영상 SVD 모델은 ZIP 또는 EXE에 포함되지 않음. 사용자가 PC에 직접 설치·실행해야 함.
- 일반 SD img2img는 인물 얼굴 유지 전용 모델이 아니며, 사진을 진짜 입력하더라도 얼굴·의상 정체성 일관성을 보장하지 않음.
- Step78과 같은 14/25프레임 6/8FPS의 짧은 WebP만 생성. **전체 MV 재생 길이 일치, 음악·음성 결합, 완성 MP4 내보내기, 자동 Lip Sync는 지원하지 않음.**
- 장면별 이미지와 영상 클립이 늘어나면 기존 프로젝트 백업 원본 합계 150MB 한도를 넘을 수 있음.
- 권한 검사는 사용자가 선언한 권한을 기준으로 함. 얼굴/계약 실물 검증 기능 아님.
- 100단계 전체 제품이 검증돼 완료된 것으로 판정하지 않음.

## 사용 방법

`source/MYVOCAL-Studio-source/docs/STEP79-IMAGE-TO-MV.md`에서 안내. 기존 모든 소스 및 실행 파일은 이번 ZIP에 그대로 누적 포함.
