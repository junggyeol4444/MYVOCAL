# Step03f — Windows COM ABI hardening (experimental)

Step03e -> Step03f changes:

- Represent incoming native COM interface pointers and Windows callback parameters as typed pointers instead of `uintptr` values reinterpreted as Go pointers. Avoid `uintptr`→`unsafe.Pointer` conversions that triggered `go vet` on Windows.
- Use `nativeCOMArg` to keep Go-owned temporary buffers as typed, GC-reachable pointers until the actual `syscall.SyscallN` boundary. Pin them for each synchronous call, and use `runtime.KeepAlive` after the syscall.
- Conservatively retain asynchronous COM callback objects and their `runtime.Pinner` roots until this **one-shot launcher process exits**. This bounds the lifetime to the launcher process, at the cost of retaining a small amount of memory after the GUI closes, to avoid premature unpinning if a completion callback races shutdown.
- Add Windows-only mock COM callback tests (`native_com_windows_test.go`), compile them to a Windows test executable and include `Windows-COM-ABI-Test.ps1` to run them on a real Windows machine.
- Verify official NuGet package SHA-512 metadata before extracting the optional WebView2Loader.dll in the Windows helper script. The DLL and WebView2 Runtime are **not bundled**.

**Verification limitations:** Passing Windows cross-compiled `go vet` and producing a Windows test binary do not prove native COM callbacks work. Windows GUI, WebView2 runtime loading, callback order, storage, media, and actual restart must be tested on Windows before enabling native mode by default. Browser mode remains the default, fixed origin is unchanged, and no project data is migrated or deleted.
