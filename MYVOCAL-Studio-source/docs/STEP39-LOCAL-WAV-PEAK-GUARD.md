# Step39 — WAV 내보내기 샘플 피크 보호

## 사용법

1. 오디오·MIDI 멀티트랙 편집기에서 **WAV 내보내기 피크 보호 (-1 dBFS)** 체크박스를 확인합니다. 새 편집 화면에서는 기본적으로 켜져 있습니다.
2. **WAV 믹스 저장**을 누르면 기존과 동일하게 44.1 kHz, 16비트, 스테레오 WAV를 생성합니다.
3. 보호가 켜져 있으면 오프라인으로 믹싱한 전체 신호의 양 채널 최대 **샘플 피크**를 측정하고, -1 dBFS를 넘는 경우 **모든 채널과 모든 샘플에 동일한 감쇠 배율**을 적용한 후 PCM을 인코딩합니다.
4. 보호로 실제 감쇠가 발생하면 완료 알림에 감쇠량(dB)이 표시됩니다. 보호가 꺼져 있으면 Step38 이전과 동일한 WAV 인코딩 경로를 사용합니다.

## 특징과 제한

- **출력에만 적용**됩니다. 기존 프로젝트 JSON, 클립·트랙 속성, 원본 WAV/미디어, MIDI, WebView2 사용자 프로필, 실시간 재생 음량은 수정하지 않습니다.
- 소리가 작다고 증폭하지 않습니다. 좌우 채널 균형과 다이내믹을 유지하기 위한 **일괄 감쇠**만 수행합니다.
- **트루 피크(샘플 간 피크) 리미터, LUFS 라우드니스 정규화, 컴프레서, 마스터링 기능이 아닙니다.** 실제 DAC에서의 인터샘플 오버슈트는 보장하지 않습니다.
- 기존 `mixdownWav(project)` 호출은 반환 형식(Blob)과 보호 비활성 기본값을 유지합니다. UI에서만 보호 체크박스를 기본 선택합니다.
- 지원되는 피크 보호 기준은 -1 dBFS로 고정되어 있습니다. 비정상적인 NaN/Infinity 오디오 샘플은 보호가 켜진 경우 오류로 처리합니다.
- 최대 8분 제한과 기존 로컬 믹싱 구조는 그대로입니다.
- 테스트는 Node의 모의 Web Audio를 이용했습니다. Windows 10/11 PC의 WebView2, 실제 스피커, GUI 동작은 검증하지 않았습니다.

## 구현

- `src/lib/mixPeak.js`: 순수 함수 `analyzeMixPeak` (샘플 피크 측정·안전 감쇠 배율).
- `src/lib/audioEngine.js`: `mixdownWavDetailed(project,{peakProtection:true})` 및 기존 `mixdownWav` 호환 유지. PCM 인코딩 시 감쇠 배율 적용.
- `src/components/AudioWorkstation.jsx`: 피크 보호 체크박스, WAV 저장과 완료 알림.
- `tests/mix-peak.test.mjs`: 유닛 테스트 13개.
- `tests/clip-level-integration.test.mjs`: 실제 `mixdownWavDetailed` 코드 경로를 이용한 WAV PCM 검증 3개 (모의 Web Audio).
