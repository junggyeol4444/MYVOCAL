# MYVOCAL Studio — Local-only development

This source bundle is intended for **offline development inside the conversation**.

- No GitHub workflows, repository configuration, branch scripts, commit, push, or pull-request automation are present in this local delivery.
- Existing external repository/account state has not been modified, deleted or disconnected.
- Prior Windows Server CI checks are not equivalent to real Windows 10 or Windows 11 verification.
- Project, audio, voice, character, video and pre-existing browser/WebView2 profiles must not be erased or migrated automatically.
- The user-supplied 66-section product specification is preserved unchanged in `docs/MYVOCAL-66-ORIGINAL.md`.

## Continue developing locally

```sh
cd MYVOCAL-Studio-source
npm test
npm run build:standalone

cd ../desktop
go test ./...
go vet ./...
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w -H windowsgui' -o MYVOCAL-Windows.exe .
```

**Step23:** The per-section genre selected in the songwriting UI changes density and velocity of newly applied *local procedural* MIDI patterns. Existing audio clips, manual MIDI, recordings and video are not changed. To hear a changed section, generate and apply a fresh composition in Songwriter; the preview shown before application remains the unstyled draft. This is not trained AI music generation.

**Step24 — local-only execution enforcement:**
- Removed the OpenAI outbound HTTP proxy route and all API key entry/call UI. Legacy song metadata is retained.
- Removed Google Fonts external CSS. Font rendering falls back to locally installed system fonts.
- Both embedded desktop app HTTP responses and the bundled standalone HTML declare CSP rules that deny off-origin fetches and remote scripts, images and fonts.
- Chromium dedicated app profile launch additionally disables common background networking/sync and component updates. These flags cannot guarantee that an externally installed browser/runtime never contacts its vendor independently.
- The loopback address `127.0.0.1:58319` is a local-only service running on **your computer**, not a remote hosted server. Keep its fixed origin to protect the existing localStorage/IndexedDB project store.
- No .github folder, CI config, Git commands or remote upload tooling included. No remote repository was accessed or changed.
- The local rules-based composer works offline; it is **not** a neural model. User-provided local singing engines can use the local port API, but a trained singing model is **not** bundled.
- Native Windows host needs an installed Edge/Chrome or an opted-in WebView2 Runtime/verified x64 Loader DLL; the Windows EXE is not fully standalone from OS rendering runtimes.

**Release gates:** actual Windows 10 and Windows 11 client launch, WebView2 COM/STA/runtime, save/relaunch, real AI inference and media export remain to be validated.

**Step25 — built-in offline vocal guide:**
- New `src/lib/offlineVocalGuide.js` renders a deterministic, simple formant-vowel guide from lyric-aligned MIDI notes entirely within the browser process; no Python, model, loopback engine, microphone, cloud, user profile or additional download is required.
- The Singing Workbench now has an **offline guide** button even when no voice was registered, and supports WAV playback, download and explicit import as a new separate project audio track. Existing tracks and media remain unchanged until the user clicks **Add to project**.
- Output is mono 22,050 Hz / 16-bit PCM WAV. Playback is **robotic vowels only** and is NOT a learned AI singing voice, lyric articulation or voice cloning.
- Duration is limited to 90 seconds, 128 note cues and 120 total overlapping active note-seconds to cap CPU/memory use. No extra runtime installation is required for this specific feature.
- Automated Linux + cross-compiled Windows x64 tests are not Windows 10/11 native GUI tests.


**Step26 — multiple Korean lyric syllables within one offline vocal guide note:**
- A single lyric/MIDI cue containing multiple Hangul syllables (e.g. "아이" or "고양이") now transitions through corresponding synthetic vowel formants instead of repeating only the first vowel.
- Smooth spectral crossfades keep the oscillator phase continuous and limit clicks at syllable changes; compatibility vowel jamo are also recognized.
- The Singing Workbench shows vowel examples in Hangul for the first several note cues. There is no consonant articulation, pronunciation assimilation, neural model, voice cloning, or remote server usage.
- At most 24 vowel units per note; original duration (90 s), note-count (128), and cumulative voiced work (120 note-seconds) limits remain.
- The test suite covers deterministic WAV output, actual time-varying timbre, rest/silence and limits. A reproducible CLI demo is at `tools/generate-offline-vowel-demo.mjs`.
- The original user-provided requirements and local project/asset/profile storage code were not altered.
- Windows 10/11 real-client GUI + playback tests are not completed.

