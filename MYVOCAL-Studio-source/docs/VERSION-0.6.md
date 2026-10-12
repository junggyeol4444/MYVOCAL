# MYVOCAL Studio v0.6 — Windows 64비트

**실행**: `MYVOCAL-Studio.exe`를 Windows 10/11 64비트에서 실행합니다. 설치된 Edge 또는 Chrome을 전용 앱 창으로 실행하는 프로토타입이며 순수 네이티브 DAW 엔진은 아닙니다. 서명되지 않은 실행 파일입니다.

## 실제 구현
- v0.1~0.5의 프로젝트, 오디오 및 MIDI 타임라인, WAV 믹스, 규칙 기반 작곡, 선택적 OpenAI 가사/코드 제안, Voice Studio 녹음·피치 분석 유지
- 12개 음성 녹음 가이드: 저음/중음/고음 × 모음 ㅏ/ㅓ/ㅣ/ㅜ
- 각 원본 오디오 샘플에 사용자가 지정한 녹음 과제, 메모 보존
- 샘플 길이(5초 미만), 클리핑, 작은 음량, 피치 검출 부족의 간이 품질 경고
- 가이드 완료율/품질 통과 샘플 표시, 원본 오디오+manifest.json ZIP 내보내기 (음성 자료 합계 150MB 이하)

## 한계와 안전
- 녹음 가이드 라벨은 사용자 입력값. 실제 발음 일치, 저·중·고음 적합성은 자동 검사하지 않습니다. 품질 '통과'는 AI 학습 준비 완료 판정이 아닙니다.
- **AI 목소리 학습·보컬 합성·MV 생성은 여전히 미구현**입니다.
- 음성은 앱의 Edge/Chrome 프로필 IndexedDB에 로컬 보관됩니다. JSON 백업에 파일 원본이 없습니다. ZIP 원본 백업을 별도로 보관하세요.
- 데이터 저장 폴더: `%LOCALAPPDATA%\MYVOCAL Studio\DesktopProfile`. v0.1~v0.5와 같은 저장 키를 사용합니다.
- Windows 실기기에서 EXE 실행, 직접 마이크 녹음은 이 Linux 개발 환경에서 검증할 수 없었습니다.

## 소스 / 빌드
- UI 소스: `MYVOCAL-Studio-v0.6/src`. Node 테스트: `node --test tests/*.test.mjs`.
- 내장 UI 갱신: `cd MYVOCAL-Studio-v0.6 && node scripts/build-standalone.cjs`, 생성한 `.html`을 `../desktop/index.html`로 복사
- Go 빌드: `cd desktop && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -H windowsgui" -o ../MYVOCAL-Studio.exe .`
