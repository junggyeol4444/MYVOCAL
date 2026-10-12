# Step03e desktop host safety patch

This update preserves the Step03d browser-host default and existing user data.

Changes:
- Publish `launcher-host.json` only after fully writing and fsyncing a temporary file. An atomic hard link creates the final name without replacing an existing preference. Fail closed when unsupported.
- Pin COM callback handler and vtable allocations with `runtime.Pinner` until the STA message loop ends and COM subscriptions are removed; remove Go state pointers from the COM-facing handler layout.
- Add two regression tests for concurrent preference publication and corruption preservation.

Cross-compilation and Linux unit/smoke tests pass. Windows-target `go vet` still reports 9 unsafe pointer warnings; native WebView2 GUI and storage behavior are unverified on Windows. The native preview remains opt-in and requires an official WebView2Loader.dll and Runtime.
