# v0.7 릴리스 노트

## 추가
- `src/lib/voiceTraining.js`: 학습 엔진 계약/권한 검사/자료 상태/준비 작업 스냅샷/ZIP/체크포인트 메타데이터
- `src/pages/Training.jsx`: 학습 준비 및 외부 체크포인트 관리자 화면
- `src/lib/schema.js`: `trainingPlans`, `voiceModels` 저장 필드
- `src/pages/Library.jsx`: Virtual Singer-모델 참조 필드와 Voice Checkpoints 목록
- `tests/voice-training.test.mjs`: 신규 테스트 8개

## 주의
**완성된 AI 학습 엔진이 아니라 준비/관리 계층입니다.** 학습, 추론, 보컬 합성은 미구현. 외부 모델 형식 호환성도 확인하지 않습니다.

v0.1~v0.6과 동일한 브라우저 프로필과 로컬 저장 키를 사용합니다. 저장값에 새로운 필드가 추가되어 이전 버전으로 되돌릴 때 버전 차이가 발생할 수 있으므로 백업 후 사용하세요.
