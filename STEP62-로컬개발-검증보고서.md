# MYVOCAL Studio Step62 로컬 개발·검증 보고서

## 누적 코드와 사용자 데이터 보존
- 실제 **Step61 작업 디렉터리 → Step62** 복사 후 새 기능을 추가하고 수정했습니다.
- Step61 보유 파일 **356개 모두 Step62에 존재**, 삭제 **0개**. 기존 Step61 EXE·로그·검증 자료 포함.
- 사용자 PC의 프로젝트·음악·음성·동영상·WebView2 프로필에 접근하지 않았고 저장소 초기화 로직도 추가하지 않았습니다.
- 기존 캐릭터 ID, 자산 ID, `localStorage`·IndexedDB 키를 변경하지 않았습니다. `looks`는 기존 캐릭터 프로필에 더해지는 선택 필드입니다.

## Step62 구현 사항
- `src/lib/characterLooks.js`: 룩 프리셋 추가/제거, 형식 검증, ID·이름 중복 검사, 최대 24개 제한, 이미지·3D 참고 자산 소속 검사.
- `src/pages/Characters.jsx`: 기존 Character Studio에 룩 등록 모달(의상·표정·포즈·장면·장신구·메모), 참고 자산 선택, 목록·제거·기준 재승인·JSON 저장 UI 추가.
- 머리/눈/체형/대표 색상을 수동 메타데이터 스냅샷으로 비교해 `재검토 필요` 표시. 재승인으로 새 스냅샷을 기록; 원본 파일 누락은 재승인 후에도 경고 유지.
- 룩 JSON 내보내기는 원본 이미지·영상·3D 파일 바이트를 포함하지 않으며 사용자 작성 메타데이터만 포함.
- 신규 42개 JavaScript 단위 테스트와 Step61 프로필 편집 경로·화면 연결 검증.
- 오프라인 단일 HTML을 재생성하고 Windows Go 내장 HTML과 바이트 단위 동기화.

## 실제 실행한 검사
| 항목 | 결과 |
|---|---|
| Step62 신규 JavaScript 테스트 | **42/42 통과** |
| 전체 JavaScript `node --test --test-concurrency=1 tests/*.test.mjs` | **846/846 통과** |
| Go `go test ./...` | 통과 |
| Go `go test -race ./...` | 통과 |
| Go `go vet ./...` | 통과 |
| Python `python3 -m unittest discover -s tools` | **4/4 통과** |
| 오프라인 HTML 생성 및 내장 HTML 동일성 | 통과 |
| GOOS=windows GOARCH=amd64 CGO_ENABLED=0 GUI EXE 교차 빌드 | 성공, PE32+ x86-64 GUI |
| Windows x64 테스트 EXE 교차 빌드 | 성공, PE32+ x86-64 console, 미실행 |
| Step61 파일 보존 | **356/356, 삭제 0개** |
| Windows 10/11 실기기 테스트 | **미실시** |

## 한계
- 이 단계는 텍스트 필드 기준의 **수동 캐릭터 외형 일관성 검토**이며 자동 얼굴 검출, 생성형 캐릭터 제작, 비디오 프레임 검사 또는 AI Identity Lock은 아님.
- 기존 권한 표시는 사용자가 작성한 권한 정보이며 별도 법적 진위를 보증하지 않음.
- 데이터 내보내기 JSON은 첨부 파일 백업이 아니며 JSON 가져오기 UI도 구현하지 않음.
- Windows 교차 빌드와 자동 테스트는 실제 Windows PC에서 GUI·사용자 파일 저장이 작동한다는 증거가 아님.

## 검증 로그와 결과물
`js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`, `SOURCE-SHA256-Step62.json`, `MYVOCAL-Step62-Windows.exe`, `MYVOCAL-Step62-Windows-Tests.exe`.
