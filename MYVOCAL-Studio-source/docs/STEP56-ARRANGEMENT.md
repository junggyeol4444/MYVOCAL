# Step56 — 로컬 MIDI 다중 트랙 편곡

Step55의 결정적 멜로디 스케치를 변경하지 않고 Bass / Chords / Drums 반주 파트를 생성한다. 총 4개 파트 중 선택 가능. 표준 MIDI Format 1로 다운로드할 수 있으며, 파일은 로컬에서 생성된다.

## UI 사용

1. 앱의 **Learning Studio > 음악 학습** 페이지에서 "MY MUSIC STYLE · MIDI 스케치 편곡"으로 이동.
2. Step54 형식(`type: my-music-style`, `schemaVersion: 1`, `trainingPerformed: false`)의 JSON 파일을 불러온다. 실제 사용자 음악에서 이 JSON을 자동으로 생성하는 UI는 **아직 없음**.
3. BPM, 마디, 시드, 루트 MIDI, 장/단조, 편곡 밀도, 트랙을 선택하여 **MIDI 생성 > MIDI 내려받기**.
4. 결과 MIDI를 지원되는 MIDI 편집기에 불러와 트랙별로 편집한다.

`examples/Step56-SYNTHETIC-DEMO-profile.json` 파일로 UI를 시험할 수 있다. 해당 프로필은 실제 음악 분석 결과가 아닌 **합성 검증용 샘플**이며, 그 내용은 실제 학습·취향 분석·사용 권한의 증거가 아니다. 예시 미디도 `examples/Step56-SYNTHETIC-DEMO-arrangement.mid`로 포함된다.

## 범위/주의

- 오프라인 결정적 규칙 기반 패턴: 고정 4마디 하모니 진행, 드럼 GM 음색, 입력 음량·활성 비율로만 벨로시티/패턴 밀도를 조절함.
- 원본 음악에서 BPM, 화성, 장르, MIDI를 추론하지 않음. 개인 스타일 AI 학습·추론이 아님.
- 결과 MIDI는 DAW에서 연주할 악기 사운드를 선택해야 함(오디오 WAV 렌더러 아님).
- 앱은 불러온 프로필의 서식을 검사하지만 입력한 JSON의 권리 선언이나 원본 파일 해시를 독립 검증하지 않는다.
- Step54 스타일 프로필을 만들려면 JS API(`createMusicStyleProfile`)를 이용해야 하며 UI 미연동.
- 현재 모델 훈련, 사용자 음악 구조 추론, 프로젝트 트랙 자동 삽입/프로젝트 보존 상태 변경, Windows 10/11 실기기 실행 검증 미구현/미검증.

## 검증 명령

```sh
cd source/MYVOCAL-Studio-source
node --test --test-concurrency=1 tests/*.test.mjs
node tools/generate-step56-demo.mjs
node scripts/build-standalone.cjs
```

이후 `MYVOCAL-Studio-v1.8.html`을 `../desktop/index.html`에 동일하게 복사한 후 Go Windows x64 교차 빌드.
