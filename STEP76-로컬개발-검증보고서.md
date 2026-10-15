# MYVOCAL Studio Step76 — 누적 로컬 개발·검증 보고서

## 원본 분석 및 보존
- 사용자가 제공한 Step75 ZIP 전체를 압축 해제한 뒤 기존 소스를 기준으로 개발함.
- 이전 파일 **473개 전부 보존**, 누락 **0개**. 바이트 동일 469개, 변경 4개.
- 기존 파일 변경 내역: `source/LOCAL-DEVELOPMENT.md`, `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html`, `source/MYVOCAL-Studio-source/src/pages/Video.jsx`, `source/desktop/index.html`.
- **원래의 66개 기획안** `source/docs/MYVOCAL-66-ORIGINAL.md` 및 기존 Step75 EXE 파일 원본 바이트 유지.
- 외부 저장 데이터/사용자 미디어/WebView2 프로필 삭제나 자동 마이그레이션 없음. 실제 사용자 PC는 접근하지 못하므로 사용자별 프로젝트 호환성은 실기기에서 별도 확인 필요.

## Step76 구현
- Performance MV / Story MV / Mixed MV (이전 Vocal Synth PV 선택 유지) + 5종 캐릭터 등장 강도를 실제 장면 계획 로직에 연결.
- 공연/스토리 장면 비율과 길이, 캐릭터 등장 **목표** 비율, 출연 캐릭터 미연결/장면 공백 경고.
- Mixed MV는 현재 로컬 **시간순 교차 배치**. 공연/스토리가 모두 없는 경우 경고.
- 선택 장면을 공연 중심 / 스토리 중심으로 개별 지정 및 자동 복귀, `mvDirectionOverrides`에 비파괴 저장.
- Step73 애니매틱 화면에 해당 장면 연출 계획 안내를 추가하고 Step76 큐시트 JSON 출력.
- Step71~75 장면 편집/복원/컷 시트/컷북 동작 유지, 외부 API·네트워크 요청 추가 없음.

## 테스트
| 구분 | 결과 |
|---|---|
| Step76 신규 JS | 47/47 통과 |
| 전체 JS 테스트 | 1,515/1,515 통과 |
| Go `go test ./...` / `go test -race ./...` / `go vet ./...` | 모두 통과 |
| Python 로컬 엔진 테스트 | 4/4 통과 |
| standalone HTML == Go desktop 임베디드 HTML | 바이트 일치 |
| Windows x64 GUI EXE 크로스 빌드 | 성공 (PE32+ x86-64) |
| Windows EXE 내부 Step76 UI 포함 | 문자열 확인 |
| Windows 10/11 실기기 앱 실행 / 사용자 데이터 로드 | **미검증** |
| 실제 AI 영상/이미지 생성·리얼타임 캐릭터 등장 | **미구현: 77~80 단계에서 다룰 사항** |

## 계획 순서 및 현재 판단
- 이전 `Step75` 산출물의 코드는 75단계까지 누적한 작업 기록을 담고 있음. 하지만 이것만으로 **원래 1~75번 요구사항 전부가 완성되었다고 볼 수 없음**. 기존 보고서에 이미 AI 가창/영상 실제 모델과 Windows 실기기 검증의 한계가 있음.
- 이번 76단계는 **선택·연출 계획·저장·검증** 범위로 완료. 실제 동영상 생성이 됐다고 주장하지 않음.
- 다음은 정해진 순서 **77단계: AI 장면 이미지 생성**. 78단계 영상 생성, 79단계 Image-to-MV, 80단계 Character-to-MV의 순서를 임의로 바꾸지 않음.
