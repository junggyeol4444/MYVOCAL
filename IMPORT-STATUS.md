# MYVOCAL Studio source handoff

This is an **import branch**, not a completed import.

- Source baseline in the ChatGPT workspace: `MYVOCAL-Studio-Step06-Partial.zip` (verified accessible, 166 archive members).
- The existing `main` branch initially contained only `README.md`.
- Keep the original `main` content untouched until full source import and tests are verified.
- Expected source directories within the archive: `source/desktop/`, `source/MYVOCAL-Studio-source/`, `source/tools/`. They should be committed without the leading `source/` directory.
- Preserve the existing projects, audio, voice and video features and do not migrate/delete browser or WebView2 profiles.
- The original 66-item plan and detailed 100-step roadmap are not yet verified in the archive. Do not reconstruct them.
- Windows 10/11 real GUI/WebView2 COM, save/relaunch, real AI, loader dependency and TOCTOU tests remain pending.
- GitHub Actions workflow is added as a **configuration only**; tests should not be called passing until a full-source run succeeds.
- Do not commit compiled EXE, user data, private browser profiles, credentials, or temporary evidence directories.
