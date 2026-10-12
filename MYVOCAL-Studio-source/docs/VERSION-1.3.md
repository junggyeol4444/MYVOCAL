# MYVOCAL Studio v1.3 — 한국어 발음·타임라인 힌트

## 사용자 기능

- 기존 v1.2의 모든 기능과 동일한 `myvocal-studio-v01` 프로젝트 저장 키 유지.
- 프로젝트 편집기에 **발음 타임라인** 탭 추가: 저장된 가사·MIDI 싱크에서 한글 초성/중성/종성을 분리하고, 각 발음 힌트의 시간 범위를 MIDI 음표 안에 배치.
- 발음 힌트의 텍스트, 시작 시간, 종료 시간 직접 수정. 유효하지 않은 범위·겹침·너무 긴 문자열 검증.
- 프로젝트에 발음 타임라인 보관, 변경된 가사·MIDI·싱크 자동 감지.
- 발음 힌트를 JSON 및 UTF-8 BOM CSV로 내보내기.
- 외부 엔진에 보컬 생성 요청 시 선택적으로 `phonemes` 배열을 추가해 전달. Go 앱 서버와 Python CLI 어댑터가 이를 검증하고 전달. v1 엔진은 이 필드를 무시할 수 있음.
- v1.3 발음 힌트는 전체 프로젝트 백업에 포함되며, 복원으로 프로젝트 및 MIDI 트랙 ID가 바뀌어도 `phonemePlan` 참조가 수정됨.

## 중요 제한

**발음 힌트는 진짜 음성 인식/음소 분석/강제 정렬 결과가 아닙니다.**
한글 조합형 음절을 자모로 분리한 뒤 추정 시간을 적용하는 단순 규칙 기반 도구입니다. 연음·비음화·된소리·음운 축약·영어의 실제 발음은 처리하지 않습니다.
진짜 음소 시간 예측과 고품질 Singing 합성에는 외부 모델/엔진/발음 사전이 필요합니다.

앱에는 신경망 Singing 모델, 보이스 클로닝 학습 엔진, GPU 추론 환경이 포함되지 않습니다. `sample_worker_NO_AI.py`는 데모 신호만 만듭니다. 외부 엔진이 새 `phonemes` 필드를 지원한다는 보장도 없습니다.

## 사용 방법

1. 가사 입력 → MIDI 보컬 음표 작성 → **가사·MIDI 싱크** 생성 및 저장.
2. 새 **발음 타임라인** 탭 → **발음 힌트 자동 생성**.
3. 발음 기호와 구간 시작·종료 수정 → **발음 계획 저장**.
4. 필요하면 JSON/CSV로 내보내기.
5. **보컬 렌더링 v1.3** 탭에서 실제 호환 엔진을 연결하면, 저장된 힌트를 선택적으로 추가 전송.
6. 별도 외부 추론 래퍼에서 자모를 실제 모델의 음소 기호로 변환하고 추론해야 함.

## 데이터 계약

`phonemePlan`:

```
{
  "format": "MYVOCAL_PHONEME_HINTS", "version": 1,
  "projectId": "...", "trackId": "...", "sourceKey": "...",
  "method": "jamo-heuristic-not-audio-alignment",
  "segments": [
    {"id":"c0-u0-p0", "cueIndex":1, "syllable":"안",
     "kind":"nucleus", "token":"ㅏ", "pitch":69,
     "startSec":0, "endSec":0.35}
  ]
}
```

`MYVOCAL_SINGING_REQUEST` v1의 선택 항목 `phonemes`: `cueIndex`, `token`, `kind`, `pitch`, `startSec`, `endSec`. 없으면 기존 v1.2 요청과 완전히 동일함.

## 개발·테스트

```bash
cd MYVOCAL-Studio-v1.3
npm test
npm run build:standalone
cd ../desktop
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -H windowsgui" -o ../MYVOCAL-Studio.exe .
cd ../tools
python test_cli_adapter.py
```
