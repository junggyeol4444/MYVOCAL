# MYVOCAL Studio Step59 로컬 개발·검증 보고서

## 누적 개발 및 데이터 보존
- Step58 실제 누적 소스 디렉터리 전체를 Step59로 복사했습니다.
- Step58 소스 파일 **288개 중 삭제 파일 0개**, 수정 파일 3개, 추가 파일 7개입니다.
- 사용자 PC의 음악, 프로젝트, 영상, WebView2 프로필, IndexedDB에 접근하거나 이를 삭제/변환하지 않았습니다. 로컬 사용자 데이터 자체를 결과 ZIP에 넣은 것은 아닙니다.
- 이전 단계 실행 파일·개발 보고서·검증 로그·SHA-256 목록을 누적 폴더에 보존했습니다.

## Step59 신규 기능
- `src/lib/referenceDensityGuide.js`: Step57 Reference-only 보고서의 32구간 에너지를 이용하여 기존 Step56/58 편곡 내 **보조 반주 음표만** 결정적으로 생략합니다.
- melody는 절대 변경하지 않으며 드럼 킥(36)·스네어(38), 마디 첫 베이스와 마디 첫 코드 음을 보존합니다.
- 베이스·코드·드럼 파트 및 반영 강도(정수 0–100)를 검증하고, 0%·무음·균일 에너지에서는 음표를 생략하지 않습니다.
- 입력 편곡과 원본 노트 불변, 모든 출력 동결, 이력 메타데이터에 학습 금지·원음 미포함을 명시합니다.
- `src/components/StyleArrangementPanel.jsx`: Step58 Reference 다이내믹스 기능을 유지하면서 Step59 체크박스, 강도 슬라이더, 생략 음표 수를 추가했습니다.
- `tests/reference-density-guide.test.mjs`: 신규 테스트 28개.
- `docs/STEP59-REFERENCE-DENSITY.md`: 구현 설명과 한계.
- `examples/step59`: 합성 Reference 보고서 JSON, 원본 MIDI, 생략 후 MIDI, 생략 통계 JSON.
- 정적 오프라인 HTML 갱신 후 `desktop/index.html`과 바이트 동일성 확인.

## 직접 실행한 검증
| 항목 | 실제 결과 |
|---|---|
| Step59 신규 JavaScript 테스트 | 28/28 통과 |
| 전체 JavaScript 테스트 (`node --test --test-concurrency=1 tests/*.test.mjs`) | 735/735 통과 |
| Go (`go test ./...`) | 통과 |
| Go Race (`go test -race ./...`) | 통과 |
| Go Vet (`go vet ./...`) | 통과 |
| Python CLI 테스트 | 4/4 통과 |
| 오프라인 HTML 빌드 및 데스크톱 내장 파일 비교 | 통과 |
| Windows x64 GUI 실행 파일 교차 빌드 | 성공 (PE32+ x86-64) |
| Windows x64 테스트 EXE 교차 빌드 | 성공 (실행하지 않음) |
| Step58 소스 파일 유지 검사 | 삭제 0개 |
| 합성 Reference/편곡 예시 | 베이스 12음, 코드 12음, 드럼 32음 생략 (총 56음) |
| Windows 10/11 실제 실행·오디오 출력 | **미검증** |

## 범위 제한
- AI 모델 학습, 스타일 전이, BPM·Key·Chord·Melody 인식, 원곡 MIDI 전사, 오디오 렌더링을 하지 않습니다.
- Reference 권한의 진위 여부 자체를 확인하는 DRM 기술은 아닙니다.
- 실제 사용자 음원 기반 테스트나 Windows 실기기 동작 보증이 아닙니다.
- 사용자 프로젝트 파일을 직접 수정하거나 업로드하지 않습니다.

## 실행 로그
- `js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`
- `MYVOCAL-Step59-Windows.exe`, `MYVOCAL-Step59-Windows-Tests.exe`, `SOURCE-SHA256-Step59.json`
