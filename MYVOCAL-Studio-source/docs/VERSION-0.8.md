# MYVOCAL v0.8 릴리스

## 구현
- `src/lib/localVocalSampler.js`: 데이터 권한 확인 → 기준 피치가 있는 녹음에서 짧은 오디오 조각 추출 → 단일 채널 PCM WAV 인코딩 → 샘플 모델 메타데이터 생성 → MIDI 음표를 샘플 재생 속도로 변환하여 WebAudio offline WAV 렌더링
- `src/components/VocalPreview.jsx`: Voice Training 5번 패널 UI, 모델 관리, 재생/정지/다운로드
- `src/pages/Training.jsx`: 기존 외부 체크포인트 관리와 로컬 샘플 모델 분리
- `src/pages/Library.jsx`: 샘플 모델과 외부 체크포인트 상태 구분
- `tests/local-vocal-sampler.test.mjs`: 7개 신규 테스트, 전체 38개

## 한계
아무런 딥러닝 학습이 진행되지 않음. 원본 녹음에서 추출한 샘플을 재생 속도로 피치 시프트하므로, 가사 발음이 생성되지 않고 음색이 음정에 따라 변함. RVC/SVC 추론 연동 없음.

## 기존 데이터
이전 버전의 localStorage 키와 IndexedDB 파일 저장소 유지. 데이터 백업 후 사용 권장.
