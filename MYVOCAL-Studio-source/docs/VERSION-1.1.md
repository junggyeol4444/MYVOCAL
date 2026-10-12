# MYVOCAL Studio v1.1 작업 변경 사항

보컬 작업대에서 사용자 기기의 호환 가창 엔진을 조회해 모델 목록을 표시하고 선택할 수 있습니다. 모델 목록 및 `neural` 모드 표시는 연결된 외부 엔진의 **자체 신고**이며 실제 추론 품질을 보장하지 않습니다.

### Engine Capability API
- `GET http://127.0.0.1:<port>/health` : `{"status":"ok","protocol":"MYVOCAL_SINGING_V1","name":"..."}`
- `GET http://127.0.0.1:<port>/v1/capabilities` (선택):
```json
{"protocol":"MYVOCAL_SINGING_V1","name":"My Engine","mode":"neural","inferenceReady":true,"models":[{"id":"my-voice-1","name":"My Voice","engineId":"svc","languages":["ko"]}],"supportedLanguages":["ko"],"features":["wav"]}
```
- `POST http://127.0.0.1:<port>/v1/sing` : 기존 v1.0 `MYVOCAL_SINGING_REQUEST` 요청과 호환되고 `cues[].hangul`에 음절 힌트가 추가됩니다. 결과는 WAV 바이너리입니다.
- 외부 API는 **로컬 루프백**에서만 접근하고, 앱의 로컬 HTTP 프록시로 전달됩니다. 사용자 앱/엔진 사이에 임의 원격 URL 전송 기능은 없습니다.

### 한계
사용자 프로젝트에 저장한 원본 음성 파일은 승인 없이 엔진에 전송되지 않습니다. 요청에는 이름/음표/가사/외부 체크포인트 ID만 포함됩니다. 체크포인트가 실제로 설치·호환되는지는 외부 엔진에 달려 있습니다. 음절 분해는 음소 타이밍 분석이 아닙니다.
