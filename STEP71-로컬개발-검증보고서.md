# MYVOCAL Studio Step71 — 누적 로컬 개발·검증 보고서

## 기준·변경 및 보존
- 기준: `MYVOCAL-Studio-Step70-LocalOnly.zip` 누적 소스.
- Step70 ZIP의 기존 파일 430개 중 누락 0개 (바이트 동일 422개, 변경 8개: 화면·빌드/테스트 로그).
- 원본 사용자 프로젝트 및 미디어를 삭제·초기화하는 로직 추가 없음.
- 외부 서버, GitHub, 클라우드 AI 호출 없음.

## Step71 구현: MV Storyboard Preflight
- `src/lib/mvStoryboard.js` 오프라인 검증·내보내기·BPM 박자/4분의 4박자 마디 맞춤.
- 장면 중복 ID, 음수·0길이·NaN·Infinity·밀리초 초과 정밀도, 7200초 초과, 시간 겹침·공백, 자료 필드 변조, 캐릭터 ID 누락 검사.
- `src/pages/Video.jsx`에 Step71 검사 패널 및 JSON·CSV 내보내기, 선택 장면 BPM 박자/마디 맞춤 버튼 연결.
- 내보내기 파일은 수동 편집 **메타데이터만** 포함 (비디오/오디오 렌더 또는 EDL 영상 소스 결합 아님).
- CSV는 UTF-8 BOM·CRLF, 수식 삽입을 막기 위한 텍스트 이스케이프 처리.
- `tests/mv-storyboard.test.mjs` 신규 테스트 53개, 합성 JSON/CSV 예제 포함.

## 실제 검증
| 항목 | 결과 |
|---|---|
| Step71 신규 JS 단위 테스트 | **53/53 통과** |
| JS 전체 (`node --test --test-concurrency=1 tests/*.test.mjs`) | **1,267/1,267 통과** |
| Go (`go test ./...`) | 통과 |
| Go Race (`go test -race ./...`) | 통과 |
| Go Vet (`go vet ./...`) | 통과 |
| Python (`python3 -m unittest discover -s tools`, `source` 경로) | **4/4 통과** |
| 오프라인 HTML 생성·Windows 내장 HTML SHA-256 일치 | 성공 |
| Windows x64 GUI EXE 및 테스트 EXE 교차 빌드 | 성공 (PE32+ x86-64) |
| Step70 ZIP 원본 파일 누락 | **0/430** |
| Windows 10/11 실기기 실행 | **미검증** |

## 한계·향후 작업
- 규칙 기반 스토리보드 검증·수동 편집용 내보내기만 수행하며, 장면 영상/배경 생성, 렌더링, 자동 립싱크 기능은 없습니다.
- 4/4 마디 맞춤은 프로젝트 BPM을 기준으로 합니다. 실제 박자표 분석이나 오디오 박자 검출은 아닙니다.
- 사용자 Windows 컴퓨터에서 직접 실행·장기 저장 검증은 수행하지 않았습니다.

기록 UTC: 2026-10-13T04:18:46.073826+00:00
