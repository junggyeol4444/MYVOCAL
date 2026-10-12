# MYVOCAL Studio source import status — Step19

**Status: INCOMPLETE. Do not merge PR #1 into main yet.**

- Verified local original application source: **166 files** (root-relative, excluding release/evidence outputs).
- Original source files verified on the GitHub import branch: **32/166**.
- Original source files still NOT uploaded: **134/166**.
- The original **66-section** user product requirements are in `docs/MYVOCAL-66-ORIGINAL.md`. Their Git blob SHA is `129e0d3b9dba97701ef18bfae9aad04cee6fb0cc`, matching the local original byte-for-byte.
- Separate original detailed **100-step roadmap is not supplied**; do not synthesize it.
- Step19 changes: `src/lib/base64Safety.js` now validates Base64 in bounded chunks without unbounded regex recursion, rejects non-canonical padding; two regression tests added in `tests/base64-safety.test.mjs`.
- Local validation: **142/142 JavaScript tests**, Go tests, Go race, Go vet, Windows-target Go vet, Windows amd64 GUI and mock-COM cross-build, Python adapter tests **4/4**.
- GitHub Actions is **not verified green**, because remaining source files have not been uploaded.
- Verified current main-branch Windows 10 and Windows 11 real-client tests: **none**. COM/STA GUI, WebView2 Runtime, official x64 Loader DLL, real audio/MV AI execution and persistence across restarts require Windows real-device validation.
- The working container cannot resolve `github.com`; individual GitHub connector commits are supported. A split text/base64 handoff manifest for all 134 outstanding original source files was generated locally and CRC/Git-blob validated for a future connector transfer. It has **not** itself been uploaded as source.
- Never commit compiled EXEs, private projects, media or profiles, secrets, temporary logs or evidence folders to source-control.
- Preserve the user's existing audio, project, voice and video data, stable origin and pre-existing Edge/Chrome/WebView2 profiles.
- Continue independent development while waiting for Windows real-device tests. Hourly scheduler remains disabled until user explicitly says `예약`.

## Release/merge gates

1. Import all 134 remaining source files into `myvocal/step06-import`.
2. Check Git blob hashes against the original 166-file manifest.
3. Confirm GitHub Actions passes source inventory, npm tests, Go tests/vet, Windows cross-compile.
4. Inspect the PR for binary/personal information and API keys.
5. Only then consider merging PR #1 into `main`. Windows 10/11 client checks remain separate release gates.
