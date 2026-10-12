# v0.4 개발 변경 사항

- `src/lib/composer.js`: 오프라인 규칙 기반 작곡과 MIDI 트랙 매핑, 프로젝트 적용, OpenAI 제안 데이터 검증
- `src/components/Songwriter.jsx`: 로컬/외부 AI 작사 구분 탭, 임시 API 키, 초안 미리보기, 부분 적용
- `src/pages/Workspace.jsx`: 작사·자동 작곡 편집 탭 통합
- `desktop/ai.go`: OpenAI Chat Completions 서버사이드 HTTPS 프록시 (로컬 Origin/세션 검사)
- `tests/composer.test.mjs`, `desktop/ai_test.go`: 작곡/프로젝트 보존 및 API 모의 응답 검증

사용자 제공 텍스트의 모든 대형 설계(66개 항목)는 목표 범위로 유지되며, 여기서 구현했다고 명시하지 않은 AI 학습·동영상 생성 기능은 아직 설계 수준입니다.
