# MYVOCAL Studio v1.1 Windows prototype

## 프로그램 구조
- Windows 64비트 Go 실행기 + 내장 단일 React 화면. 루프백 웹서버(127.0.0.1), Edge/Chrome 앱 창.
- 컴퓨터 안에서만 샘플 오디오 합성. 외부 Singing 엔진은 **별도 프로세스**로 실행해 `GET /health`, `POST /v1/sing` 계약을 구현해야 합니다.
- 내장 AI 보컬 학습이나 Singing 신경망 모델 및 체크포인트 바이너리는 없습니다.

## 추가 사항
- 보컬 렌더링 v1.1 탭: 가사 싱크 자동 갱신, 샘플 보컬 선택·모음별 매핑, 프로젝트에 WAV 트랙 추가.
- Singing Bridge: 세션 헤더/Origin 보호, 127.0.0.1 엔진 요청, WAV 응답 검사.
- Python 테스트 엔진 (AI가 아닌 정현파): `tools/demo_singing_engine.py`.
- 프로젝트 저장 형식과 로컬 저장 키는 v0.9 유지.

## 빌드
```
cd MYVOCAL-Studio-v1.1
npm install
npm test
npm run dev
node scripts/build-standalone.cjs
# 생성된 MYVOCAL-Studio-v1.1.html을 desktop/index.html에 복사
cd ../desktop
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -H windowsgui" -o ../MYVOCAL-Studio.exe .
```
이 환경에서 단일 HTML 변환은 사전 설치 TypeScript/React UMD 리소스를 사용합니다. 다른 PC에서는 변환 스크립트의 경로를 수정하거나 정규 Vite 빌드를 이용해야 합니다.

## 테스트 주의
- JS 55개, Go 테스트 통과. EXE 파일 구조 PE32+ 생성 확인.
- 사용자 Windows PC에서 실제 EXE GUI 열기, 외부 AI 모델 추론, 라이브 보컬 학습 테스트는 미완료.
- 프로그램으로 녹음/학습하는 모든 사람의 목소리는 본인 또는 사용 허가 자료여야 합니다.

상세 내용 `docs/VERSION-1.0.md` 참고.
