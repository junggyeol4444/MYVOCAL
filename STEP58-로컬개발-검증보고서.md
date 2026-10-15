# MYVOCAL Studio Step58 로컬 개발·검증 보고서

## 개발 누적성
- **실제 Step57 누적 소스**: `/mnt/data/MYVOCAL-Step57-LocalOnly/source`의 전체 디렉터리를 `/mnt/data/MYVOCAL-Step58-LocalOnly/source`로 복제한 뒤 Step58을 구현했습니다. 이는 이전 Step57 완성 ZIP 안에 들어 있는 소스의 작업본입니다.
- Step57에 있던 소스 파일은 **삭제하지 않았습니다**. 이전 단계 실행 파일, 보고서, 로그 및 SOURCE-SHA256 파일도 누적 폴더에 보존했습니다.
- 이용자의 실제 로컬 프로젝트, IndexedDB, 브라우저 프로필, 미디어를 읽거나 삭제·마이그레이션하지 않았습니다. 해당 사용자 데이터는 산출물 ZIP에 포함되는 것이 아닙니다.

## Step58 신규 구현
- `src/lib/referenceArrangementGuide.js`: 검증된 Step57 Reference-only 보고서의 **32구간 신호 RMS 에너지**를 Step56 편곡의 **MIDI velocity에만** 반영하는 순수·결정적 함수.
  - 강도 0–100, 누락·비정상적인 보고서 거부, 기존 편곡과 원본 노트 불변 보존, 출력 note/track 불변, MIDI 범위 제한.
  - 음정, 박자, 시작 시간, 길이, 트랙 편성, 멜로디 및 화성은 Reference에 따라 바뀌지 않음.
  - 소스 원음, PCM, 코드, 멜로디 추출 또는 AI 학습을 수행하지 않음.
- `src/components/StyleArrangementPanel.jsx`: Learning Studio의 Music Learning 편곡 패널에 Reference 보고서 JSON 가져오기(100KiB 상한), 사용/미사용 선택, 반영 강도 슬라이더, MIDI 생성 및 표시 연결.
- `tests/reference-arrangement-guide.test.mjs`: 신규 자동화 테스트 25개. 권한 분리, 순수 함수·불변성·결정성, MIDI 출력, 위험 입력, 무음 보고서 등 검증.
- `docs/STEP58-REFERENCE-DYNAMICS.md`: 사용자/개발자 설명과 구현 한계.
- `examples/step58`: 합성 음악 프로필/합성 Reference 보고서, 원본 편곡 MIDI와 에너지 반영 MIDI (실제 저작물·사람 목소리 없음).
- `MYVOCAL-Studio-v1.8.html` 다시 생성하여 `source/desktop/index.html`과 바이트 단위 동기화.

## 검증 결과 (현 컨테이너에서 직접 실행)
| 항목 | 결과 |
|---|---|
| Step58 신규 JavaScript 테스트 | **25/25 통과** |
| 전체 JavaScript 테스트 (`node --test --test-concurrency=1 tests/*.test.mjs`) | **707/707 통과** |
| Go (`go test ./...`) | 통과 |
| Go Race (`go test -race ./...`) | 통과 |
| Go Vet (`go vet ./...`) | 통과 |
| Python CLI 테스트 (tools에서 `python3 -m unittest discover -v -p 'test*.py'`) | **4/4 통과** |
| 오프라인 HTML 생성 (`node scripts/build-standalone.cjs`) | 통과 |
| 임베디드 HTML 동기화 (`cmp` 비교) | 통과 |
| Windows x64 GUI EXE 교차 빌드 (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath`) | 성공 |
| Windows x64 테스트 EXE 교차 빌드 (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c`) | 성공 (실행 안 함) |
| 출력 파일 형식 (`file`) | Windows x86-64 PE32+ 확인 |
| 합성 예제 MIDI 반영 전후 비교 | 서로 다른 MIDI 생성 확인 |
| Windows 10/11 실기기 실행·브라우저/WebView2·오디오 실동작 | **미검증** |

## 명확한 한계
- 실제 음악의 코드 진행, 비트, 템포, 악기, 음정, 멜로디 분석·모사는 하지 않습니다. 본 기능은 **신호 에너지에서 유도한 velocity 편집**에 한정됩니다.
- 실제 모델 학습, AI 스타일 전이, 오디오 렌더링, 프로젝트 자동 임포트, 상용 배포 보증 또는 Windows 실기기 검증 결과가 아닙니다.
- Reference-only 보고서는 학습 대상으로 전환되지 않지만 이용자가 자료의 저작권을 실제로 소유하는지 확인할 수는 없습니다.
- 사용자가 열려 있는 Windows 앱의 내장 브라우저 데이터나 프로젝트를 산출물로 복사해 가져온 것은 아닙니다.

## 실행 로그 및 산출물
- `js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`
- `MYVOCAL-Step58-Windows.exe`, `MYVOCAL-Step58-Windows-Tests.exe`
- `SOURCE-SHA256-Step58.json` : Step58 누적 소스 및 실행 파일 해시
