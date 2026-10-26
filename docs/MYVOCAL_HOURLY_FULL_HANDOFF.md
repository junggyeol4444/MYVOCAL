# MYVOCAL Studio — 예약 자동 개발 전체 인수인계 복구 인덱스

## 2026-10-26 20시 예약 개발 — 기존 전체 기록 보존
- **시작 main HEAD**: `323e1c5326dd569ac0a4b82dd12c7906ce7a0487`.
- **개발 내용**: 기존 DiffSinger 실제 학습 완료 후 Voice Library에 경로와 사전만 기록하던 흐름을 확장하여, 공식 학습 작업의 실제 Acoustic `.ckpt/.pth` 가중치와 한국어 발음 사전을 다운로드한 뒤 SHA-256을 기록하고 IndexedDB에 **두 신규 자산을 한 트랜잭션으로 추가**한 다음 모델 레코드를 등록. 원본 설치 폴더·기존 사용자 녹음·기존 가중치는 변경하지 않음. 새 자산 저장/등록 실패 시 신규 자산 ID만 롤백. 이전 경로만 등록된 모델 기록과 호환.
- **실제 UI**: 기존 Singing Workbench DiffSinger 학습 패널의 Voice Library 등록 버튼이 위의 실물 보존 경로를 사용. Voice Studio에 보존된 가중치를 SHA-256 확인 후 개별 다운로드하는 버튼 추가.
- **백업/삭제 참조 연결**: 프로젝트별 백업과 복원 자산 ID 재매핑에 `checkpointAssetId` 추가. 사용자 확인을 거친 기존 Voice 삭제에서 체크포인트가 누락되거나 다른 프로필의 공유 자산이 삭제되지 않도록 참조 안전성 확장. 프로젝트별 백업 150MiB, 전체 ZIP 256MiB 용량 한계는 기존대로 유지하며 초과하는 가중치는 개별 파일 다운로드 필요.
- **기능 커밋**: `2dc9d4ed678ce53a6ecb529d2762179b37560aaa`, `2ad20bc34e70634bc094e1916c5186dd3e161a07`, `419516b2fbff3685a76cc81b79c7f356a770a377`, `bbf527240750f30cabf4ce14df9910adfb1e9251`, `e86c1d7fc7b4161d64027e5b776729c5ad6c80a1`.
- **수정/추가 파일**: `MYVOCAL-Studio-source/src/lib/diffSingerCheckpointArchive.js` (신규), `MYVOCAL-Studio-source/src/components/DiffSingerTrainingPanel.jsx`, `MYVOCAL-Studio-source/src/lib/projectBundle.js`, `MYVOCAL-Studio-source/src/pages/Voices.jsx`, `MYVOCAL-Studio-source/src/lib/voiceDeletionSafety.js`.
- **아직 하지 않은 것**: 전체 개발 미완료로 JS/Go 테스트, CI, Windows 10/11 x64 EXE GUI, 실제 GPU DiffSinger 학습/추론 검증 미실행. 신규 기능을 실사용 성공이나 음질 검증 완료라고 주장하지 않음.
- **다음 개발 우선순위**: 기존 원본 66개 요구와 최신 main을 재확인하고, 실제 한국어 가창 모델의 장편 추론 연결, MusicGen 6개 독립 원천 WAV의 신뢰 가능한 장편 생성, 캐릭터/실사 MV·립싱크와 Music+MV 원클릭 완전 통합의 미완성 기능을 이어 개발. 개발 완료 후에만 전체 검증→수정→재검증. 다른 저장소·예약·원본 파일을 임의 수정하지 않음.


