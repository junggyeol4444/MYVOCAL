# MYVOCAL Studio v1.4 — OpenUtau USTX 연동

기획서의 음악·보컬 제작 프로젝트를 외부 가창 도구에 전달할 수 있도록 **OpenUtau 프로젝트(.ustx) 내보내기**를 추가했습니다. 기존 v1.3 MIDI/가사/발음 타임라인/외부 엔진 관리/프로젝트 저장은 유지합니다.

## 사용 방법

1. MYVOCAL Studio 프로젝트를 열고 MIDI 피아노 롤에서 보컬 멜로디를 만듭니다.
2. 가사를 입력하고 **가사·MIDI 싱크**에서 음표별 가사를 배치해 저장합니다.
3. **OpenUtau 연동 v1.4** 탭에서 렌더러 종류, 설치된 보이스뱅크 및 발음 처리기 이름을 설정합니다. 이름이 불확실하면 비워 둔 뒤 OpenUtau에서 직접 선택하세요.
4. **OpenUtau .ustx 저장**을 누른 후 OpenUtau에서 파일을 열어 호환 보이스뱅크·음소 처리기를 지정합니다.
5. OpenUtau에서 WAV로 렌더링한 후, MYVOCAL **가사·MIDI 싱크 → 외부 보컬 WAV 가져오기**에서 오디오 트랙으로 등록할 수 있습니다.

## 범위

- USTX 0.6/YAML 1.2, 480 ticks/quarter, 4/4 박자, 단일 보컬 MIDI 트랙의 음높이·음표 위치·길이·가사·BPM 전달
- 보이스뱅크/음소 처리기/렌더러 종류는 단순 프로젝트 설정값으로 내보냅니다.
- USTX 입출력 중 **내보내기만** 지원하며, OpenUtau에서 수정한 .ustx를 MYVOCAL로 다시 가져오는 기능은 아직 없습니다.
- 겹치는 MIDI 음표, 비정상적인 길이, 만료된 가사 싱크를 거절합니다. 누락 가사는 'a'로 대체하고 화면에 경고합니다.
- **실제 AI 모델 학습 또는 추론, 한국어 자동 음운 변동·정밀 음소 조정, 노래 품질 검증은 수행하지 않습니다.** OpenUtau가 선택한 보이스뱅크·Phonemizer·Renderer와 호환되어야 합성이 됩니다.
- 기존 v1.3 발음 힌트(JSON/CSV)는 USTX 파일의 실제 OpenUtau 음소 오버라이드로 자동 변환하지 않습니다.

기술 참조: [OpenUtau USTX file format](https://github.com/openutau/OpenUtau/wiki/USTX-file-format)

## 검증

```
cd MYVOCAL-Studio-v1.4
npm test
npm run build:standalone
cd ../desktop
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -H windowsgui' -o ../MYVOCAL-Studio.exe .
```

이 샘플 USTX는 PyYAML로 구조를 파싱해 음표/타이밍 값이 올바른지 확인했으나 **OpenUtau 실기기에서 파일을 열고 소리까지 생성하는 통합 테스트는 별개**입니다.
