# MYVOCAL Studio Step74 — 누적 로컬 개발·검증 보고서

## 기준 및 누적성
- 기준: `MYVOCAL-Studio-Step73-LocalOnly.zip`에 포함된 Step73 전체 소스·실행 파일·문서.
- 이전 ZIP 파일 456개 중 누락 **0개**. 기존 파일 중 변경 3개: `src/pages/Video.jsx`, 오프라인 단일 HTML, Windows 내장 HTML.
- 변경되지 않은 453개는 Step73 ZIP의 CRC32와 일치. 새 모듈·테스트·예제·Step74 실행 파일·문서 추가.
- 기존 사용자 프로젝트, 음악·영상·이미지 파일, 캐릭터 자료, 브라우저/WebView2 프로필에 접근하거나 이를 초기화하지 않음.
- GitHub, 클라우드 AI, 원격 서버 호출 없음.

## 구현한 Step74 기능
1. `src/lib/mvShotSheet.js`: Step73 장면 타임라인을 수동 컷 시트 **SVG**로 출력.
2. 최대 12컷/페이지, 페이지 수·샷 번호·시작/종료 타임코드·제목·캐릭터·카메라·동작 포함.
3. Video Studio에 페이지 이동, SVG 화면 미리보기, 현재 페이지 SVG 다운로드 연결.
4. 장면 시간·ID·캐릭터 링크 검증 재사용, 외부 링크/스크립트 없는 SVG와 XML 특수문자 인코딩.
5. 실사용자 미디어·가사·바이너리·AI 생성 이미지를 SVG에 포함하지 않음.
6. `examples/step74/`에 테스트 전용 합성 13컷/2페이지 SVG 예제 추가.

## 실행한 검증
| 항목 | 결과 |
|---|---|
| 신규 JS 테스트 `node --test tests/mv-shot-sheet.test.mjs` | **47/47 통과** |
| 전체 JS `node --test --test-concurrency=1 tests/*.test.mjs` | **1,431/1,431 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` | **4/4 통과** |
| 로컬 단일 HTML 빌드 및 desktop/index.html 동일 내용 | 성공 |
| `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build` | 성공, PE32+ x86-64 GUI EXE |
| `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c` | 성공, PE32+ x86-64 테스트 EXE |
| Step73 ZIP 원본 파일 보존 | **456/456개** |
| Windows 10/11 실제 PC 테스트 | **미실시** |

## 제한과 남은 과제
- SVG는 **수동 스토리보드 정보 카드**이지 실제 렌더링 영상·AI 이미지·립싱크 결과가 아님.
- 내보내기는 현재 페이지만 저장하며, 전체 스토리보드를 저장하려면 각 페이지를 따로 내보내야 함.
- SVG는 벡터 정적 계획표이며 사용자 원본 이미지 파일을 포함하지 않음.
- Windows 실기기에서 UI/WebView2/외부 브라우저 실행은 검증하지 않음.