## 2026-10-26 19시 예약 개발 — 원본 인수인계 원문 보존
- **기능 반영 직후 main HEAD**: `7b5f48a0cf6ff81d8c990b0e818434b63687b044`. 시작 `dd84dbd3bcfbdd71a6df499763a5f3194f8b8e2c`.
- **실제 개발**: 기존 12개 가창 WAV→DiffSinger 학습 ZIP에 한국어 음소 시간 검수 JSON 생성·재입력·실제 WAV 길이/음소 순서 대조 기능을 추가. 기존 Windows EXE Singing Workbench GUI에 템플릿 내려받기·검수 JSON 선택·권한 확인 연결. Go 공식 DiffSinger 학습 경로에 검수된 ZIP의 WAV/CSV/DS/라벨 정합성 검사를 추가.
- **수정 소스**: `MYVOCAL-Studio-source/src/lib/singingTakeDataset.js`, `MYVOCAL-Studio-source/src/components/SingingTakeDatasetPanel.jsx`, `desktop/diffsinger_training.go`. 기능 커밋 `9ebbcdd0f907b252877c2809441c04793c292b51`, `9f3fdadafa3454e3b6b1d878344f606da0ff1ea9`, `0fbd79997e9f8f2fd2e949620f311c40ea7e557b`, `3f3fe6d96398fc87e6c99bebf1c6f55dcdeaf5d3`, `7b5f48a0cf6ff81d8c990b0e818434b63687b044` (검수 시간 정밀도 보존).
- **전체 누적 인수인계**: 현재 대화의 `MYVOCAL_20261026_매시간개발_전체누적인수인계.md` 원문 1,264,489바이트를 그대로 접두사 보존하고 이번 회차를 추가해 1,269,243바이트. SHA-256 `f06ab0574cd21e620dd16d192bd397268b3d4c8036da646cdb99e997a834eb09`.
- **검증 보류**: 개발 미완료이므로 Go/JS 테스트·CI·Windows 10/11 EXE GUI·실제 GPU 학습/추론은 실행하지 않았음. 사용자가 직접 검수하는 음소 길이 기능이며 강제 정렬 AI 성능을 주장하지 않음.
- **다음 회차**: 최신 main과 원본 66항을 다시 확인한 뒤 실제 한국어 음색 학습/가창, 장편 원천 신경망 6 stems, 캐릭터·실사 MV·립싱크, Music+MV 원클릭의 미완성 핵심 개발을 먼저 계속함. 원본 자산 보존, 다른 예약·저장소 수정 금지.


## 2026-10-26 18시 예약 개발 최신 회차 — 기존 인수인계 원문 유지
- **main HEAD (기능 소스 완료 시점):** `62468addb31cc2cb5f113bca1c834c05762c3bd0`. 시작 시 `8fcdafba29fb959b00777be61ea00bfe2a457649`.
- **이번 구현**: 실제 사용 권한 있는 한국어 Singing WAV 최대 12개를 서로 다른 원곡 MIDI 시작 초에 매핑하여 DiffSinger 학습용 한 ZIP으로 내보내는 다중 녹음 학습 데이터 기능. 녹음별 PCM 구간·음소 라벨·MIDI 타이밍·manifest 기록과 Windows EXE Singing Workbench의 추가 WAV 다중 선택/시각 입력 UI를 기존 프로젝트에 연결. 단일 WAV 호환 유지.
- **변경 소스**: `MYVOCAL-Studio-source/src/lib/singingTakeDataset.js`, `MYVOCAL-Studio-source/src/components/SingingTakeDatasetPanel.jsx`. 기능 커밋 `f4e8ab8dfc2666b06a6c7c1e96dd61ecc78876f0`, UI 커밋 `3081a49c8997b41c1ff4a91583bec06e165cd899`, TSV/CSV escape 정리 `62468addb31cc2cb5f113bca1c834c05762c3bd0`, 중간 구간 다중 테이크 GUI 시작초 연결 `462f76f99118adea3d4b55786d70634b47c8093b`.
- **누적 원문 Library**: `/MYVOCAL_20261026_매시간개발_전체누적인수인계.md` (1,264,489바이트, 기존 1,260,056바이트 접두사 그대로 보존). 이번 회차의 상세 기록을 끝에 추가했다.
- **검증 보류**: 사용자의 개발 전부 완료→검증→수정→재검증 순서에 따라 이번 회차는 단위테스트/CI/Windows 10·11 GUI/GPU DiffSinger 실추론을 실행하지 않았다. 기능 코딩과 main 반영만 완료했고 실제 가창 학습·음질·EXE 실사용 성공을 주장하지 않는다.
- **다음 회차**: 최신 main·원본 66항·이 인수인계 원문을 다시 확인하고 실제 본인 음색 학습→한국어 신경망 Singing→장편 MusicGen/6 stems→SD/SVD/립싱크 Music+MV의 남은 핵심 통합 기능을 기존 소스에서 계속 개발한다. 다른 프로젝트·예약/기존 원본/사용자 자산 변경 금지.

