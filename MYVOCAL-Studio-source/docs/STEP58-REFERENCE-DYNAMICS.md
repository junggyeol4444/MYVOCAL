# Step58: Reference energy-guided MIDI velocity (offline)

## Scope
This extends the actual Step57 source. It does not replace any project, imported media, IndexedDB files, browser profile or existing MIDI function.

1. Open **Learning Studio → Reference Analysis** and generate a report (Step57) from audio you classify as **Reference-only**. Download the JSON report.
2. Open **Learning Studio → Music Learning → MY MUSIC STYLE**. Import an authorized Step54 `my-music-style` profile JSON.
3. Optional: import the Step57 JSON report into **Reference 다이내믹스 (Step58)**, enable velocity guidance and set strength 0–100%.
4. Generate and download a MIDI Format 1 arrangement. Disable the checkbox to create the exact Step56 preset arrangement without reference guidance.

## Security and musical boundaries
- No audio or source PCM is imported by this function: it consumes ONLY a validated `reference-signal-report` with `trainingAllowed:false`, `trainingPerformed:false` and `audioIncluded:false`.
- The guide **does not** copy original pitch, notes, harmonies, BPM, chords, melody, rhythm or instrumentation (these data do not exist in the report). It adjusts **newly composed, preset MIDI note velocities only**, using the 32-bin energy curve across the arrangement timeline.
- Strength 0 leaves the original velocities. Relative loud/quiet variation is bounded to a gain between 0.65 and 1.25 at full strength and every MIDI velocity remains within 1–127.
- A silent Reference curve leaves velocities unchanged. Missing or malformed reports are rejected. No original music or training is stored in the exported MIDI.
- The feature is **not** a generative AI model or music-style learning, and does not determine copyright similarity or musical qualities.
- Reference JSON import is capped at 100 KiB, locally decoded by the browser/WebView2, and never uploaded. Exported MIDI is downloaded locally.

## Developer API

`applyReferenceEnergyGuide({arrangement,referenceReport,strength})` in `src/lib/referenceArrangementGuide.js` returns a detached, immutable `deterministic-style-arrangement` retaining all original part/pitch/timing/duration information. It can be passed directly to the existing `exportArrangementMidi`.

Testing: `node --test tests/reference-arrangement-guide.test.mjs`, and `node --test --test-concurrency=1 tests/*.test.mjs`.
