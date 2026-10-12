# Step03j — WebView2 callback owner isolation (3단계 부분 구현)

This iteration changes only the experimental, opt-in Windows WebView2 host.
The browser host remains the default; original project, music, vocal and video
source files, browser profiles and WebView2 profile are not migrated or deleted.

A COM callback must belong to the WebView2 session that registered its handler.
The handler-to-owner association is kept in a Go-only synchronized map, not in
the COM-facing handler structure (which must not embed unpinned Go pointers).
Environment/controller completions from a retired session are rejected; late
navigation callbacks fail closed. Handlers and their ownership entries remain
rooted until process exit because asynchronous COM may still hold references.

Windows-only mock COM tests cover callback ownership, stale environment and
controller completion, and stale navigation cancellation. These tests have been
**cross-compiled, not executed on Windows**. Actual WebView2 GUI/COM/STA,
profile save/reopen, and media persistence remain unverified. The official
WebView2Loader.dll is not bundled and must be obtained from Microsoft's SDK
using the supplied hash-checking helper; the WebView2 Runtime is separate.
