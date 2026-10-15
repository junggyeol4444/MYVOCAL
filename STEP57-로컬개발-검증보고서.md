# MYVOCAL Studio Step57 로컬 개발·검증 보고서

## 소스 연속성
- 기준: `/mnt/data/MYVOCAL-Studio-Step56-LocalOnly.zip`에 포함된 `MYVOCAL-Step56-LocalOnly/source` 누적 소스와 같은 Step56 작업 폴더를 복제한 후 수정.
- Step56 기존 코드/디렉터리 및 구 버전 바이너리 유지; 이번 단계에 Reference 오디오 분석을 추가.
- 개발 과정에서 프로젝트 사용자 데이터나 미디어 파일을 삭제하지 않음. 실제 사용자의 기존 프로젝트 파일을 자동 마이그레이션한 것은 아님.

## 구현 내용
- `src/lib/referenceMusicAnalysis.js`: Reference-only 학습 권한 정책 검증, 피크/RMS/활성 시간 비율/시간 가중 32구간 RMS 에너지 리포트, 악의적/손상된 보고서 입력 거부, 두 보고서의 통계 차이 비교.
- `src/components/ReferenceMusicPanel.jsx`: Learning Studio Reference Analysis 섹션에 등록된 로컬 Reference 음원(IndexedDB) 또는 새 파일의 선택, 로컬 `decodeAudioData`, 시각화, JSON 보고서 내보내기 및 비교.
- `src/pages/Learning.jsx`: 컴포넌트 연결 및 등록 안내 정정.
- `tests/reference-music-analysis.test.mjs`: 신규 23개 테스트.
- `docs/STEP57-REFERENCE-ANALYSIS.md`: 사용법 및 미완성 범위.
- 오프라인 단일 HTML `MYVOCAL-Studio-v1.8.html` 재생성 및 `desktop/index.html` 동기화.

## 로컬 검증
| 검증 | 실행 결과 |
|---|---|
| Step57 신규 JavaScript 테스트 | 23/23 통과 |
| JavaScript 전체 순차 테스트 | **682/682 통과** (`node --test --test-concurrency=1 tests/*.test.mjs`) |
| Go 단위 테스트 | 통과 (`go test ./...`) |
| Go Race 검사 | 통과 (`go test -race ./...`) |
| Go 정적 검사 | 통과 (`go vet ./...`) |
| Python CLI 어댑터 테스트 | **4/4 통과** (`python3 -m unittest discover -v -p 'test*.py'` in `source/tools`) |
| Windows x64 GUI EXE 교차 컴파일 | 통과 (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0`) |
| Windows x64 테스트 EXE 교차 컴파일 | 통과 (실행하지 않음) |
| 단일 HTML 생성/임베디드 동기화 | 통과, byte-for-byte 일치 |
| Windows 10/11 실기기 GUI/코덱 재생·WebView2 | **미검증** |

## 검증 범위 / 주의
- Step57 기능은 오프라인 **신호 수준 참고 분석**임. BPM, key, chord, melody, genre, instrument, DAW 자동 편집, AI 학습·추론 또는 음악 생성 모델이 아님.
- Reference-only 자료는 새 보고서가 `trainingAllowed: false`이고 스타일/모델 학습 권한에서 거부된다. 실제 자료의 외부 권리 보유 여부를 확인하는 시스템은 없음.
- 브라우저의 지원 오디오 코덱 여부에 따라 파일 디코딩 가능 여부가 달라짐. 실제 PC 성능·지원 코덱 검증은 없음.
- WAV/MP3 등 브라우저 지원 디코더에 의존. 분석 피처는 통계치이며 음악의 유사성·저작권 판단 근거가 아님.
- 파일 입력 상한: 30MiB, 디코딩 5분 또는 인터리브 PCM 1,200만 샘플.
- 외부 AI 서비스, GitHub, 네트워크 호출 없이 로컬 개발 및 검증.

## 검증 아티팩트
- `MYVOCAL-Step57-Windows.exe` (Windows x64 GUI 빌드)
- `MYVOCAL-Step57-Windows-Tests.exe` (Windows x64 테스트 바이너리 빌드; Windows 실행 안 함)
- `js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`.
- `SOURCE-SHA256-Step57.json` (Step57 누적 소스와 EXE SHA256)
