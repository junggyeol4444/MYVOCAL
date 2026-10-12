# Step03g — WebView2 asynchronous startup and shutdown hardening

- `native_lifecycle.go` implements an STA-owned lifecycle (starting/running/closing), with Linux-runnable regression tests. Late callbacks cannot revive a closed window.
- `native_webview_windows.go` ignores environment/controller completion callbacks after close, and posts a private WM_APP timeout message from a 45-second timer if initialization stalls. All lifecycle mutations stay on the COM STA thread.
- Window messages only affect the matching owned HWND; COM callback/vtable pins are still conservatively retained for the one-shot process lifetime.
- `native_com_windows_test.go` adds a Windows-only late-callback test, **cross-compiled only** until run on Windows.
- Existing browser and native profiles are not deleted, copied or migrated. The default remains Edge/Chrome.
- `WebView2Loader.dll` and the installed Runtime are still required for experimental native preview; Windows GUI and real storage persistence remain unverified.
