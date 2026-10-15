# MYVOCAL Studio — Step67 로컬 누적 개발·검증 보고서

## 누적 기준과 기존 자산 보존
- **기준 입력:** `/mnt/data/MYVOCAL-Studio-Step66-LocalOnly.zip` (실제 ZIP을 해제하고 Step67 작업본으로 복사).
- Step66 ZIP에 있던 파일 경로 **396/396개 보존, 삭제 0개**. 이전의 Windows EXE·보고서·소스·테스트 및 예제를 유지.
- 사용자 로컬 프로젝트·음원·목소리·이미지·영상 및 IndexedDB/WebView2 브라우저 프로필을 삭제·초기화하는 로직은 추가하지 않았음. 다만 실제 사용자 기기의 데이터 보존은 실기기에서 검증하지 못함.
- GitHub, 클라우드 API, 서버 학습 호출 없이 로컬 개발만 수행.

## Step67 구현
- `src/lib/characterVocalCues.js` 신규: 수동 보컬 큐(리드, 화음, 애드리브, 대사) 등록/수정/삭제·시간 경계 검사·중복 차단·결손 컷 경고·다중 캐릭터 보컬 구간 병합·메타데이터 JSON 내보내기.
- 기존 캐릭터 객체의 `vocalCues` 배열에 로컬 보존. 기존 캐릭터·룩·컷 ID 및 원본 자료를 변경하지 않음.
- `src/pages/Characters.jsx`: Character Studio 보컬 큐 편집 모달, 개별 목록, 동시 출연 보컬 타임라인, 선택 캐릭터 필터, JSON 저장, 컷 범위 변동 경고.
- 캐릭터당 큐 최대 96개, 비교 캐릭터 최대 64명, 시간 0~3600초·정수 밀리초, 가사·메모 최대 길이 제한. 동일 캐릭터의 보컬 큐 중복 불허, 서로 다른 캐릭터 간 동시 보컬 허용.
- `tests/character-vocal-cues.test.mjs`: 신규 **50개** 테스트.
- `docs/STEP67-MANUAL-VOCAL-CUES.md`, `examples/step67/`: 사용법과 실제 사용자의 미디어가 아닌 합성 두 캐릭터 예제.
- 오프라인 HTML 재생성 및 Windows 내장 HTML 일치 확인.

## 실제 실행 검증
| 항목 | 결과 |
|---|---|
| 신규 JS 테스트 (`node --test tests/character-vocal-cues.test.mjs`) | **50/50 통과** |
| 전체 JS 순차 실행 (`node --test --test-concurrency=1 tests/*.test.mjs`) | **1,062/1,062 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s source/tools`(source 디렉터리에서 실행) | **4/4 통과** |
| `node scripts/build-standalone.cjs` | 성공, 총 82개 소스 모듈 |
| Windows 내장 HTML ↔ 오프라인 HTML SHA-256 | 동일 |
| Windows x64 GUI EXE `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` | **교차 빌드 성공, PE32+ x86-64 GUI** |
| Windows x64 테스트 EXE | **교차 빌드 성공, PE32+ x86-64 콘솔** |
| Step66 ZIP 원본 파일 경로 확인 | **396/396 보존, 삭제 0개** |
| Windows 10/11 실제 실행 | **미실시** |

> Python 첫 실행에서는 잘못된 테스트 검색 폴더를 지정하여 0개가 실행되었습니다. 이후 `source/tools`에서 올바른 위치로 재실행하여 4개 모두 통과했습니다.

## 남은 기능 / 한계
- **수동 보컬 출연 큐 메타데이터** 기능만 구현. 실제 음성 분석, 보컬 합성, 음악-캐릭터 자동 배정, 립싱크 프레임 생성, 2D/3D 애니메이션 및 MV 렌더링은 미구현.
- 보컬 JSON에는 사용자가 직접 입력한 가사/대사 메모가 포함되므로 공유 전 사용자가 확인해야 함. 원본 음성·이미지·영상 바이트는 포함하지 않음.
- Windows 10/11의 WebView2 브라우저·실제 음원 및 영상 작업·GPU 성능·장기간 프로젝트 보존은 미검증.

## 산출물
- `MYVOCAL-Step67-Windows.exe`, `MYVOCAL-Step67-Windows-Tests.exe`
- `SOURCE-SHA256-Step67.json`과 본 검증 보고서
- 전체 누적 ZIP: `MYVOCAL-Studio-Step67-LocalOnly.zip`