## 2026-10-26 17시 예약 개발 최신 회차 (기존 인수인계 원문 보존)
- 최신 원문 보존 Library: `/MYVOCAL_20261026_매시간개발_전체누적인수인계.md` (이전 1,256,437바이트를 바이트 단위로 접두사 보존하고 신규 개발 기록 추가, 총 1,260,056바이트).
- 최신 개발 시작 main: `a438f96b96474fad296b4558779e0be089195c95`; 실제 기능 소스 4개 비강제 반영 커밋: `e2afab078fa3dd2fd0fee5f185ca91edb66d7bbf`.
- 이번 구현: Windows EXE 기존 로컬 Ollama 신경망 MIDI 작곡에서 **선택형 9악기** (기존 6악기 + harmony/piano/synth) 생성·검증, 독립 MIDI 트랙 및 선택적 FluidSynth/SoundFont 9개 WAV 추가 저장, 한국어 GUI 선택 연결. 기존 6악기 모드는 유지.
- 아직 실제 Ollama 9역할 추론/Windows EXE GUI/FluidSynth WAV·GPU Music+MV를 검증하지 않았다. 전체 66항 개발 완료 후 통합검증→오류 수정→재검증 순서 유지. 기존 사용자 녹음·모델·자산 삭제 없음.
- 다음 회차: 최신 main·원본 66항·정본 인수인계를 읽고 본인 목소리 실제 학습/한국어 Singing/3~6분 음악+MV 핵심 누락 개발을 계속한다.


## 최신 누적 인수인계 — 2026-10-19 19:17 KST (3회차)
- **우선 읽을 최신 전체 원문:** ChatGPT Library `/MYVOCAL_20261019_자동개발03_전체누적인수인계.md` (6,021줄, 451,395 bytes, SHA-256 `e3215df0fb8bf1a0aff6ac234c5a3c56cb8a20af294a6220f4da6ac29416acd1`, Library ID `libfile_df9e159e03948191a76e8d71f647deee`). 이전 5,982줄/443,367 bytes를 바이트 그대로 접두사로 보존함.
- 최신 개발 main SHA `6b751484d24e1058248e59db68c08af759e5150a`. 모델 `sourceSampleId`의 프로젝트 백업 원본 포함·복원 ID 재매핑, 회귀 테스트 추가. 소스 CI `39236262604`, Windows CI `39236262598`는 작성 당시 진행 중이었으므로 완료 여부를 다시 확인할 것. **삭제 보호 GUI 버튼 직접 클릭 검증은 아직 미완료**.
- 원래 대화에서 예약을 이어가는 것을 최우선으로 하고, 다른 대화로 배치되면 위 최신 전체 파일을 처음부터 끝까지 읽고 작업한다. 매 실행 뒤 누적 원문을 바이트 단위 접두사로 보존하여 다음 전체 인수인계를 저장한다.
**최신 수정:** 2026-10-19 KST. 이 문서는 5,882줄 전체 누적 인수인계를 찾고 재개하기 위한 **영구 복구 인덱스**입니다. 이 문서만으로 예전 사용자 지시 100% 완독했다고 주장하지 마세요.

## 반드시 먼저 읽을 전체 누적 원문
- ChatGPT **파일 보관함 루트**: `/MYVOCAL_20261019_매시간전체누적인수인계_원문보존.md` (5,882줄, 422,978 bytes, SHA-256 `3846b5c36175b2175b228c0df820183ad0c6584fed6b47dd2ece532e3dde2aa6`, Library 식별 `libfile_8b9c4c1b531881919f2006f655d785fc`).
- 이 파일은 기존 `MYVOCAL_20261019_main_전체누적인수인계_원문보존_검증계속.md` 5,836줄, 414,751 bytes를 **그대로 접두사로 보존**하고 새 사용자 지시/예약/최신 CI를 추가한 실제 전체 본문이다.
- 실행 시 먼저 파일 전체를 끝까지 읽고, 최신 부분이 과거 시점 상태(당시 테스트 브랜치 GUI 복원 실패 등)를 갱신한다는 점을 유의한다. 접근 실패 시 이를 정직하게 말하고 GitHub/이 대화에서 복구하며, 추측으로 기획을 바꾸지 않는다.

