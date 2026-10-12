# Step03h — COM STA teardown before HWND destruction

- On WM_CLOSE, close WebView2 on the owning COM STA before DefWindowProc destroys the parent HWND. WM_DESTROY and message-loop failure also perform idempotent cleanup.
- Clear interface pointers and subscription flags before COM calls so reentrant callbacks cannot see half-released interfaces.
- Unsubscribe only successfully registered events (including a valid zero token), then call controller.Close, followed by WebView, controller and environment Release in order.
- Keep existing callback pins and legacy profile protections unchanged.
- Added Windows mock vtable regression test for teardown order, zero navigation token and idempotence; **compiled but NOT executed on Windows**.
- Existing browser mode remains default. Windows native GUI, COM Runtime and actual user storage persistence remain unverified.
