# MYVOCAL Studio — Step68 로컬 누적 개발·검증 보고서

## 누적 기준
- 입력: `MYVOCAL-Studio-Step67-LocalOnly.zip` 실제 파일을 확인하고 동일 Step67 작업본을 복사하여 개발.
- 이전 Step67 ZIP 파일 경로 **406/406개 보존**, 삭제 **0개**.
- 이전 ZIP에 들어 있던 변경하지 않은 파일 **402개 CRC-32 원본과 일치** (이전 ZIP과 비교).
- 사용자 원본 미디어, IndexedDB, WebView2 프로필의 초기화·삭제 코드 추가하지 않음. 실제 Windows 기기에서의 보존 검증은 미실시.
- GitHub/클라우드/API 서버를 사용하지 않고 로컬에서 구현.

## Step68 구현
- `src/lib/characterVocalCues.js`: 캐릭터 개별 수동 보컬 큐 v1 JSON 백업/복원, 스키마 및 크기 검사, 목적 캐릭터 일치, 컷 연결 및 시간 검증, 큐 ID 중복 및 시간 충돌 검사, 오류 시 원본 무변경.
- `src/pages/Characters.jsx`: 캐릭터별 `보컬 큐 개별 백업`, `보컬 큐 JSON 복원` 버튼과 로컬 파일 선택, 오류 알림 연결.
- **Step67 전체 타임라인 JSON과 Step68 캐릭터별 복원 JSON은 다른 형식입니다.** 통합 타임라인을 복원 입력으로 받지 않음.
- `tests/character-vocal-pack.test.mjs`: 신규 **51개** 단위·보안·회귀 테스트.
- `docs/STEP68-VOCAL-CUE-BACKUP.md`, `examples/step68/`: 문서 및 합성 예제.
- 오프라인 HTML 재생성과 Windows 내장 HTML 동기화.

## 실제 검증
| 항목 | 결과 |
|---|---|
| 신규 JS 테스트 | **51/51 통과** |
| 전체 JS 순차 실행 `node --test --test-concurrency=1 tests/*.test.mjs` | **1113/1113 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` (`source`에서 실행) | **4/4 통과** |
| `node scripts/build-standalone.cjs` | 성공 (82개 소스 모듈) |
| 오프라인 HTML과 Windows 내장 HTML SHA-256 | 동일 |
| Windows x64 GUI EXE, 테스트 EXE 교차 빌드 | 성공 (PE32+ x86-64) |
| Windows 10/11 실기기 실행 | **미실시** |

## 범위 및 주의
- 메타데이터 백업과 복원입니다. 원본 WAV/MP3/영상/이미지 파일 자체는 JSON에 포함하지 않습니다.
- 보컬 큐의 사용자가 작성한 가사/메모는 JSON에 포함됩니다. 공유할 때 확인해야 합니다.
- 실제 AI 음성 학습, 오디오 생성, 자동 립싱크 및 MV 렌더링은 구현·검증되지 않았습니다.
- ZIP/SHA-256 검사 결과는 아래의 산출물 및 무결성 목록을 기준으로 합니다.

## 산출물
- `MYVOCAL-Step68-Windows.exe`, `MYVOCAL-Step68-Windows-Tests.exe`
- `SOURCE-SHA256-Step68.json`과 본 보고서
- 전체 누적 ZIP `MYVOCAL-Studio-Step68-LocalOnly.zip`

작성(UTC): 2026-10-13T03:55:26.221940+00:00
