# Step03l — app storage ancestry / preference redirection guard (3단계 미완료)

Step03k checked only the leaf of DesktopProfile/NativeWebView2Profile. In this
iteration, all **existing** directory components below the volume root are
checked with Lstat before reading the profile, including LOCALAPPDATA and the
MYVOCAL Studio app root. On Windows, GetFileAttributesW also rejects any
FILE_ATTRIBUTE_REPARSE_POINT, including reparse tags not surfaced as symlinks.
A missing component remains allowed for a new installation, and a second check
runs after creating the app root/profile. The browser/host preference readers
reject linked or non-regular preference files without modifying their targets.

A legitimate redirected Windows user directory may now fail closed and require
manual review; do NOT delete a junction or migrate user data to bypass the
check. The filesystem can still change between check and open (TOCTOU). No
handle-based path identity guarantee is claimed. No existing project, profile,
localStorage, IndexedDB, audio/image/video or frontend file is altered.

Linux Go regression tests exercise redirected app root and ancestor, ordinary
paths, file ancestors and linked preference files. Windows-only reparse checks,
GUI, real WebView2 COM/STA, save/reopen and actual AI inference are NOT verified
by Linux cross-compilation. Official WebView2Loader.dll remains external.