**Step27 — deterministic consonant-onset hints in the offline guide:**
- Added a short, bounded synthetic onset gesture for selected initial Hangul consonants: plosive-like noise for ㄱ/ㄷ/ㅂ etc., fricative noise for ㅅ/ㅎ, nasal-like tone for ㄴ/ㅁ and liquid-like tone for ㄹ. Initial ㅇ and bare vowel jamo produce no onset gesture.
- This is a simplified **sound cue**, NOT real Korean consonant articulation, phoneme alignment, natural AI singing, or a model trained on any person's voice.
- Onset sounds are deterministic and tapered at both ends (up to 40 ms / at most 28% of a syllable's allocated note segment). Existing vowel blending, pitch, velocity, pauses, maximum 24 syllables/note, 90 seconds and 128 note limits are preserved.
- Singing Workbench now labels its vowel + approximate onset categories in Korean. Previous projects or existing samples are not migrated or overwritten.
- Offline sample command: `node tools/generate-offline-onset-demo.mjs <output.wav>`.
- All work stays inside the local source bundle; no GitHub configuration, upload, commit or merge.

**Step28 — apply saved phoneme timing to the offline guide:**
- The Singing Workbench uses an existing, non-stale saved `MYVOCAL_PHONEME_HINTS` plan when creating an offline guide WAV. Korean syllable onset, nucleus, coda and deliberate silence gaps follow user-edited timeline bounds at 22,050 PCM frames/s.
- Oscillator pitch, MIDI velocity and note duration remain unchanged; onset noise and formant blends are still deterministic procedural cues, **not natural phonetic articulation or AI singing**. Custom phoneme *text labels* are passed only as hints, not pronounced.
- Unsupported Latin/punctuation notes use the legacy evenly-spaced vowel guide. Projects with no saved plan get the byte-for-byte legacy renderer; no migration or profile changes.
- Stale, overlapping or contradictory stored timeline metadata causes a clear error, not silent corruption or overwriting a previous recording. The existing source format remains at version 1.
- New 10-case regression suite: `tests/offline-phoneme-timing.test.mjs`. Reproducible example: `node tools/generate-offline-phoneme-demo.mjs /path/to/demo.wav`.
- The original 66-section user requirements and project, media, voice and browser profile stores remain byte-identical. The local-only bundle still contains no `.git` or `.github` configuration.
- Linux test and Windows x64 cross-compile success **does not** verify real Windows 10/11 client launch, WebView2 STA/COM, or a trained local AI model.

**Step30 — preserve the original song position when importing an offline selection preview WAV:**
- Keep the selection's original starting timestamp and lyric/MIDI source key in temporary render state.
- Convert original seconds into a fractional DAW bar for a separate, opt-in audio track. Validate BPM, position and duration before writing the WAV into IndexedDB. Reject an outdated selection if its source alignment changed.
- No old project data/voice/media/clip records, local browser profiles, AI/remote configuration, or serialized format are migrated.
- Audio clip positions remain bar-based, as in the existing workstation. A later BPM change may move the clip in absolute time. This does not claim professional tempo-independent time locking.
- All GitHub and scheduled integrations remain unused.
- Current overall scope estimate: **about 20% (15–25%)** of the original 66-item product vision, *not* the step count; see `docs/PROJECT-COMPLETION-ESTIMATE.md`.

## Step31 — non-destructive clip editing

The multitrack editor now supports validated, non-destructive clip placement and source-offset / playback-length trims. Both Web Audio playback (including seek) and offline WAV mixdown schedule the same audio segment. Optional JSON fields `sourceOffsetSec` and `playDurationSec` retain legacy project compatibility. Source audio and browser profiles remain unchanged. See `MYVOCAL-Studio-source/docs/STEP31-LOCAL-CLIP-EDITING.md`.


## Step32 (이 대화의 로컬 개발 작업 기록): 오디오 클립 페이드

- 클립 선택 항목에 페이드 인/아웃 길이(초)를 추가했습니다. 값은 `fadeInSec` / `fadeOutSec`에 선택적으로 저장됩니다.
- 기존 프로젝트는 새 필드가 없어도 이전처럼 재생되며, 기존 오디오 파일이나 저장 데이터를 재작성하지 않습니다.
- 두 페이드는 클립 재생 구간에서 선형 볼륨 램프로 처리되고, 재생 시작 위치를 옮길 때에도 원래 타임라인 위치의 게인을 사용합니다.
- Web Audio 실시간 엔진과 WAV 오프라인 내보내기는 동일한 `scheduleClipFade()` 함수를 사용합니다.
- 테스트, 소스, 샘플 WAV는 이 대화의 ZIP으로만 전달합니다. GitHub·원격 서버·자동 예약은 사용하지 않습니다.
- Windows 10·11 실기기 UI/COM 동작은 미검증입니다.


## Step33: 로컬 페이드 곡선
- 클립마다 페이드 인·아웃에 직선, 부드러운 곡선, 등전력 곡선을 선택할 수 있습니다.
- 레거시 프로젝트는 직선형 기본값, 저장소 및 원본 WAV는 변경하지 않습니다.
- JavaScript 266개 테스트 통과, Go·Race·정적 검사, Windows amd64 GUI 크로스 빌드, Python 어댑터 4개 테스트 통과.
- Windows 10·11 실기기 GUI 실행 및 실제 오디오 청취 검증은 아직 완료되지 않았습니다.
- GitHub 자동화·업로드·커밋·병합 및 예약 작업은 사용하지 않습니다.

## Step34: 오디오 클립별 음량 및 음소거
- 오디오 클립마다 0~200% 선형 진폭과 음소거를 선택적으로 저장합니다. 이전 프로젝트는 100%·음소거 해제입니다.
- 페이드와 트랙 볼륨은 유지되며 실시간 재생과 WAV 내보내기에 동일한 클립 GainNode가 적용됩니다.
- 원본 음원/프로젝트/미디어 저장소/브라우저 프로필 코드는 수정하지 않습니다.
- Windows 10/11 실기기 검증은 미완료이며, 상세 검증은 STEP34-로컬개발-검증보고서.md를 참조하세요.

## Step35: 클립별 스테레오 좌우 배치
- 선택적 `panPercent`(-100~100) 필드로 클립을 좌우에 배치합니다. 기존 프로젝트는 0(가운데)으로 유지되며 저장소/미디어 파일을 변경하지 않습니다.
- 재생 및 오프라인 WAV 내보내기에서 공통 Web Audio 팬 연결 함수를 사용합니다. 모노 음원에는 지배 채널 정규화가 적용됩니다.
- 자동 테스트와 Windows 크로스 빌드 범위 및 한계는 `STEP35-로컬개발-검증보고서.md`를 확인하세요.

## Step37: 커서 위치에서 비파괴 오디오 클립 분할
- 클립의 실제 재생 구간 내부에서 두 조각으로 나누며, 기존 오디오 assetId를 공유합니다. 파일 복사·삭제·저장소 마이그레이션은 하지 않습니다.
- 기존 클립의 페이드 곡선을 `fadeReference` 시간 기준으로 보존합니다. 분할 후 자르기/페이드를 직접 수정하면 해당 조각만 로컬 페이드로 전환됩니다.
- 실시간 Web Audio와 WAV 내보내기에 동일한 페이드 계산을 적용하며, 세부 사용법과 제한은 `MYVOCAL-Studio-source/docs/STEP37-LOCAL-CLIP-SPLIT.md`를 참조하세요.
- Windows 10/11 실기기 GUI/오디오 출력 검증과 실제 로컬 AI 모델 검증은 미완료입니다. GitHub·원격 서버는 사용하지 않습니다.

## Step38: 클립 편집 실행 취소 / 다시 실행
- 클립 속성 편집, 복제, 분할, 제거, 오디오 가져오기 변경을 최대 40개까지 메모리에 기록하며 취소·다시 실행합니다.
- 편집한 트랙의 클립 배열만 스냅샷으로 보관하므로 MIDI, 믹서, 다른 트랙, 원본 오디오와 저장소는 되돌리거나 삭제하지 않습니다.
- 현재 프로젝트 ID가 다르거나 외부에서 해당 클립이 수정되었다면 기록 적용을 거부합니다. 프로젝트 변경·새로고침 시 기록은 초기화됩니다.
- Windows 10/11 실기기 GUI/오디오 출력 검증은 미완료입니다. GitHub 및 외부 서버를 사용하지 않습니다.

## Step48: WAV 32비트 IEEE float 내보내기 (로컬 전용)
- WAV 형식에서 기존 기본 16비트 PCM, 선택 24비트 PCM 외에 **32비트 IEEE 754 float**를 선택할 수 있습니다. 샘플레이트(44.1/48kHz), 채널(모노/스테레오), 선택 구간, 무음 제거, 경계 페이드, 피크 보호 및 정규화와 함께 사용할 수 있습니다.
- float 파일은 WAVE format tag **3**, WAVEFORMATEX `fmt` 18바이트, `fact` 샘플 수, `data` 32비트 리틀엔디언 부동소수점을 사용합니다. 정수 PCM은 기존 44바이트 헤더와 양자화 방식을 그대로 유지합니다.
- 16비트 전용 TPDF 디더는 float와 함께 사용할 수 없습니다. float WAV에서 피크 보호를 끄면 절대값 1.0을 초과하는 샘플이 보존되며, 재생기에서 클리핑될 수 있습니다. **float 출력이 원본 음질을 향상시키지는 않습니다.**
- 기존 프로젝트 JSON·미디어·IndexedDB·WebView2 프로필 저장 형식은 변경하지 않습니다. Windows 10/11 실기기와 실제 DAW의 float WAV 읽기 테스트는 미검증입니다. `STEP48-로컬개발-검증보고서.md`를 참조하세요.

## Step49: WAV 출력 샘플 피크·RMS·클리핑 위험 표시 (로컬 전용)
- WAV 내보내기 완료 시 실제 출력 채널·선택 구간·앞뒤 무음 제거·경계 페이드·피크 보호/정규화가 반영된 **양자화 전** 샘플 피크와 RMS(dBFS)를 표시합니다.
- 절대값 1.0을 초과하는 출력 샘플 수를 검사하여 정수 PCM의 실제 클리핑 위험과 float WAV 재생기의 클리핑 가능성을 별도로 경고합니다. 샘플의 NaN/무한대도 탐지합니다.
- RMS는 전체 출력 샘플의 제곱평균제곱근이며, LUFS/트루 피크/청감 품질 분석이 아닙니다. TPDF 디더 및 최종 정수 양자화 이전에 측정합니다.
- WAV 파일 자체와 프로젝트 저장 형식·기존 미디어·IndexedDB·WebView2 프로필 관리 코드는 변경하지 않습니다. 신규 검사는 렌더된 오디오 버퍼를 읽기만 합니다.
- `MYVOCAL-Studio-source/docs/STEP49-LOCAL-WAV-EXPORT-METER.md` 및 `STEP49-로컬개발-검증보고서.md`를 참고하세요. Windows 10/11 실기기 실행은 아직 미검증입니다.

## Step76: 기존 Step75 연출 계획 기능의 누적 확장
- `MYVOCAL-Studio-source/docs/STEP76-MV-DIRECTION.md` 참고.
- 새 `src/lib/mvDirection.js`는 프로젝트의 기존 `mvMode`, `presence`를 실제 수동 스토리보드 타임라인에 연결하여 공연/스토리 역할과 인물 등장 **목표 비율**을 계산한다. 장면마다 역할 오버라이드를 선택적으로 저장할 수 있다.
- 기존 미디어·프로젝트를 삭제하거나 마이그레이션하지 않는다. 기존 장면 JSON 스키마도 그대로 보존한다. AI 영상 생성·Lip Sync 단계는 선행 구현하지 않았다.

## Step77 — AI 장면 정지 이미지 (로컬 ComfyUI 연결)
- 오직 77단계. `MYVOCAL-Studio-source/docs/STEP77-AI-SCENE-IMAGES.md` 참고.
- Windows 앱의 세션 보호 루프백 `/api/images/health`, `/api/images/generate` 연결: 사용자가 별도 실행한 ComfyUI의 표준 SD 체크포인트로 실제 이미지 생성이 가능하도록 연결한다. 외부/클라우드 전송 경로 추가 없음.
- 스토리보드의 장면/캐릭터 외형 텍스트/Step76 연출로 프롬프트 구성; 이미지 바이트는 IndexedDB에 보관하고 프로젝트 장면 메타데이터에만 Asset ID 추가. 이미지 출력과 전체 프로젝트 번들 백업·복원에 포함.
- 실제 GPU+체크포인트 추론과 Windows 실기기 테스트 **미검증**. ComfyUI 및 AI 모델은 별도 설치가 필요하다. 78단계 영상 생성은 미실시.

## Step78 — 로컬 SVD 장면별 AI 영상 클립

- 계획대로 78단계만 추가: Step77의 장면 이미지 → 사용자 구동 ComfyUI SVD/SVD-XT 이미지-투-비디오 모델 → 애니메이션 WebP 클립 생성·저장·내보내기.
- Go 데스크톱 브리지 `/api/video/health`와 `/api/video/generate`는 localhost 세션 보호, 필수 노드/체크포인트/이미지/영상 형식 검증을 적용함. 외부 전송 없음.
- 장면별 `videoClipAssetId`와 `videoGeneration`을 추가하고 기존 IndexedDB에 저장. 기존 프로젝트 백업/복원 시 영상 미디어 포함. 장면/이미지 변동 시 생성 중 자동 적용 차단.
- Step78 EXE의 실제 로컬 모델 사용에는 ComfyUI 및 SVD 체크포인트를 별도로 설치해야 하며 **본 환경에서 실제 GPU 추론/Windows 실기기 실행은 미검증**.
- MP4/음악 결합/장편 MV 최종 렌더링, Image-to-MV(79), Character-to-MV(80)는 구현하지 않음. 기본 결과는 애니메이션 WebP.
- 상세: `MYVOCAL-Studio-source/docs/STEP78-AI-SCENE-VIDEO.md`.

## Step79 — Image-to-MV (실제 사람 사진 기반 장면 제작)

- 지정된 **79단계만** 진행했습니다. 본인 또는 사용 허가를 확인한 실제 사람 프로필 사진 PNG/JPEG를 로컬 ComfyUI `img2img`에 실제 입력하고, 장면마다 생성된 이미지를 기존 Step78 SVD 짧은 WebP 클립 생성과 연결했습니다.
- 선택 장면 또는 미배치/동일 사람 장면을 순차 처리합니다. 기존 다른 캐릭터 장면은 전체 생성 시 건드리지 않으며 이미지·영상·원본 사진과 기존 음악/목소리 데이터는 별도 Asset으로 보존합니다.
- 새 `personMv` 메타데이터를 백업·복원 시 원본 Asset ID와 함께 재매핑하고, Step77/78 사진 미연결 프로젝트의 이미지 키를 변경하지 않습니다.
- 외부 AI 호출 없음. ComfyUI 모델 및 Windows 10/11 실기기 실제 추론/얼굴 유지 품질은 **미검증**. 실제 영상 길이/음악 결합/MP4/Lip Sync/80단계 Character-to-MV 기능은 포함하지 않습니다.
- 사용법과 제약은 `MYVOCAL-Studio-source/docs/STEP79-IMAGE-TO-MV.md`를 참고하세요.

## Step80 — Character-to-MV (등록 2D 캐릭터 → 애니메이션 PV 클립)

- 사용자 등록 2D 캐릭터 PNG/JPEG를 **실제 로컬 ComfyUI 이미지 입력**으로 사용합니다. Step79의 본인·허가받은 실제 사람 사진 모드와 별개입니다.
- Video Studio의 Step77(이미지 모델 연결) 및 Step78(SVD 영상 모델 연결) 후 Step80 패널에서 선택 장면 또는 같은 캐릭터/비지정 장면을 순차 제작합니다. 장면 시간·스토리보드와 연결해 애니매틱에서 짧은 생성 클립을 표시합니다.
- 소스: `MYVOCAL-Studio-source/src/lib/characterToMv.js`, `src/pages/Video.jsx`, `desktop/person_mv.go`의 재사용 브리지 및 `/api/character-mv/generate`.
- 필요한 PC 측 별도 설치: 로컬 ComfyUI, SD 호환 체크포인트, SVD/SVD-XT 체크포인트. **모델 포함 안 됨; 실제 GPU 추론·Windows 실기기 테스트 미검증**.
- 원본 영상·원본 그림·기존 프로젝트 유지. 2D 레이어 분석/동작(81~82), Lip Sync(85), 완성 MP4 합성(98)은 진행하지 않았습니다.

자세한 사용·제약 사항은 `MYVOCAL-Studio-source/docs/STEP80-CHARACTER-TO-MV.md` 참고.
