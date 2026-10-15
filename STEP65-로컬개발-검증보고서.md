# MYVOCAL Studio — Step65 누적 로컬 개발 및 검증 보고서

## 누적 방식 및 기존 파일 보존
- 기준: Step64 전체 소스/실행 파일 디렉터리 `/mnt/data/MYVOCAL-Step64-LocalOnly`를 복사해 Step65 누적 작업본으로 확장했습니다.
- Step64 기존 파일 경로 **378/378개 보존**, 삭제 **0개**. 기존 파일 중 내용 수정 12개 (소스, 테스트, 오프라인 내장 HTML 등), 나머지는 그대로 보존했습니다.
- 기존 프로젝트/캐릭터/룩/음악/보컬/영상/IndexedDB 및 브라우저(WebView2) 프로필은 자동 삭제·마이그레이션하지 않습니다.
- GitHub 등 원격 서비스 접근이나 클라우드 AI 업로드를 수행하지 않았습니다.

## Step65 실제 구현
- `source/MYVOCAL-Studio-source/src/lib/characterShots.js`: 내보낸 수동 MV 컷 JSON을 동일 캐릭터에 **추가 방식**으로 복원. 유효성 검사(UTF-8 512 KiB, 포맷, 버전, 캐릭터 ID, 룩 ID, 컷 ID/제목/시간 중복·충돌, 입력값, 외부 페이로드 금지)와 **원자적 실패** 구현. 기존 컷, 기존 자산, 캐릭터 외형은 덮어쓰지 않습니다.
- 같은 컷을 다시 가져오면 중복으로 거부됩니다. 자동 합치기/덮어쓰기 기능은 없습니다.
- `getCharacterShotTimeline()`은 컷 상대 배치와 빈 구간 및 외형 재검토 상태를 원본 데이터 변경 없이 계산합니다.
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`: 컷 JSON 가져오기 및 배치 타임라인 UI 연결. `src/style.css`에 시각 표시 추가.
- `tests/character-shot-restore.test.mjs`: 신규 단위 테스트 42개 추가. 기존 컷 화면 문자열 검사는 STEP65로 갱신했습니다.
- `examples/step65/`: 합성 컷 계획 JSON 2개 컷 및 복원 검증 결과. 실제 사용자 파일이 아닙니다.
- `docs/STEP65-CHARACTER-SHOT-RESTORE.md`: 한계 및 복원 방법 기록.

## 수행한 자동 검증 결과
| 검사 | 실제 결과 |
|---|---|
| Step65 신규 테스트 (`character-shot-restore.test.mjs`) | **42/42 통과** |
| 컷 신규/기존 합산 테스트 | **88/88 통과** |
| 전체 JavaScript `node --test --test-concurrency=1 tests/*.test.mjs` | **972/972 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` | **4/4 통과** |
| 오프라인 HTML 생성 및 desktop/index.html 동일성 | 성공 |
| Windows x64 GUI EXE 교차 빌드 (GOOS=windows, GOARCH=amd64, CGO_ENABLED=0) | 성공, PE32+ x86-64 GUI |
| Windows x64 테스트 EXE 교차 빌드 | 성공, PE32+ x86-64 console |
| Step64 경로 보존 | **378/378개** |
| Windows 10/11 실기기 GUI/오디오 실행 | **미검증** |

## 한계
- 수동 MV 컷 타임라인 메타데이터 관리만 구현했습니다. 실제 캐릭터 영상 생성, 프레임 렌더링, 3D 씬 합성, 얼굴 인식, 자동 Identity Lock 및 립싱크는 제공하지 않습니다.
- Windows EXE는 Linux 환경에서 **교차 빌드**했으며 Windows 10/11 실기기의 WebView2/브라우저 오디오 동작은 직접 확인하지 못했습니다.
- 내부 자동화 단위/통합 테스트 통과가 전체 제품 요구사항 완성이나 실제 미디어 품질을 의미하지 않습니다.

## 로그
`new-tests.log`, `js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`.
