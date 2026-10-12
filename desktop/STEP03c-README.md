# MYVOCAL Step03c — Windows host architecture preview

## Default and compatibility

The existing Edge/Chrome `--app` host remains the default. Existing `DesktopProfile` (including IndexedDB and localStorage), the loopback origin `http://127.0.0.1:58319`, the app's standalone HTML, and all project files are untouched by this change.

`launcher-host.json` pins the selected host to protect profile-specific storage. Invalid host preferences are never overwritten. The new WebView2 host **does not read or migrate** the existing Chromium profile; attempting to switch when legacy data exists is refused.

## Experimental native host (Windows only; not tested on a Windows machine)

`MYVOCAL_DESKTOP_HOST=webview2` opts into the native Win32 WebView2 host for an **isolated new profile**. The native host uses a dedicated `NativeWebView2Profile` folder and the same fixed loopback origin. It requires the Microsoft WebView2 Runtime **and** the x64 `WebView2Loader.dll` (from Microsoft's official WebView2 SDK package) alongside the EXE. This DLL is **not included** in the distribution. The native host will fail closed rather than switch silently to a browser profile.

`Windows-WebView2-Preview.ps1` runs the EXE in a separate test LOCALAPPDATA folder. Do not use this experimental host with valuable projects until Windows GUI, audio, IndexedDB, and restart testing passes.

## Build and test

```
go test -count=1 ./...
go test -race -count=1 ./...
go vet ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -H windowsgui' -o MYVOCAL-Step03c.exe .
```

## Open verification work

- Native WebView2 window has **not** been executed on Windows. Only Windows cross-compilation has passed.
- WebView2Loader.dll and WebView2 Runtime are external prerequisites; their installation and licensing are not automated.
- Native navigation restrictions, accessibility, multi-window behavior, downloads, audio input/output, IndexedDB and restart persistence require real-device testing and further hardening.
- Do not count Step 3 complete until native host and real Windows GUI/storage are validated.
