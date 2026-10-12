# MYVOCAL Studio v1.8 — 검증 가능한 실행환경 및 진행 현황

## 새 기능

- 설정 > 'v1.8 · 앱 실행 환경 진단'에서 Windows 런처의 시스템 점검을 요청할 수 있습니다.
- Windows EXE 내부 Go 서버가 로컬 데이터 폴더 쓰기 가능 여부, 앱 브라우저 설치 여부, 내부 서버 동작 여부를 검사합니다.
- 브라우저의 IndexedDB 실제 파일 쓰기/읽기/삭제를 시험합니다 (오디오·이미지 원본 저장 경로).
- Web Audio 사용 가능 여부, 사용자의 명시적 클릭으로 마이크 권한을 짧게 확인하고 즉시 해제합니다. 자동 녹음·저장은 하지 않습니다.
- 진단을 JSON 파일로 저장할 수 있고 기획 대비 기능을 기본 구현/부분 구현/핵심 미구현 상태로 나누어 표시합니다.
- Windows 실기기에서의 동작과 외부 AI 모델 실행은 아직 검증되지 않았습니다.

## 기획서 대비 핵심 남은 기능

1. 실사용 가능한 AI Music Composer/Arranger 및 AI Producer의 프로젝트 수정
2. 자신의 목소리를 신경망으로 학습하고 가사+MIDI를 자연스럽게 Singing 합성하는 기능
3. 캐릭터/사람 외형 Identity 유지와 2D·3D 애니메이션, Lip Sync, 춤/동작 합성
4. 실제 영상 생성, 컷 편집, 음악 동기화, MV/PV 내보내기
5. 실기기(Windows + 마이크/오디오 + GPU) 통합 검증, 예외처리와 배포/설치 안정화

기능 완성률에 대한 숫자는 측정·가중치 근거가 없어 제시하지 않습니다. 버전 1.8은 제품 완성도가 80%라는 의미가 아닙니다.

## 기술 구조와 제한

Windows EXE: Go로 빌드한 Windows용 런처, 로컬 HTTP 서버, Edge/Chrome 앱 창.
음악 UI: React 기반 로컬 화면. 데이터는 로컬스토리지와 IndexedDB.
내장 ML 기반 가창 학습·합성, AI MV 렌더러 없음.

## 재현 가능한 검증

```sh
cd MYVOCAL-Studio-v1.8
npm test
node scripts/build-standalone.cjs
cp MYVOCAL-Studio-v1.8.html ../desktop/index.html
cd ../desktop
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -H windowsgui' -o ../MYVOCAL-Studio.exe .
```
