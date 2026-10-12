# MYVOCAL Studio — Step 03d (experimental native host hardening)

**Status:** Step 3 remains partial; Windows native GUI has not been run on a Windows machine.

## Changes compared with Step03c

1. Native WebView2 loader is loaded using an **absolute path from the EXE directory**, rather than an implicit DLL search path. It checks that the Microsoft Edge WebView2 Runtime can be discovered before starting a native window. The native mode is opt-in; the default Edge/Chrome app mode is unchanged.
2. The native WebView2 top-level navigation is restricted to the fixed `http://127.0.0.1:58319` origin and internal `about:blank` startup page. Unmanaged popup requests are blocked. The event handlers are untested on Windows and should not be relied on as a production security boundary yet.
3. Concurrent launchers now retry a partially written `launcher-host.json` for up to 0.5s, without overwriting damaged settings.
4. Added pure Go regression tests for navigation allowlisting and preference creation race.
5. Added an opt-in PowerShell script to acquire the official Microsoft x64 WebView2Loader.dll from the pinned Microsoft.Web.WebView2 NuGet package; **not downloaded or bundled** in this build. The Microsoft WebView2 Runtime is a separate installation requirement.
6. Added manual Windows GUI verification scripts; no Windows GUI result has been asserted.

## Preserve existing user data

- Default host is still Edge/Chrome app mode and the existing `DesktopProfile` is untouched.
- The native host requires `MYVOCAL_DESKTOP_HOST=webview2` and a new isolated `NativeWebView2Profile`.
- No automatic migration or deletion of localStorage, IndexedDB, media, or preferences.
- The port is still `58319` and the origin remains stable.

## Dependencies for the native preview

- Windows 10/11 x64, WebView2 Runtime installed.
- Official Microsoft x64 `WebView2Loader.dll` adjacent to EXE. See `Install-WebView2Loader.ps1` in release for optional retrieval from the official Microsoft.Web.WebView2 NuGet package (v1.0.4258.31). The script must be run on a Windows machine with Internet access and is **not tested here**.
- Never use the preview with irreplaceable user projects. Use `Windows-WebView2-Preview.ps1 -IsolatedFolder <separate folder>`.

## Verification caveats

- Go/Linux unit tests, Linux race test, Linux `go vet`, JS unit tests, Linux server smoke, Windows x64 cross-build passed.
- **Windows-target `go vet` without exclusions reports existing and new `unsafe.Pointer` COM interop warnings**; `-unsafeptr=false` passes, but that does not resolve pointer-lifetime safety.
- COM callback lifetimes and Win32 marshaling are still experimental; Windows native GUI, audio, mic, storage persistence, file downloads, and permissions are unverified.
- Do not mark Step 3 complete until a real Windows GUI and storage restart test passes.
