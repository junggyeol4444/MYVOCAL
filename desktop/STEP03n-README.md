# Step03n — Windows WebView2 STA 소유권 방어 (부분 구현)

- 네이티브 WebView2 환경/컨트롤러 초기화·이동·팝업 콜백에 생성 STA thread ID 검사 추가. 잘못된 스레드에서는 COM 인수에 접근하지 않고 `RPC_E_WRONG_THREAD` 반환.
- 잘못된 스레드 감지 시 Win32 비공개 메시지(`WM_APP` 범위)로 소유 창에 종료 요청; `WM_CLOSE`를 다른 스레드에서 직접 보내지 않음.
- 창 핸들을 `atomic.Uintptr`로 관리하고 WM_DESTROY에서 0으로 정리해 늦은 콜백이 재사용된 HWND에 메시지를 보낼 위험 감소. 완전한 핸들 재사용 경쟁 제거는 아님.
- 기존 프로필·프로젝트·브라우저 호스트 및 UI 변경 없음. Windows 실기기 COM/GUI 검증 전까지 3단계 미완료.
- Windows mock COM ABI 테스트를 실제 Windows에서 실행해야 함. Linux에서는 Windows 테스트 EXE 크로스 컴파일만 가능.
