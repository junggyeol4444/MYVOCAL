# MYVOCAL Studio v1.5 — Voicebank Alias Inspector / OpenUtau 연동

v1.4의 USTX 내보내기를 유지하면서, **본인 소유 또는 사용 허가를 받은 UTAU 보이스뱅크의 `oto.ini` 별칭 목록**을 앱에 등록하고 수동 가사 매핑을 검사하도록 확장했습니다.

## 신기능

1. `OpenUtau · 보이스뱅크 v1.5` 탭: `oto.ini` 파일 등록. Shift-JIS / UTF-8 / EUC-KR 인코딩을 사용자가 선택할 수 있습니다.
2. `oto.ini` 행 형식 `wav파일명=alias,offset,consonant,cutoff,preutterance,overlap`을 검사하고 등록된 별칭, 중복과 무효 행을 집계합니다. 빈 alias는 WAV 파일명 기반으로 처리합니다.
3. 여러 보이스뱅크의 **발음 별칭 목록 메타데이터**를 로컬 보관하고 프로젝트별 프로필 선택값을 저장합니다.
4. 명시적 수동 매핑 `가사=oto 별칭` 작성·저장.
5. 가사·MIDI 싱크에 존재하는 음절과 등록한 alias를 대조해 일치 수와 미일치 가사를 표시합니다.
6. 기본 USTX는 가사 원문을 유지합니다. `별칭으로 가사를 치환`을 명시적으로 선택한 경우에만 수동 매핑을 반영하며 미일치 별칭은 거절합니다.
7. 기존 보컬 WAVE 가져오기, 가사·MIDI 피아노 롤, 외부 엔진 연결과 프로젝트 데이터는 유지합니다.

## 사용

1. 프로젝트 편집기에서 가사와 MIDI를 준비하고 `가사·MIDI 싱크` 저장.
2. `OpenUtau · 보이스뱅크 v1.5` → **oto.ini** 선택. 파일의 인코딩을 정확히 선택합니다.
3. 보이스뱅크 프로필에서 `oto.ini`에 있는 alias 목록 확인.
4. 한국어 가사에 대응시켜야 할 별칭을 `안=an`처럼 한 줄씩 지정합니다. 대응표를 저장합니다.
5. 일치 현황을 확인하고 필요 시 `별칭으로 가사를 치환`을 켠 뒤 .ustx 내보내기. 이것은 단순 가사 문자열 대체이며 완전한 한국어 음소 합성이 아닙니다.
6. 별도 설치한 OpenUtau에서 호환 Singer·Phonemizer·Renderer를 선택하고 WAV를 생성한 후 MYVOCAL에 가져옵니다.

## 제한과 권한

- oto.ini **텍스트 정보만 분석**합니다. 실제 보이스뱅크 음원 WAV, character.txt, Singer 설치 폴더, 음역별 subbank, 합성 품질을 검사하지 않습니다.
- 별칭 목록의 일치만으로 Phonemizer, CV/VCV/CVVC, DiffSinger의 음성 합성을 보장하지 않습니다.
- 자동 한국어 발음 규칙 적용, 발음 변형, 신경망 AI 학습/추론 엔진, 실제 Singing은 포함되지 않습니다.
- 외부 음성/보이스뱅크는 사용 권한을 보유해야 합니다. 음원 또는 모델 파일은 수집하거나 전송하지 않습니다.
- 선택한 프로필 및 발음 대응표는 로컬 메타데이터에 저장됩니다. Windows에서 최초 실행·마이크 권한·OpenUtau 렌더링까지의 실기기 검증은 수행하지 않았습니다.

## 개발 및 검증

```sh
cd MYVOCAL-Studio-v1.5
npm test
node scripts/build-standalone.cjs
cd ../desktop
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -H windowsgui' -o ../MYVOCAL-Studio.exe .
```

외부 형식 참조: https://github.com/openutau/OpenUtau/wiki/USTX-file-format, https://github.com/openutau/OpenUtau/wiki/Voicebank-Development
