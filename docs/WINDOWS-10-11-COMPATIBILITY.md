# MYVOCAL Studio Windows 10 / Windows 11 compatibility policy

**Target:** Windows 10 x64 and Windows 11 x64, both supported. Go desktop module is compiled for `windows/amd64`; no Windows 11-only API may become a required dependency.

**Current reality:** GitHub-hosted `windows-2022` and `windows-2025` are Windows Server runners; they are only automated ABI/build/regression indicators. **They are not Windows 10 or 11 user-device tests.** No conclusion of actual client OS compatibility may be drawn from green runner tests alone.

**Real-device release gates (both OS versions, not yet performed):**
1. Launch unsigned EXE and check application window/loopback server; test Edge or Chrome app-mode fallback when native WebView2 is unavailable.
2. Native WebView2 (opt-in isolated profile only): official x64 Loader DLL provenance/version, WebView2 Runtime presence, STA COM callbacks, window close, repeated relaunch.
3. New and existing projects: create, edit, save, quit, relaunch, reload, export. Test audio, images and video. Compare checksums of project data and media.
4. Confirm Chromium/WebView2 pre-existing data/profiles are not overwritten, deleted or automatically migrated.
5. Verify Windows 10 vs 11 path redirection, junctions, long paths, permissions, DPI scaling and required runtimes.
6. Check 64-bit architecture and Windows 10 baseline API requirements; reject unsupported architecture with a clear message.
7. Run local AI provider and separately an actual AI model where configured, without marking mocked inference as real.

**Feature specification:** `docs/MYVOCAL-66-ORIGINAL.md` is the original user-provided 66-section product plan, copied byte-for-byte. It is **not** the unavailable 100-step detailed roadmap.

**Pending:** Real Windows 10+11 devices, actual COM/STA and loader behavior, saved projects/media, AI inference. Keep building later independent steps while these are pending.
