# MYVOCAL Studio Step75 — 누적 로컬 개발·검증 보고서

## 기준 및 누적 개발
- 원본: `MYVOCAL-Studio-Step74-LocalOnly.zip`, 실제 ZIP 무결성 검사 통과.
- 기존 파일 466개 전부 보존, 누락 0개. 원본 CRC32와 일치한 파일 457개, 새 기능/빌드로 수정된 파일 9개.
- 기존 사용자 프로젝트·미디어·WebView2 프로필을 읽거나 삭제·초기화하는 코드를 추가하지 않았음.
- 외부 서버·클라우드 AI·GitHub 호출 없음.

## 신규 Step75 — 전체 컷북 일괄 HTML 출력
1. `src/lib/mvShotBook.js`: Step74 SVG 컷 시트를 최대 256장면/22페이지까지 한 오프라인 HTML 컷북으로 통합.
2. A4 인쇄용 CSS, 페이지 분리, 장면 제목·시간·카메라·인물 정보만 포함. 외부 스크립트·링크·미디어 없이 HTML 내부 SVG로 출력.
3. Video Studio의 `전체 컷북 HTML 저장 · Step75` 버튼에서 로컬 HTML 다운로드. 브라우저의 인쇄 기능을 통해 사용자가 인쇄하거나 PDF로 저장할 수 있으나 앱 자체 PDF 생성 기능은 아님.
4. 기존 Step74의 개별 페이지 SVG 저장 기능과 Step71~73 기능 보존.
5. `examples/step75/`에 13장면/2페이지 합성 HTML 예제 포함.

## 실행 검증
| 항목 | 결과 |
|---|---|
| 신규 JS 단위 테스트 | **37/37 통과** |
| JS 전체 순차 실행 (`node --test --test-concurrency=1 tests/*.test.mjs`) | **1,468/1,468 통과** |
| UI 독립 번들·신규 기능 재검증 | **38/38 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` (source 디렉터리) | **4/4 통과** |
| 오프라인 HTML 생성 및 desktop/index.html SHA-256 비교 | 성공, 완전 일치 |
| Windows x64 GUI EXE 교차 빌드 (windowsgui) | 성공, PE32+ GUI x86-64 |
| Windows x64 테스트 EXE 교차 빌드 | 성공, PE32+ x86-64 |
| 이전 Step74 ZIP 파일 보존 | **466/466** |
| Windows 10/11 실기기 검증 | **미실시** |

## 제한
- 출력 SVG는 수동 메타데이터 카드이며 실제 영상/AI 이미지/립싱크/렌더링이 아님.
- 인쇄물의 실제 프린터·PDF 저장 동작은 Windows 실기기에서 미검증.
- 브라우저 HTML 인쇄 시 글꼴·용지 설정에 따라 실제 줄바꿈/페이지 크기가 달라질 수 있음.
