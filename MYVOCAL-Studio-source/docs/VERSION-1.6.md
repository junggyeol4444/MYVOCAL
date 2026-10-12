# MYVOCAL Studio v1.6

## 변경 사항

- OpenUtau 보이스뱅크 폴더 검사: oto.ini를 찾고 참조 WAV의 존재 여부 및 크기(44바이트 이상)를 확인합니다. 멀티 oto.ini, 중첩 폴더, 한글 파일명 포함.
- 누락 WAV 파일 경로, 손상 가능 파일(크기 부족), 읽을 수 없는 oto.ini를 사용자에게 표시합니다.
- 원본 오디오를 앱 프로젝트에 복사하지 않고 검사 건수 및 요약 결과만 보이스뱅크 프로필에 저장합니다.
- Windows 실행기 API로 OpenUtau.exe의 **파일 존재 여부만** 검사합니다. 자동 시작/설치 없음.
- 기존 오디오 편집/MIDI/Voice/가사 싱크/발음 타임라인/USTX/외부 가창 엔진 어댑터는 계속 유지됩니다.

## 테스트

- node --test tests/*.test.mjs : 98개 통과
- go test ./... 통과
- Chromium 오프라인 UI 검사: 새 프로젝트 생성→OpenUtau 탭→보이스뱅크 폴더 입력→누락 파일 1건 표시까지 검증
- Linux에서 Windows x64 PE 실행 파일 크로스 컴파일 (Windows에서 실제 실행해 검증한 것은 아님).

## 남은 기능

OpenUtau 호환 사용자 보이스뱅크/렌더러 설치, 실제 Singing AI 학습·추론, 캐릭터 MV 자동 생성, Windows GUI 실기기 검증은 아직 미구현/미검증입니다.