## 사용자의 가장 중요한 최신 명령
1. **이 MYVOCAL 예약을 만든 원래 대화에서 가능한 한 계속 개발/답변.** 플랫폼이 원래 대화로 회신을 게시하도록 허용하면 이 채팅 그대로 사용하며, 불필요한 별도 대화를 만들지 않는다.
2. 시스템의 채팅 길이/실행 제약으로 새 대화에 게시되더라도 **누적 전체 인수인계부터 읽고 나서** 기존 프로젝트를 연속 개발한다. 이 약속을 예약 지시로 남겼다. 단, 게시 대화 경로 자체는 플랫폼이 결정하므로 반드시 원 대화에 게시한다고 거짓 확답하지 않는다.
3. **매 실행 완료 전 새로운 전체 누적 인수인계로 갱신:** 이전 전문 보존 + 이 실행에서 실제 수정한 코드/파일/커밋, CI 실행/통과/실패/남은 오류, 현재 개발 단계, 미완료, 사용자 필수/금지 지시, 재현 방법과 다음 작업을 상세 추가한 뒤 **ChatGPT 파일 보관함에 업로드**, 이 GitHub 인덱스도 갱신. 실패 시 실패를 분명히 보고하고 인계 텍스트를 답변에 포함.
4. 사용자는 **한 번에 여러 개발·수정·검증 항목**을 진행하라고 했으며 한 파일씩 보고·정지하기를 원하지 않는다. 완료라고 주장할 때는 실제 Windows EXE GUI 실행→버튼→생성→저장→복원→재실행 증거가 있어야 한다. 단위 테스트/빌드만 성공이면 따로 명시.
5. 사용자가 PC를 꺼도 GitHub 등 **클라우드에서 가능한 작업을 수행**한다. Windows 10/11 사용자 PC에 직접 접속하거나 프로그램을 조작하지 않았다면 했다고 말하지 않는다.
6. 기존 유효 소스/원본 66항목/사용자 사진·오디오·모델·프로젝트 데이터 보존. 프로그램을 새로 만들지 않으며 임의로 기획을 변경/축소/재해석하지 않는다. 한국 사용자 Windows x64 EXE 및 무료·로컬 우선, 외부 유료 API 최소. 다른 저장소·다른 예약에 손대지 않고, 이미 해결/확인한 브랜치 이슈를 사용자에게 불필요하게 반복하지 않는다.

## 예약 확인
- `MYVOCAL 매시간 개발·검증` (활성), **2026-10-19 17:17 Asia/Seoul 첫 실행**, 매시 `:17`에 반복. 기존 일정 유지. 예약 prompt에 원대화 유지 우선/인수인계 의무를 추가함.
- 실행 맥락이 다른 대화인 경우라도 같은 최신 GitHub 소스를 기반으로 수행하며 **원대화 선호를 최우선**. 대화 경로를 강제하는 별도 공개 옵션은 현재 확인되지 않음.

## 저장소, 소스, 원본 기획
- GitHub: https://github.com/junggyeol4444/MYVOCAL
- Windows EXE 기존 프로젝트 코드: `MYVOCAL-Studio-source/`, Go/WebView2 호스트 `desktop/`, CI 및 EXE E2E `tests/windows-project-journey.ps1`; 기존 소스의 점진 수정만 수행.
- 원본 66항목 전체 `docs/MYVOCAL-원본66개-기획안.md` (2026-10-19 이전 확인 SHA `129e0d3b9dba97701ef18bfae9aad04cee6fb0cc`). 항목별 검증표 `docs/MYVOCAL-66-REQUIREMENT-EVIDENCE.md`. 반드시 GitHub 최신 파일을 다시 확인.
- 기존 검증표 41개 핵심 학습/생성 미연결·전체 미입증, 22개 소스/화면 부분·전체 미입증, 3개 부분 GUI 검증 분류를 **완료율이라고 하지 말 것**. 새로운 실증 성공만 판정을 바꾼다.
- 목표: 내 말하는 목소리 녹음→실제 모델 학습→한국어 AI 가창, 작사·작곡·편곡, 믹싱·렌더, 지정한 캐릭터/실사 인물의 일관된 자동 MV, 립싱크·모션, 영속 저장/복원, EXE 원클릭 사용자 흐름.
- **AI 학습/가창/AI MV 최종 기능을 아직 완성했다고 주장 금지.** 사용자의 녹음 샘플 DSP 가이드/외부 엔진 인터페이스/시험용 가상 체크포인트는 실제 학습 AI 가창이 아니다.

