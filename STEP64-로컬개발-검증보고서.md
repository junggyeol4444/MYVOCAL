# MYVOCAL Studio — Step64 로컬 누적 개발·검증 보고서

## 누적 개발 및 기존 데이터 보호
- 기준: `/mnt/data/MYVOCAL-Step63-LocalOnly` 전체 디렉터리를 `/mnt/data/MYVOCAL-Step64-LocalOnly`로 복사한 뒤 수정했습니다.
- 기존 Step63 파일 **372/372개 경로 보존**, 삭제 **0개**. 단, 변경된 UI/HTML/테스트 로그 등의 파일 내용은 Step64 소스로 갱신됐습니다.
- 기존 프로젝트 및 로컬 저장소 키·기존 캐릭터/룩·오디오·영상·WebView2 프로필에 대한 자동 삭제 또는 데이터 마이그레이션 없음.
- GitHub 및 원격 서비스 접근 없음. 사용자 로컬 원본 미접근.

## Step64 실제 구현
- `source/MYVOCAL-Studio-source/src/lib/characterShots.js`:
  - 한 캐릭터당 최대 **48개**의 수동 MV 컷 계획 추가, 수정, 삭제.
  - 컷 제목, 룩 ID, 시작·종료 시간(0~3600초, 밀리초 단위), 카메라 구도, 연출 메모 저장.
  - 같은 캐릭터 내 컷 시간 중복, 중복 ID/이름, 누락된 룩, 비정상 시간, 허용되지 않은 속성 차단.
  - 연결된 룩 삭제/참고 자료 누락/외형 기준 변경을 **재검토 필요**로 표시. AI 얼굴 인식 기능 아님.
  - JSON 메타데이터 내보내기. 원본 이미지·오디오·동영상은 포함하지 않음.
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`: 캐릭터 카드에 컷 목록, 편집 모달, 삭제 확인, JSON 내보내기 UI 연결.
- `source/MYVOCAL-Studio-source/tests/character-shots.test.mjs`: 신규 테스트 **46개** 추가.
- 오프라인 단일 HTML 재생성 후 Windows Go 내장 HTML과 바이트 비교 확인.

## 최종 검증 결과
| 항목 | 결과 |
|---|---|
| Step64 신규 JavaScript 테스트 | **46/46 통과** |
| 전체 JavaScript 테스트 `node --test --test-concurrency=1 tests/*.test.mjs` | **930/930 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` (source 디렉터리) | **4/4 통과** |
| Windows GUI 교차 빌드 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` | 성공, PE32+ x86-64 GUI |
| Windows 테스트 교차 빌드 | 성공, PE32+ x86-64 console |
| Step63 파일 경로 존재 여부 | **372/372, 삭제 0개** |
| Windows 10/11 실기기 실행 | **미검증** |

처음 Python 테스트를 `source/MYVOCAL-Studio-source` 디렉터리에서 탐색하여 0개가 실행되는 오류가 있었으며, `source` 디렉터리에서 재실행해 **4/4 통과**한 결과를 최종값으로 기록합니다.

## 현재 한계 및 다음 단계
- 사용자가 작성한 룩 및 컷의 구조·시간 충돌 검사만 지원합니다. AI 영상 생성, 실제 씬 렌더링, 음원 BPM/타임라인에 자동 싱크, 자동 Identity Lock 및 얼굴 일관성 검증은 지원하지 않습니다.
- 컷 계획 JSON은 메타데이터를 내보내는 것이며 **가져오기·전체 프로젝트 백업**은 아직 지원하지 않습니다.
- Windows x64 **교차 빌드**는 성공했지만 Windows 10/11 실기기에서 WebView2·화면·오디오 작동은 검증하지 않았습니다.

## 검증 로그
`js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`, `SOURCE-SHA256-Step64.json`.
