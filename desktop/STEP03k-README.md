# Step03k — dedicated profile path integrity (3단계 부분 구현)

This iteration builds on Step03j. No existing user profile, localStorage,
IndexedDB, project, audio, image, video, or frontend file is migrated or deleted.
The default remains the existing Edge/Chrome app-mode host.

`inspectDedicatedProfile` uses `os.Lstat` to reject a symlink/junction or
non-directory at either dedicated profile path before the host reads or opens
that profile. The native host and Chromium launch paths recheck after directory
creation. A rejected profile is left untouched and must be inspected manually.
The Windows read-only preflight reports reparse points on both profiles.

Automated tests exercise an existing project file, linked profile rejection,
regular-file rejection, missing profile and normal browser-profile selection.
The link test skips only if creating a symlink is unavailable. These checks
reduce accidental profile redirection, but a concurrent attacker changing the
path after validation remains a TOCTOU risk; no Windows junction or GUI test
has been executed in this Linux environment.

Windows GUI, real WebView2/COM/STA, mock COM test execution, PowerShell
preflight execution, and project/media save-close-reopen remain unverified.
The official WebView2Loader.dll and runtime are not bundled.
