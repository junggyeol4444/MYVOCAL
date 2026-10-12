# MYVOCAL Studio v1.7 — OpenUtau 작업 교환 강화

## 실제 추가 기능

- 가사·MIDI 싱크를 OpenUtau USTX, 리드 MIDI, SRT 타임코드, 작업 정보 JSON과 안내문으로 ZIP 묶음 내보내기
- 결과 보컬 WAV의 RIFF/WAVE·청크·PCM/IEEE Float·샘플레이트·채널·길이 검사
- 예상 보컬 종료 시점과 WAV 길이 차이 경고 (자동 정렬·잘라내기 없음)
- 명시적 확인 버튼으로 보컬 WAV를 로컬 IndexedDB에 보관하고 오디오 트랙 생성
- 프로젝트에 최근 20건의 작업 패키지 및 WAV 가져오기 이력 기록
- 기존 오디오, MIDI, Voice Studio, 보이스뱅크, OpenUtau 기능 유지

## 중요한 제약

MYVOCAL은 별도로 설치한 OpenUtau, 호환 보이스뱅크 또는 외부 가창 합성 엔진의 실제 렌더링을 수행하지 않습니다. WAV 품질과 발음·정체성은 확인하지 않습니다. WAV를 가져와도 가사·음표와 자동으로 미세 시간 정렬하지 않습니다. 현재 Edge/Chrome을 전용 창으로 사용하는 Windows 런처이며 독립 GPU/AI 합성 엔진은 아직 없습니다.

## 테스트

- `npm test`: 총 109개 통과
- `cd ../desktop && go test ./...`: 통과
- Chromium 단일 HTML 화면에서 프로젝트→MIDI→가사 싱크→작업 ZIP 다운로드, WAV 파일 헤더 검사 표시 통과
- Chromium 임시 화면은 IndexedDB 사용이 차단되어 WAV 트랙 영속 저장 화면 통합 검증 불가
- Windows EXE 교차 빌드 성공. Windows PC 실기기 직접 실행 검증은 완료하지 못함
