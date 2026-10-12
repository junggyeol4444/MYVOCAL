# Windows 10 and Windows 11 support policy

Target both **Windows 10 x64** and **Windows 11 x64**. Preserve browser/WebView2 user profiles, existing project/media data and music/voice/video features.

GitHub-hosted windows-2022 and windows-2025 matrix runners are Windows Server, **NOT Windows 10/11 clients**. Passing these runners proves only regression/build validation, not user-device compatibility.

Both real client OS versions need manual QA:
1. Start GUI; verify Chromium fallback and separately opt-in isolated WebView2 mode with trusted x64 Loader DLL and Runtime.
2. Verify COM STA callbacks and shutdown, repeated restarts and DPI.
3. Create/save/quit/relaunch projects and audio/image/video with checksum preservation.
4. Verify pre-existing IndexedDB, localStorage and browser/WebView2 profile compatibility; never auto-migrate or delete existing data.
5. Check legitimate junctions, redirection and reparse points, directory permissions, and path TOCTOU.
6. Verify actual AI engine execution separately from mocks.

The user has supplied the **original 66-section product specification**. SHA-256 of its uploaded Markdown source: `8c061276b9cd6cf09a66541a1f335c8a5ab0aec0eba87f2b9f0a7cf3b7279a07`. The detailed original 100-step roadmap is still not available and must not be reconstructed. The full 66-section Markdown is preserved verbatim in the Step10 local source ZIP, pending GitHub upload.

This branch is incomplete, and main must not be merged until the original full app source has been imported and tested.