## 2026-10-19 검증 시점 최신 상태 — 매회 실제 저장소 확인 필요
- 당시 최신 HEAD `2305c71a81bb05d10236ec42e4a2699c0d8ff3de`. 이후 달라질 수 있으므로 다음 실행에서 먼저 조회.
- Source CI https://github.com/junggyeol4444/MYVOCAL/actions/runs/39216328772 `completed/success` (JS 1794 PASS 및 Python/Go).
- Windows CI https://github.com/junggyeol4444/MYVOCAL/actions/runs/39216328855 `completed/success` (Server 2022/2025; 실제 EXE GUI 생성/복원/재시작, WAV/WebM/PNG+**합성 체크포인트** 원본 바이트 SHA-256 확인, 목소리·모델·학습 기록 관계 유지).
- 이전 검증은 Windows Server이고 개인 Windows 10/11 PC 실기기 성공을 증명하지 않는다. 시험용 체크포인트는 실제 학습 모델이 아니다.
- 최근 핵심 수정 기록:
  - `abc44810e7f28cce0591ff40787f6a83ec24b616`: 프로젝트 백업의 캐릭터/음성 참조 미디어 누락 대응.
  - `13e90c1bb213513eb005a1aaae53f066bb123474`: 프로젝트 복원 원본 바이트·ID 매핑 회귀.
  - `7f33b3ca5469e13bca4dd855a3b9ecaa935c2854`: 복원 파일 입력 및 동일 GUI 세션 E2E.
  - `cee3ef119866ea670fc3a28857d6c9249cad310a`: 150MiB 백업/복원 용량 한도 일치.
  - `f509a4e73f980cce679ea1dbb02ff6641bdef569`: 실 WAV/WebM/PNG GUI 복원→재백업 검사.
  - `ece024ee44ed2993e05bdb66a6186e9ad7f43d9b`: 가창 엔진 WAV 무결성 강제.
  - `ce608d81e4825b57fcdd6b17cc1338a01d68bb7b`: 학습 계획·체크포인트 자산 백업, ID 재매핑, 워크스페이스 검사.
  - `8acf7e29bd7e68b1c89489ec87ef8bbfd1f26fad`: 무음/손상 WAV 제한 및 모델·학습 기록 E2E 증거.
  - `586e59dd383d246430b8a7537cf85e8e9a35c175`: Windows 파일 대화상자 포커스 예외 대응.
  - `f70421e3238a63ddbd56851e05b5d4c2c277a0cd`: 사용 중 모델·음성/미디어의 삭제 안전성 보강.
  - `2305c71a81bb05d10236ec42e4a2699c0d8ff3de`: 가장 최신 Windows GUI 검사 스크립트 변경(실제 diff `tests/windows-project-journey.ps1` 하나; 다른 기능을 이 SHA 변경으로 오인하지 말 것).
- 당시 작업 결과는 실제 GitHub CI·증거에 근거하지만 *모든 원본 요구가 끝났다는 뜻이 아니다*.

## 매시간 실행 시작 및 종료 체크리스트
**시작:** 전체 누적 Library MD 완독 → 원본 66항목·evidence MD 읽기 → GitHub main HEAD/마지막 실제 커밋, 현재 CI 확인 → 실패 원인 우선분석.
**실행:** 여러 기능을 기존 코드에서 묶어 수정, 기존 사용자 파일 무결성 보존, 노드/파이썬/Go 자동 검증 및 Windows Server EXE 실제 GUI E2E, 실패 시 정확한 재현 근거로 수정. 안 된 것은 안 됐다고 말하기.
**종료:** 변경 파일/커밋/검증 성공·실패·미실행/증거 URL과 사용자 지시 누적을 **전체 원문에 덧붙여 다시 저장**, 이 인덱스의 최신 HEAD/링크 갱신. 클라우드 CI와 실사용 Windows 10/11 PC 검증 구별. 원대화가 가능하면 여기에서 보고, 불가능하면 복구된 맥락으로 정직하게 이어가기.

