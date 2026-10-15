# Step60 — Learning / Reference MIDI 재현·검증 (로컬 전용)

## 누적 개발
Step59 실제 전체 소스와 기존 프로젝트 관련 로직을 보존한 상태에서 Step60 소스/테스트/예제를 추가했다. 이 기능은 기존 Step55–59 규칙 기반 생성 결과의 **재현성과 결과 무결성**을 검증한다.

## 사용 절차
1. Learning Studio → Music Learning → `MY MUSIC STYLE · MIDI 스케치 편곡`에서 Step54 프로필 JSON을 불러온다.
2. (선택) Step57 Reference 보고서를 추가하고 Step58/59 velocity·보조 반주 밀도를 설정한다.
3. `MIDI 생성` → `MIDI 내려받기` 및 `재현 패키지 JSON 내보내기`.
4. 나중에 `Step60 재현 패키지 검증·다시 열기`에서 JSON 파일을 선택한다.
5. 앱이 옵션과 간이 스타일/Reference 통계로 MIDI를 재생성하고 **레시피 SHA-256 + 결과 MIDI SHA-256**을 비교한다. 일치할 때에만 검증 완료 표시 및 MIDI 다시 저장을 허용한다.

## JSON 포함 데이터와 제한
- 포함: 스케일, BPM, 마디, 시드, 트랙 선택, Reflection 옵션, 프로필 통계, 음악 ID/원본 SHA-256, Reference 32구간 에너지, 생성 MIDI 체크섬과 트랙 노트 수.
- **포함하지 않음**: 원본 WAV/MP3/프로젝트/보이스/영상, 학습 모델, 음악의 멜로디나 코드 전사, Reference 음원 샘플, API 키.
- 파일 120 KiB 제한, 식별자·수치·사용권한·Source 해시 검증, 예상하지 못한 JSON 필드 거부.
- SHA-256은 전송/보관 중 변경을 탐지하는 무결성 검사다. **창작자 서명·사용허가 진위·권리 증명은 아니다**. 악의적인 사람이 JSON과 체크섬을 함께 재작성하는 경우까지 방지하지는 않는다.
- 원본의 SHA-256·음악 ID·프로필 제목은 사용자의 자료를 연상시킬 수 있으므로 패키지를 타인에게 공유할 때 주의한다.
- WebCrypto SHA-256이 제공되는 로컬/보안 브라우저 환경에서 동작한다. 지원되지 않는 엔진은 오류를 표시하며 네트워크 우회 사용을 시도하지 않는다.
- Reference는 `reference-only`로만 처리하고 학습 데이터로 넘기지 않는다.

## 테스트와 합성 예제
- `node --test tests/learning-replay-bundle.test.mjs`
- 전체: `node --test --test-concurrency=1 tests/*.test.mjs`
- 합성 예제 생성: `node tools/generate-step60-replay-example.mjs`
- `examples/step60/SYNTHETIC-replay.json`, `SYNTHETIC-replayed.mid`, `SYNTHETIC-verification.json`

## 미구현 항목
실제 학습 모델·음성 변환/합성·BPM/Key/Chord 추정·원곡 편곡 학습·Windows 실기기 검증은 이 단계에 포함되지 않는다. 예제는 합성 데이터만 사용했다.
