# MYVOCAL Studio — native Windows implementation (redevelopment, test branch)

Original project requirements: `docs/MYVOCAL-원본66개-기획안.md`. The 8 launch functions match Section 2. This is a **native Win32 GUI application**, not a website. No `net/http` import, Edge/Chrome invocation, browser app mode, WebView2 or local HTTP server in the new native executable.

Build on Windows with Go >=1.23:

```powershell
cd native
go test ./...
go build -trimpath -ldflags='-H windowsgui' -o MYVOCAL-Native-Windows.exe .
./MYVOCAL-Native-Windows.exe
```

Project backup format: `MYVOCAL_PROJECT_BACKUP` with `formatVersion:2`. Unrecognized fields in existing `.myvocal.json` backup files are preserved. Existing music/AI/video assets in the original web-era project are NOT discarded or rewritten; import/save tests must remain lossless. Default storage: `%LOCALAPPDATA%\MYVOCAL Studio\NativeProjects` (isolated from earlier browser storage). All actions use local files. Save writes a `.bak` copy of the previous project.

## Functions currently verified in native implementation

- Native Windows application window and 8 plan Section-2 areas; edit project titles/prompts/lyrics and save/open, persist storyboard/voice/character/learning metadata.
- Offline **rule-based** editable 4-track MIDI demo (not AI composition), standard MIDI export, sound-generating WAV preview, SRT from storyboard, lyrics TXT export, `.myvocal.json` backup.
- Existing JSON backup unknown field and MIDI track preservation. No implicit migration of browser IndexedDB or deletion of browser profile.
- Windows GUI automated click/edit tests in `.github/workflows/native-windows.yml`, with Windows 2022/2025 matrix, source unit tests and artifact uploads.

## Not yet completed (do not misrepresent as complete)

The native app is a **foundation for redevelopment**, NOT implementation of all 66 plan features. AI voice training, licensed model execution, DAW waveform timeline, multitrack audio rendering, image/video/MP4 generation, character motion and lip sync, provider switching and all end-to-end workflows require additional code and real installed engines. Original Step100 `.exe` retains its previous browser-based architecture; use `MYVOCAL-Native-Windows.exe` for the native prototype. Do not merge until all requirements and Windows user acceptance are actually verified.
