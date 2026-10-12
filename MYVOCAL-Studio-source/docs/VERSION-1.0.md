# MYVOCAL Studio v1.0 — 보컬 렌더링 및 로컬 Singing Bridge

## 실제 추가된 기능

1. Music Studio > **보컬 렌더링 v1.0** 탭.
2. 프로젝트 MIDI 음표와 수동 가사 싱크가 준비돼 있으면 **모음 샘플 WAV 렌더링**. 권한 있는 Voice Studio 녹음에서 추출한 v0.8 로컬 보컬 샘플 모델을 사용합니다.
3. 가사의 한글 표기 음절을 네 가지 대표 모음 `ㅏ,ㅓ,ㅣ,ㅜ`으로 근사 분류하고 모델을 선택합니다. 사용자가 샘플 매핑을 수동 조정할 수 있습니다. 자음과 연음은 발음하지 않습니다.
4. WAV 재생·다운로드·프로젝트 오디오 트랙 추가. 원본은 기존 로컬 파일 DB에 저장되며 전체 프로젝트 백업에서 유지됩니다.
5. Windows EXE 내장 Singing Bridge: 사용자 PC의 `127.0.0.1:<port>`에 구동되는 호환 추론 엔진에만 접근. 앱 전용 세션키 확인, 포트/요청 크기/응답 크기/음표 범위 검사, 리다이렉트 차단, WAV 헤더 검사.
6. Python 테스트 서버 `tools/demo_singing_engine.py`는 **정현파 기반 테스트 소리만 생성**하며 AI 가창이 아닙니다. 외부 AI 런타임/모델은 내장하거나 자동 설치하지 않습니다.
7. 이전 v0.9 프로젝트 저장 키 (`myvocal-studio-v01`)와 가사·MIDI 싱크 데이터 유지.

## 연동용 Singing Bridge 계약

- `GET http://127.0.0.1:7867/health` → `{"status":"ok","protocol":"MYVOCAL_SINGING_V1","name":"Engine name"}`
- `POST http://127.0.0.1:7867/v1/sing` → application/json, 응답은 RIFF WAV (`audio/wav`)

입력 예시:

```json
{
  "port":7867,
  "format":"MYVOCAL_SINGING_REQUEST",
  "version":1,
  "project":"Song A",
  "voice":{"id":"my-voice","name":"My voice","rights":"self"},
  "checkpoint":{"id":"model-1","name":"my-model.onnx","engineId":"generic"},
  "bpm":120,
  "cues":[{"lyric":"아","pitch":69,"startSec":0.0,"endSec":0.5,"velocity":95}]
}
```

출력: RIFF/WAVE 파일, 파일 크기 최대 32 MiB. 출력 WAV는 타임라인 0초부터 시작해야 합니다.

**주의:** MYVOCAL 전용 프로토콜로 RVC/SVC/DiffSinger의 공식 API가 아닙니다. 실제 AI 가창을 사용하려면 해당 모델과 오디오/가사/음소 포맷을 처리하는 호환 서버를 별도로 구현·실행해야 합니다. 체크포인트 파일의 바이너리는 서버로 전송하지 않습니다.

### 테스트용 소리 서버

`python tools/demo_singing_engine.py --port 7867` 실행 후 Windows EXE의 보컬 렌더링 탭 → 로컬 포트 7867 → 엔진 연결 확인 → WAV 생성.

이 예제는 AI·실제 사람 음색·가사 발음·음소 학습 모델이 **아닙니다**. Python 3 별도 설치가 필요합니다.

## 테스트 결과

- JavaScript 자동 테스트 55개 통과 (v0.9 기존 + 신규).
- Go Bridge 인증/포트/호환 엔진 WAV 테스트 통과.
- Windows x64 `PE32+` 파일 생성 확인.
- 실제 Windows 기기 GUI 더블클릭, 마이크, 브라우저 화면 클릭, 실제 AI 체크포인트 추론 품질은 **미검증**.

## 한계

실행기는 Edge/Chrome 앱 모드 창을 사용하며 완전 네이티브 DAW가 아닙니다. 샘플 기반 렌더링은 자음이나 자연스러운 가창을 생성하지 않습니다. 완성된 AI 음성 모델 및 학습 엔진, MV 영상 생성은 아직 구현되지 않았습니다.
