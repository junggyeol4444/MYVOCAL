# Step57 — 로컬 Reference 음악 신호 분석

Step56 소스를 유지하면서 `Learning Studio → Reference Analysis`에 오프라인 오디오 분석·비교를 추가했습니다.

## 사용
1. Reference Analysis에서 기존 Reference 음악을 선택하거나 새 오디오 파일을 선택합니다.
2. 이름을 확인하고 **Reference 분석 전용이며 모델 학습에 사용하지 않음** 확인란을 누릅니다.
3. 로컬 분석 버튼을 눌러 길이·피크·RMS·활성 구간 비율·32구간 RMS 에너지 도표를 확인합니다.
4. 결과 JSON을 다운로드하거나 이전에 생성한 Reference 결과 JSON을 불러와 통계 차이를 비교할 수 있습니다.

입력 파일은 최대 30MiB, 디코딩 결과 최대 5분 또는 1,200만 개 인터리브 PCM 샘플이며 실제 지원 코덱은 해당 Windows/WebView2 브라우저의 `decodeAudioData`에 따릅니다. 파일은 서버에 업로드하지 않습니다. 음악의 원본 오디오 파일/PCM은 내보낸 결과 JSON에 들어가지 않습니다. JSON 보고서는 명시적으로 내려받지 않으면 영구 보존되지 않습니다.

**분석 범위:** 신호 피크, RMS, 시간 구간별 에너지 및 소리 유무. 이 버전은 BPM, Key, Chord, Melody, Genre, 악기 추정, AI 모델 학습/추론, 음악 복제나 저작권 유사도 판정을 하지 않습니다. RMS/에너지는 LUFS 등 심리음향 표준 정규화가 아닙니다. 통계상 유사하다고 같은 곡이나 다른 곡임을 뜻하지 않습니다.

## 구현 구성
- `src/lib/referenceMusicAnalysis.js`: 원본 Step53 신호 분석 재사용, Reference-only 권한 확인, 32구간 시간 가중 에너지, 비학습 JSON, 유효성 검사, 비교.
- `src/components/ReferenceMusicPanel.jsx`: 음원 선택, 로컬 오디오 디코딩, 직접/기존 IndexedDB 등록 자료 분석, 결과 JSON 내보내기/비교.
- `src/pages/Learning.jsx`: 기존 Learning Studio에 기능 연결.
- `tests/reference-music-analysis.test.mjs`: 23개 테스트.

### 한계
- UI/오디오 코덱을 Windows 10/11 실제 PC에서 직접 시험하지 않았습니다.
- 보고서가 프로젝트/IndexedDB에 자동 저장되지는 않습니다.
- 분석 동의는 앱 내부 구분이지 외부에서 부여된 실제 라이선스 권리를 검증하지 않습니다.
- 긴 파일을 메모리에 디코딩하므로 메모리 사용량에 따라 분석이 실패할 수 있습니다.
