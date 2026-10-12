MYVOCAL Studio v1.1 — Windows 64비트 초기 프로그램

1) MYVOCAL-Studio.exe를 더블클릭해서 실행하세요.
2) Edge 또는 Chrome이 설치되어 있어야 합니다. 앱은 별도 전용 창으로 열립니다.
3) [Voice Studio]에서 본인/허가 음성 녹음 또는 파일을 등록하세요.
4) [Voice Training]에서 로컬 샘플 모델을 추출하세요.
5) [Music Studio]에서 가사와 MIDI 멜로디를 편집하세요.
6) 새 [보컬 렌더링 v1.1] 탭에서 가사 싱크 → 샘플 WAV 생성 → 트랙 추가를 진행하세요.
7) 별도 AI 엔진을 실행했다면 외부 엔진 포트와 연결하세요.

기능 구분:
- 로컬 샘플 렌더링 = 녹음 조각 기반. AI 목소리 학습/자음 발음 불가.
- 외부 Singing Bridge = 실제 AI 엔진이 별도로 실행되고 호환 프로토콜을 구현했을 때만 AI 추론 가능.
- 기본 패키지에는 AI Singing 엔진, 체크포인트, 학습 모델, 자동 설치 기능이 없습니다.
- 외부 엔진 테스트용 예제: tools/demo_singing_engine.py (Python3 필요, AI 아님).

프로젝트 파일은 전용 Edge/Chrome 프로필의 로컬 브라우저 저장소에 보관됩니다.
프로젝트 화면의 [전체 백업]을 정기적으로 사용하세요.
Windows 실기기 GUI 동작은 아직 검증하지 않았습니다.

상세 설명: BUILD.md 및 docs/VERSION-1.0.md
