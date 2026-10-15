# MYVOCAL Studio — Step66 로컬 누적 개발·검증 보고서

## 누적 개발 방식
- **기준:** 실제 `/mnt/data/MYVOCAL-Step65-LocalOnly` 디렉터리를 복사해 Step66 누적 작업본을 구성했습니다. 1단계에서 다시 시작하지 않았습니다.
- Step65 기존 파일 경로 **387/387개 보존**, 삭제 **0개**. 이전 실행 파일·검증 기록·소스·데이터 구조 유지.
- 기존 프로젝트/캐릭터/룩/컷/오디오/영상 라이브러리와 WebView2/브라우저 프로필을 초기화하거나 변환하지 않습니다.
- 클라우드 API, GitHub, 원격 서비스 호출 없이 로컬 코드만 수정했습니다.

## Step66 신규 구현
- `source/MYVOCAL-Studio-source/src/lib/characterCast.js`: 여러 캐릭터의 기존 컷을 읽기 전용으로 결합한 구간별 캐스팅 타임라인 생성, 동시 출연 및 빈 구간 집계, 룩 기준 변화/자료 누락 경고, JSON 내보내기.
- **캐릭터 간 시간 중복은 허용**, 동일 캐릭터 내부의 잘못된 시간 중복은 거부. 정수 밀리초 시간 경계, 중복 ID·잘못된 컷·64명/48컷 제한 검사.
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`: 캐릭터 포함/제외 체크박스, 동시 출연 및 경고, 캐스팅 JSON 다운로드. 표시 성능을 위해 타임라인 구간 80개까지 화면에 표시하되 JSON은 전체를 내보냄.
- `src/style.css` UI 스타일, 오프라인 단일 HTML 및 Windows 내장 HTML 동기화.
- `tests/character-cast.test.mjs`: 신규 테스트 **40개**.
- `docs/STEP66-MULTI-CHARACTER-CAST.md`, `examples/step66/`: 사용법과 실제 사용자 자료가 아닌 합성 2인 캐스팅 예제.

## 실제 수행한 검증
| 검증 | 결과 |
|---|---|
| Step66 신규 JavaScript `node --test tests/character-cast.test.mjs` | **40/40 통과** |
| JavaScript 전체 `node --test --test-concurrency=1 tests/*.test.mjs` | **1,012/1,012 통과** |
| Go `go test ./...` | 성공 |
| Go `go test -race ./...` | 성공 |
| Go `go vet ./...` | 성공 |
| Python `python3 -m unittest discover -s tools` | **4/4 통과** |
| `node scripts/build-standalone.cjs` | 성공; 81개 모듈 |
| 오프라인 HTML과 desktop/index.html 비교 | 동일 |
| Windows x64 GUI EXE 교차 빌드 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` | 성공; PE32+ x86-64 GUI |
| Windows x64 테스트 EXE 교차 빌드 | 성공; PE32+ x86-64 console |
| Step65 파일 경로 보존 | **387/387개, 삭제 0개** |
| ZIP 무결성/SHA-256 | 생성 후 검사 |
| Windows 10/11 실기기 테스트 | **미실시** |

## 범위와 한계
- 캐릭터 출연 계획 **메타데이터**를 시간축에 병합한 기능입니다. 듀엣 감지는 두 캐릭터가 같은 시간대 등장하는지 확인하는 기능이며 음성·보컬·립싱크를 자동 배정하지 않습니다.
- 영상 프레임, 애니메이션, AI 캐릭터 생성, 얼굴 인식, 신원 일치 모델, 음원 생성·믹싱을 구현하거나 테스트했다고 주장하지 않습니다.
- 교차 빌드 성공만으로 Windows 10/11의 WebView2 동작이나 실제 음악/영상 출력 품질이 검증된 것은 아닙니다.

## 산출물
- `MYVOCAL-Step66-Windows.exe`, `MYVOCAL-Step66-Windows-Tests.exe`
- `SOURCE-SHA256-Step66.json`, 이 보고서, 신규 테스트 및 전체 테스트 로그
- 전체 누적 ZIP `MYVOCAL-Studio-Step66-LocalOnly.zip`
