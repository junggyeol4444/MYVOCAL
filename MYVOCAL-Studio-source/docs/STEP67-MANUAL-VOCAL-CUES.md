# Step67 — 캐릭터 수동 보컬 큐 시트

## 구현 내용
- Character Studio → 캐릭터별 컷 계획에서 **보컬 큐 추가** 클릭.
- 연결할 MV 컷 선택 후 시작·종료 시간(초, 밀리초 단위), 리드/화음/애드리브/대사 역할, 가사·연출 메모 입력.
- 각 캐릭터별 기존 컷 범위 안에서만 큐 작성 가능. 같은 캐릭터의 큐는 시간 중복 불가. **캐릭터 간 동시 보컬은 허용**.
- 여러 캐릭터의 선택 필터는 Step66 캐스팅 보드와 공유. 동시 보컬·컷 연결 누락/시간 변경 경고를 표시.
- 화면 상단 **보컬 큐 JSON 저장**으로 수동 큐 타임라인(가사 메모 포함)을 내보냄. 원본 이미지·음원·영상 바이트는 내보내지 않음.

## 데이터 보존과 이전 버전
- 기존 캐릭터 데이터에 `vocalCues` 필드가 없는 경우 빈 큐 목록으로 취급합니다. 기존 프로젝트, 룩, 컷, 미디어 IndexedDB를 변환하거나 삭제하지 않습니다.
- 큐는 캐릭터 안에 `vocalCues` 배열로 로컬 저장하며 기존 `add('characters', ...)` 경로를 사용합니다.
- 컷이 수정·삭제된 뒤 큐가 유효하지 않으면 묵시적으로 제거하지 않고 '재검토' 상태로 표시합니다. 큐 편집 시 새 컷 범위를 다시 확인합니다.
- 정수 밀리초 범위 0~3600초, 캐릭터당 최대 96개, 최대 64명의 수동 큐를 비교합니다.

## 기능 경계
- **보컬 생성·가창 AI·음성 인식·자동 립싱크·이미지 인식·영상 렌더링 기능이 아닙니다.**
- 생성된 JSON은 사용자가 작성한 가사·메모 텍스트를 포함합니다. 공유 전 직접 검토하세요.
- 외부 서버/API 요청, 클라우드 학습 데이터 전송, GitHub 업로드는 없습니다.

## 로컬 검증 명령
```sh
cd source/MYVOCAL-Studio-source
node --test tests/character-vocal-cues.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/build-standalone.cjs
cd ../desktop
go test ./...
go test -race ./...
go vet ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -H windowsgui' -o ../../MYVOCAL-Step67-Windows.exe .
```
