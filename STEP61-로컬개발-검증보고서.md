# MYVOCAL Studio Step61 로컬 개발·검증 보고서

## 누적 소스 승계
- **Step60 전체 작업 디렉터리 → Step61로 복사 후 수정**했습니다.
- 이전 Step60 파일 347개 중 **삭제 0개**입니다. 기존 실행 파일·테스트·검증 로그·SHA 목록도 보존했습니다.
- 기존 사용자 PC의 프로젝트·음원·캐릭터·영상·브라우저 프로필에 접근하거나 이를 변경하지 않았습니다. 사용자 파일이 이 배포 ZIP에 포함된 것은 아닙니다.
- 프로젝트 및 IndexedDB 저장 키를 변경하지 않았습니다.

## Step61 구현
- `source/MYVOCAL-Studio-source/src/lib/characterIdentity.js`: 로컬 캐릭터 기준 시트의 입력 검증·기존 자료 승계·자료 역할 분류·사용 권한 설명 검사.
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`: 기존 등록 화면을 확장하여 캐릭터 외형 7개 항목, 이미지/동작 영상/3D 모델별 역할, 기존 캐릭터 편집, 허가 출처/범위 입력, 새 파일 추가를 제공.
- 자산 저장 실패 시 이전 자산을 유지하고 해당 작업에서 업로드된 파일 제거를 시도.
- `tests/character-identity.test.mjs`: 신규 37개 JavaScript 단위 테스트.
- `docs/STEP61-CHARACTER-REFERENCE-SHEET.md`: 사용 및 제한 사항.
- `examples/step61/demo-character-profile.json`: 실제 인물/원본 파일 없는 합성 예제.
- 단일 오프라인 HTML을 재생성하여 Go Desktop의 `index.html`과 일치시킴.

## 직접 실행한 검증
| 항목 | 결과 |
|---|---|
| 신규 JavaScript 테스트 | 37/37 통과 |
| 전체 JavaScript (`node --test --test-concurrency=1 tests/*.test.mjs`) | 804/804 통과 |
| Go (`go test ./...`) | 통과 |
| Go Race (`go test -race ./...`) | 통과 |
| Go Vet (`go vet ./...`) | 통과 |
| Python (`python3 -m unittest discover -s tools`) | 4/4 통과 |
| 오프라인 HTML 생성과 Go Desktop 내장 HTML 동일성 | 통과 |
| Windows x64 GUI 실행 파일 교차 빌드 | 성공, PE32+ x86-64 GUI |
| Windows x64 테스트 실행 파일 교차 빌드 | 성공, PE32+ x86-64 console; **미실행** |
| Step60 파일 보존 검사 | 347/347, 삭제 0개 |
| Windows 10/11 실기기 UI 실행, 데이터 마이그레이션 실사용 테스트 | **미검증** |

## 한계 및 남은 개발
- Step61의 **수동 캐릭터 기준 자료 등록·편집 기능**입니다. 자동 얼굴 분석, 이미지 생성, Identity Lock AI, 원본 VRM 모델 렌더링은 구현하지 않았습니다.
- 허가 내역은 사용자 기입이며 법적 진위 검증이 아닙니다.
- 확장자/MIME 입력 검사는 안전한 파일 내용을 보장하지 않습니다.
- 업로드에 실패하면 저장 완료된 새 파일의 롤백을 시도합니다. 브라우저의 디스크 공간 부족이나 앱 저장소 차단이 있으면 별도 복구가 필요할 수 있습니다.
- 소스 빌드 성공과 Windows 교차 빌드는 실기기에서 정상 실행·동작한다는 증거가 아닙니다.

## 로그와 파일
- `js-tests-sequential.log`, `go-tests.log`, `go-race.log`, `go-vet.log`, `python-tests.log`, `standalone-build.log`, `windows-build.log`, `windows-tests-build.log`.
- `MYVOCAL-Step61-Windows.exe`, `MYVOCAL-Step61-Windows-Tests.exe`, `SOURCE-SHA256-Step61.json`.
