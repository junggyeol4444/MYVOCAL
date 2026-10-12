# Step03o — Windows WebView2 STA thread-queue message isolation (partial)

Input: Step03n archive, verified via ZIP CRC. Existing UI and storage schemas unchanged.

The experimental Windows WebView2 host now uses `PostThreadMessageW` to request
STA shutdown or startup-timeout handling. The request has no HWND and is
identified by a cryptographically random nonzero session token. Only the
owning `GetMessageW` loop handles valid thread messages; stale-session
messages are consumed without mutating COM state. `WM_CLOSE` is posted to the
current HWND only from the owning STA thread.

Caution: Windows modal loops can discard `PostThreadMessageW` thread messages.
This design needs Windows GUI testing under move/resize/modal conditions before
it is considered safe for production. It is still opt-in and never migrates
existing browser profiles. WebView2Loader.dll remains an external dependency.