마지막 확인: 이 문서보다 원본 사용자 지시와 최신 실제 코드·테스트 결과가 우선이다. 복구 인덱스는 원본 기획의 대체물이 아니다.


## 2026-10-26 이 MYVOCAL 대화 내 연속 개발 — 6악기 MusicGen 중단 재개
- **개발 시작 main HEAD**: `0c450e86dc3f66448562e5ec54ef35bad549e0ed`.
- **실제 기능 커밋**: `130dbc1dadcc71fae8b37defa81cbee73fddaf5e`, 기존 main에 `force=false` 및 `expected_sha`로 비강제 반영.
- **실제 변경 소스**:
  1. `MYVOCAL-Studio-source/src/lib/neuralInstrumentAudioStems.js`: 각 독립 생성 MusicGen 악기 WAV의 SHA-256, 해당 MIDI 음표의 SHA-256, 모델 폴더/작곡 버전/구간 수/교차 페이드 설정을 **새 트랙 메타데이터에만** 기록. 기존 WAV, 기존 MIDI, 사용자 자산 변경 없음.
  2. `MYVOCAL-Studio-source/src/lib/neuralStemIncrementalResume.js` (신규): 멜로디/코드/베이스/드럼/기타/패드 6개를 순회하여 동일 모델 설정·MIDI 버전·SHA-256로 기존 IndexedDB 원본 WAV를 확인하고, 아직 없는 역할만 기존 실제 MusicGen 생성 경로로 호출. **신규 생성 악기별 개별 트랙 저장**으로 이전에 성공한 역할의 데이터를 유지한 채 나머지 악기를 계속 생성. 오류, 취소, 데이터 변경 시 원본 유지·중단. 다른 모델·다른 악보의 소스를 무조건 재사용하지 않음.
  3. `MYVOCAL-Studio-source/src/components/MusicGenPanel.jsx`: 기존 Windows EXE 한국어 GUI에 '중단된 6악기 MusicGen 제작 이어서 실행' 별도 버튼을 연결. 기존 전체 신규 생성과 단일 악기 생성 버튼은 보존.
- **부분 중단의 의미**: 신규 재개 버튼으로 생성된 각 악기는 개별적으로 저장되므로 나중 악기가 실패해도 완료 악기 자산은 유지된다. 중단 이후 재개 시 저장된 음원 바이트와 현재 원곡 MIDI·설정이 일치하는 결과만 건너뛴다. 복구된 소스에서 다른 오래된 악기 트랙은 동일 SHA 메타데이터가 없으면 재사용 완료로 오인하지 않는다.
- **확인/검증 범위**: 기존 소스 읽기와 diff용 고정 앵커 비교, GitHub Git 객체 및 main 반영 성공까지만 수행. 사용자 지정 순서에 따라 JS 단위 테스트·CI·Windows 10/11 EXE GUI·실제 GPU MusicGen 모델 실행과 WAV 품질 검증 **NOT_RUN / NOT_VERIFIED**. 소스 커밋만으로 모델 추론 품질이나 완성된 신경망 음악을 주장하지 않는다.
- **아직 미개발/미완성**: 원본 66항 전체 구현 미완료. 한국어 음색 실제 DiffSinger/RVC 학습→3~6분 신경망 가창, 완전한 독립 음악적 품질과 6악기 MusicGen 장편 연속성, 실제 사람·캐릭터 2D/3D/VRM 동작·립싱크 및 SD/SVD/Wav2Lip 전곡, 원클릭 음악·영상 자동 생성 전 과정 등 미완성 코드를 기존 본체에 계속 통합할 것.
- **사용자 우선 지시**: 이 MYVOCAL 대화에서 계속 수행, 임의 다른 대화·다른 프로젝트 금지. **남은 66항 실제 기능 전체 개발 → 그 다음 전체 Windows EXE/GPU 통합 검증 → 발견 오류 일괄 수정 → 재검증**. 기존 원본, 녹음, 음원, 모델, 사진, 동영상, IndexedDB, 백업, 기획, 설정 무단 변경·삭제·덮어쓰기 금지. 새 웹 제품/Google Drive/모델 임의 교체/강제 push/다른 저장소·예약 조작 금지. 다음 실행도 GitHub 최신 main HEAD와 원본 66항, 전체 최신 인계/변경 파일을 다시 읽을 것.
