# MYVOCAL 원본 66항목 — 소스/GUI/실산출물 근거 대조표 (2026-10-19)

**범위**: 사용자가 지정한 `docs/MYVOCAL-원본66개-기획안.md` 원문 1~66항목. 원본 SHA: `129e0d3b9dba97701ef18bfae9aad04cee6fb0cc`. 검토 시작 HEAD: `36f038281b7bfa20f72bda5c3addefd94f5c4ed1`. 이 표는 **완성 인증서가 아니다.** 항목별 코드 참조는 실제 기능의 존재/품질/실기기 작동을 증명하지 않는다. 원본 파일 끝부분에 중복 이스케이프된 기획안 텍스트가 있으므로, 첫 번째 원문 1~66만 기준으로 삼았다.

## 판정 규칙
- **부분 사용자 흐름 검증**: GitHub Windows Server 2022·2025에서 실제 EXE를 열고 수행한 *일부 하위 기능* 증거가 있음. 항목 전체 완료가 아니라는 뜻.
- **소스/화면 확인·완료 미입증**: 연관 파일은 실제 repo tree에서 확인했으나 모델 실행·사용자 출력 또는 수용 기준에 대한 충분한 증거가 없음.
- **핵심 생성/학습 미연결·최종 미입증**: 프로그램 자체가 핵심 AI 학습/가창/영상 생성 미연결이라고 명시하거나, 해당 핵심 결과를 증명하지 못함. **관련 코드가 전혀 없다는 뜻이 아님**. 로컬 이미지·영상 엔진 조건부 호출 코드도 일부 존재함.

**반증 가능한 실물 증거**: Windows run [39180511333](https://github.com/junggyeol4444/MYVOCAL/actions/runs/39180511333)에서 실제 EXE·프로젝트 재시작·WAV·WebM·취소 검사 양쪽 성공. 뒤따른 [39189886946](https://github.com/junggyeol4444/MYVOCAL/actions/runs/39189886946)은 Windows Server 2022/2025 모두 프로젝트 백업 파일 생성까지 통과하고 *일반 사용자로 실행한 EXE에서도* 네이티브 파일 선택 창을 열지 못해 GUI 복원 단계 실패. **부분 성공이 전체 성공으로 바뀌지 않는다.** Source run [39189886953](https://github.com/junggyeol4444/MYVOCAL/actions/runs/39189886953)은 JS/Python/Go 통과.

**코드 내부의 명시적 불완전 고지**: `src/App.jsx:41,85` (AI 가창·영상 생성 미연결); `src/pages/AutoCreate.jsx:6,10,20` (규칙 기반 MIDI·장면 초안, AI Singing·MV 미연결); `src/pages/Training.jsx:16,41,72` (실제 모델 학습 미연결); `src/pages/Voices.jsx:122,136` (학습 미구현); `src/lib/createSongVideo97.js:17,37` (모델 필요 상태). `src/pages/Video.jsx`에는 로컬 생성 엔진 호출 코드가 있으므로 'AI 영상 관련 모든 코드 부재'라는 주장은 하지 않는다. 모델을 설치한 실제 Windows 10/11 사용자 실기기 E2E 증거는 없다.

## 66개 전수 대조표

| 번호 | 원본 요구사항 | 현재 확인 가능한 수준 | GitHub 실제 파일 참조 | 전체 완료 판정에 필요한 실사용 기준 |
|---:|---|---|---|---|
| 01 | 제품 목표 | 핵심 생성/학습 미연결·최종 미입증 | [`App.jsx`](../MYVOCAL-Studio-source/src/App.jsx), [`readiness.js`](../MYVOCAL-Studio-source/src/lib/readiness.js) | 본인 음색 합성·음악·캐릭터 MV를 한 프로젝트에서 처음부터 최종 파일까지 완료 |
| 02 | 시작 화면 | 부분 사용자 흐름 검증 | [`App.jsx`](../MYVOCAL-Studio-source/src/App.jsx), [`Dashboard.jsx`](../MYVOCAL-Studio-source/src/pages/Dashboard.jsx) | 앱 시작부터 각 주요 모드 진입·되돌아가기·재실행 후 화면 유지 |
| 03 | 음악 제작 | 핵심 생성/학습 미연결·최종 미입증 | [`AutoCreate.jsx`](../MYVOCAL-Studio-source/src/pages/AutoCreate.jsx), [`Workspace.jsx`](../MYVOCAL-Studio-source/src/pages/Workspace.jsx) | 사용자 문장 입력→구간별 편집 트랙→실제 합성 보컬·최종 음원·MV |
| 04 | 장르 시스템 | 소스/화면 확인·완료 미입증 | [`genreMix.js`](../MYVOCAL-Studio-source/src/lib/genreMix.js), [`sectionGenre.js`](../MYVOCAL-Studio-source/src/lib/sectionGenre.js) | 혼합/구간 장르 지정→편곡 차이가 출력 파일·프로젝트에 반영 |
| 05 | AI 작사·작곡 | 핵심 생성/학습 미연결·최종 미입증 | [`composer.js`](../MYVOCAL-Studio-source/src/lib/composer.js), [`createSongVideo97.js`](../MYVOCAL-Studio-source/src/lib/createSongVideo97.js) | AI 작사·코드·멜로디·악기 MIDI 편집·고품질 합성 결과를 실제 산출물로 확인 |
| 06 | 내 목소리 학습 | 핵심 생성/학습 미연결·최종 미입증 | [`Voices.jsx`](../MYVOCAL-Studio-source/src/pages/Voices.jsx), [`Training.jsx`](../MYVOCAL-Studio-source/src/pages/Training.jsx) | 사용자 샘플 녹음→학습→음색 유사한 새 가창 합성·재사용 |
| 07 | Voice와 Singing Style 분리 | 핵심 생성/학습 미연결·최종 미입증 | [`Voices.jsx`](../MYVOCAL-Studio-source/src/pages/Voices.jsx), [`schema.js`](../MYVOCAL-Studio-source/src/lib/schema.js) | 동일 모델에서 다양한 Singing Style 제어·음색 유지 |
| 08 | 노래 학습 | 소스/화면 확인·완료 미입증 | [`Learning.jsx`](../MYVOCAL-Studio-source/src/pages/Learning.jsx), [`musicStyleProfile.js`](../MYVOCAL-Studio-source/src/lib/musicStyleProfile.js) | 권한 있는 곡 학습→음악 스타일 프로필→신규 생성 결과 반영 |
| 09 | Reference Mode | 소스/화면 확인·완료 미입증 | [`referenceMusicAnalysis.js`](../MYVOCAL-Studio-source/src/lib/referenceMusicAnalysis.js), [`Learning.jsx`](../MYVOCAL-Studio-source/src/pages/Learning.jsx) | 참고곡 비학습 분석→가져온 스타일만 새 프로젝트에 반영 |
| 10 | 음악 AI Provider | 핵심 생성/학습 미연결·최종 미입증 | [`Settings.jsx`](../MYVOCAL-Studio-source/src/pages/Settings.jsx), [`readiness.js`](../MYVOCAL-Studio-source/src/lib/readiness.js) | 실제 설치된 복수 Provider 전환 후 동일 프로젝트에서 결과 생성 |
| 11 | AI Producer | 소스/화면 확인·완료 미입증 | [`producerCommands.js`](../MYVOCAL-Studio-source/src/lib/producerCommands.js), [`Workspace.jsx`](../MYVOCAL-Studio-source/src/pages/Workspace.jsx) | 자연어 요청으로 기존 곡 구간·악기·조성 편집→WAV 반영 |
| 12 | Music Video Studio | 핵심 생성/학습 미연결·최종 미입증 | [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx), [`mvWebmRecorder.js`](../MYVOCAL-Studio-source/src/lib/mvWebmRecorder.js) | 완성 노래에서 등록 캐릭터 또는 자동 인물의 실제 AI 생성 MV 출력 |
| 13 | AI 자동 캐릭터 방식 | 핵심 생성/학습 미연결·최종 미입증 | [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx), [`characterToMv.js`](../MYVOCAL-Studio-source/src/lib/characterToMv.js) | 자료 없이 AI 캐릭터 자동 생성→영상 전 장면 일관성 |
| 14 | 사람 / 캐릭터 등록 | 소스/화면 확인·완료 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`assetDb.js`](../MYVOCAL-Studio-source/src/lib/assetDb.js) | 사진·영상·VRM 등 권한 자료 등록→실제 출력에서 재사용 |
| 15 | Character Library | 소스/화면 확인·완료 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`schema.js`](../MYVOCAL-Studio-source/src/lib/schema.js) | 한 번 등록한 캐릭터가 다른 프로젝트에서 다시 업로드 없이 사용됨 |
| 16 | 실제 사람 등록 | 핵심 생성/학습 미연결·최종 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`personLipSync.js`](../MYVOCAL-Studio-source/src/lib/personLipSync.js) | 실제 사람 다각도 사진→외형 프로필·새 영상 일관성 |
| 17 | 캐릭터 등록 | 핵심 생성/학습 미연결·최종 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js) | 캐릭터 그림→분석·표정/측면/후면 참조 생성 |
| 18 | Character Identity Lock | 핵심 생성/학습 미연결·최종 미입증 | [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js), [`identityRegeneration92.js`](../MYVOCAL-Studio-source/src/lib/identityRegeneration92.js) | Identity Lock 적용 전후 여러 AI 생성 장면에서 동일 인물 확인 |
| 19 | 의상 고정 / 변경 | 소스/화면 확인·완료 미입증 | [`characterLooks.js`](../MYVOCAL-Studio-source/src/lib/characterLooks.js), [`characterReplace94.js`](../MYVOCAL-Studio-source/src/lib/characterReplace94.js) | 고정/변경 의상 선택→장면의 실물 렌더링에 반영 |
| 20 | 한 곡에 여러 캐릭터 | 소스/화면 확인·완료 미입증 | [`characterCast.js`](../MYVOCAL-Studio-source/src/lib/characterCast.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 2명 이상 캐릭터 배치→영상 장면별 역할과 출연 확인 |
| 21 | 듀엣 영상 | 핵심 생성/학습 미연결·최종 미입증 | [`characterVocalCues.js`](../MYVOCAL-Studio-source/src/lib/characterVocalCues.js), [`characterLipSync.js`](../MYVOCAL-Studio-source/src/lib/characterLipSync.js) | 두 보컬/캐릭터별 음소 기반 실물 립싱크 전환 |
| 22 | 실제 사람 + 캐릭터 혼합 | 소스/화면 확인·완료 미입증 | [`characterCast.js`](../MYVOCAL-Studio-source/src/lib/characterCast.js), [`mvStoryboard.js`](../MYVOCAL-Studio-source/src/lib/mvStoryboard.js) | 실사 사람과 2D 캐릭터 혼합 장면 MV 출력 |
| 23 | Image-to-MV | 핵심 생성/학습 미연결·최종 미입증 | [`imageToMv.js`](../MYVOCAL-Studio-source/src/lib/imageToMv.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 사진 한 장→스토리보드·모션·립싱크·MV 파일 |
| 24 | Character-to-MV | 핵심 생성/학습 미연결·최종 미입증 | [`characterToMv.js`](../MYVOCAL-Studio-source/src/lib/characterToMv.js), [`vocalSynthPv95.js`](../MYVOCAL-Studio-source/src/lib/vocalSynthPv95.js) | 캐릭터 원화→표정·몸 동작·립싱크·PV 파일 |
| 25 | 캐릭터와 Voice 연결 | 소스/화면 확인·완료 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`Voices.jsx`](../MYVOCAL-Studio-source/src/pages/Voices.jsx) | Voice-Character 연결 저장→해당 가상 가수로 재사용 |
| 26 | Virtual Singer Manager | 핵심 생성/학습 미연결·최종 미입증 | [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx), [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js) | 가상 가수의 모델/목소리/스타일/의상 변경·재사용 |
| 27 | 보컬 신스 PV 모드 | 핵심 생성/학습 미연결·최종 미입증 | [`vocalSynthPv95.js`](../MYVOCAL-Studio-source/src/lib/vocalSynthPv95.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 여러 PV 유형을 선택하여 독립 영상으로 출력 |
| 28 | 2D 캐릭터 영상 | 핵심 생성/학습 미연결·최종 미입증 | [`characterAnimation2d.js`](../MYVOCAL-Studio-source/src/lib/characterAnimation2d.js), [`characterLayers.js`](../MYVOCAL-Studio-source/src/lib/characterLayers.js) | 2D 레이어 분리→눈/입/몸 애니메이션 실물 영상 확인 |
| 29 | 3D 캐릭터 영상 | 핵심 생성/학습 미연결·최종 미입증 | [`character3d.js`](../MYVOCAL-Studio-source/src/lib/character3d.js), [`character3dRenderer.js`](../MYVOCAL-Studio-source/src/lib/character3dRenderer.js) | VRM/3D 모델 로드→모션/립싱크/라이팅 실물 영상 출력 |
| 30 | AI Dance Director | 핵심 생성/학습 미연결·최종 미입증 | [`characterDanceDirector.js`](../MYVOCAL-Studio-source/src/lib/characterDanceDirector.js), [`characterStage3d.js`](../MYVOCAL-Studio-source/src/lib/characterStage3d.js) | 곡 분석→춤 모션 자동 생성→캐릭터 동작 렌더링 |
| 31 | Motion Reference | 핵심 생성/학습 미연결·최종 미입증 | [`characterDanceDirector.js`](../MYVOCAL-Studio-source/src/lib/characterDanceDirector.js), [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx) | 권한 동작 영상→모션 추출→캐릭터 재현 |
| 32 | 직접 연기해서 캐릭터 움직이기 | 핵심 생성/학습 미연결·최종 미입증 | [`personLipRecording.js`](../MYVOCAL-Studio-source/src/lib/personLipRecording.js), [`characterAnimation2d.js`](../MYVOCAL-Studio-source/src/lib/characterAnimation2d.js) | 웹캠/녹화 연기→실시간/후처리 캐릭터 표정·자세 변환 |
| 33 | 자동 Lip Sync | 핵심 생성/학습 미연결·최종 미입증 | [`lyricAlignment.js`](../MYVOCAL-Studio-source/src/lib/lyricAlignment.js), [`phonemePlan.js`](../MYVOCAL-Studio-source/src/lib/phonemePlan.js), [`characterLipSync.js`](../MYVOCAL-Studio-source/src/lib/characterLipSync.js) | 가사 음소 타이밍→Viseme→실제 입 모양 영상 동기화 |
| 34 | 실제 사람 Lip Sync | 핵심 생성/학습 미연결·최종 미입증 | [`personLipSync.js`](../MYVOCAL-Studio-source/src/lib/personLipSync.js), [`personLipRecording.js`](../MYVOCAL-Studio-source/src/lib/personLipRecording.js) | 실제 사람의 Singing Audio 기반 정렬·영상 립싱크 |
| 35 | 표정 자동 연출 | 핵심 생성/학습 미연결·최종 미입증 | [`characterExpressionDirector.js`](../MYVOCAL-Studio-source/src/lib/characterExpressionDirector.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 가사·음악 감정 변화에 따라 인물 표정 실물 렌더링 |
| 36 | Storyboard AI | 부분 사용자 흐름 검증 | [`mvStoryboard.js`](../MYVOCAL-Studio-source/src/lib/mvStoryboard.js), [`createSongVideo97.js`](../MYVOCAL-Studio-source/src/lib/createSongVideo97.js) | 음악에서 편집 가능한 스토리보드 생성→시간축/캐릭터·장면 반영 |
| 37 | 캐릭터 Storyboard 배치 | 소스/화면 확인·완료 미입증 | [`mvDirection.js`](../MYVOCAL-Studio-source/src/lib/mvDirection.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 장면별 인물·의상·카메라·조명 메타데이터와 렌더 연동 |
| 38 | 캐릭터 등장 강도 | 소스/화면 확인·완료 미입증 | [`mvDirection.js`](../MYVOCAL-Studio-source/src/lib/mvDirection.js), [`characterShots.js`](../MYVOCAL-Studio-source/src/lib/characterShots.js) | 캐릭터 등장 강도 선택→실제 장면 배분 변화 확인 |
| 39 | Performance MV | 소스/화면 확인·완료 미입증 | [`characterPerformance89.js`](../MYVOCAL-Studio-source/src/lib/characterPerformance89.js), [`stage3dRecording.js`](../MYVOCAL-Studio-source/src/lib/stage3dRecording.js) | 캐릭터+밴드+조명 공연 MV 출력 |
| 40 | Story MV | 소스/화면 확인·완료 미입증 | [`mvStoryboard.js`](../MYVOCAL-Studio-source/src/lib/mvStoryboard.js), [`mvDirection.js`](../MYVOCAL-Studio-source/src/lib/mvDirection.js) | 가사 사건 기반 Story MV 출력 |
| 41 | Mixed MV | 소스/화면 확인·완료 미입증 | [`mvDirection.js`](../MYVOCAL-Studio-source/src/lib/mvDirection.js), [`mvSceneVideos.js`](../MYVOCAL-Studio-source/src/lib/mvSceneVideos.js) | 스토리·공연 혼합 구성 MV 출력 |
| 42 | 사람을 캐릭터화 | 핵심 생성/학습 미연결·최종 미입증 | [`characterToMv.js`](../MYVOCAL-Studio-source/src/lib/characterToMv.js), [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js) | 허가된 실제 사람 스타일 변환 후 동일 정체성 유지 |
| 43 | 캐릭터를 실사풍으로 | 핵심 생성/학습 미연결·최종 미입증 | [`characterLooks.js`](../MYVOCAL-Studio-source/src/lib/characterLooks.js), [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js) | 허가된 캐릭터 실사풍 변환 후 동일 정체성 유지 |
| 44 | Character Outfit Studio | 핵심 생성/학습 미연결·최종 미입증 | [`characterLooks.js`](../MYVOCAL-Studio-source/src/lib/characterLooks.js), [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx) | AI 의상 후보 생성·선택→일관성 유지·영상 적용 |
| 45 | Character Hair / Accessories | 소스/화면 확인·완료 미입증 | [`characterLooks.js`](../MYVOCAL-Studio-source/src/lib/characterLooks.js), [`assetDb.js`](../MYVOCAL-Studio-source/src/lib/assetDb.js) | 헤어/악세서리 별도 자산 조립→3D/2D 장면 반영 |
| 46 | 악기 연주 영상 | 핵심 생성/학습 미연결·최종 미입증 | [`characterPerformance89.js`](../MYVOCAL-Studio-source/src/lib/characterPerformance89.js), [`virtualBand90.js`](../MYVOCAL-Studio-source/src/lib/virtualBand90.js) | MIDI 기타·피아노·드럼 타이밍과 동작이 동기화된 실제 영상 |
| 47 | 가상 밴드 | 소스/화면 확인·완료 미입증 | [`virtualBand90.js`](../MYVOCAL-Studio-source/src/lib/virtualBand90.js), [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx) | 여러 캐릭터로 밴드 편성·연주·가창 영상 출력 |
| 48 | Character Learning | 핵심 생성/학습 미연결·최종 미입증 | [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js), [`Learning.jsx`](../MYVOCAL-Studio-source/src/pages/Learning.jsx) | 다중 캐릭터 이미지 학습→일관된 신규 장면 생성 |
| 49 | Person Learning | 핵심 생성/학습 미연결·최종 미입증 | [`characterIdentity.js`](../MYVOCAL-Studio-source/src/lib/characterIdentity.js), [`Characters.jsx`](../MYVOCAL-Studio-source/src/pages/Characters.jsx) | 실사 사람 다수 자료 분석→얼굴·몸 일관성 있는 생성 영상 |
| 50 | MV Style Learning | 핵심 생성/학습 미연결·최종 미입증 | [`mvStyleLearning91.js`](../MYVOCAL-Studio-source/src/lib/mvStyleLearning91.js), [`Learning.jsx`](../MYVOCAL-Studio-source/src/pages/Learning.jsx) | 권한 MV 학습→카메라/이펙트 스타일 재현 |
| 51 | AI 영상 자연어 수정 | 핵심 생성/학습 미연결·최종 미입증 | [`mvNaturalEdit93.js`](../MYVOCAL-Studio-source/src/lib/mvNaturalEdit93.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 자연어로 기존 MV 수정→결과 영상의 장면만 변경 |
| 52 | Identity-Safe Regeneration | 소스/화면 확인·완료 미입증 | [`identityRegeneration92.js`](../MYVOCAL-Studio-source/src/lib/identityRegeneration92.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 정체성·의상·배경·카메라 고정 재생성→영상 정량·육안 확인 |
| 53 | Character Replace | 소스/화면 확인·완료 미입증 | [`characterReplace94.js`](../MYVOCAL-Studio-source/src/lib/characterReplace94.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 완성 MV 캐릭터만 교체→나머지 장면·카메라 유지 |
| 54 | Voice Replace | 소스/화면 확인·완료 미입증 | [`voicebankAliases.js`](../MYVOCAL-Studio-source/src/lib/voicebankAliases.js), [`Voices.jsx`](../MYVOCAL-Studio-source/src/pages/Voices.jsx) | 영상 인물 유지한 채 합성 Voice 변경→새 WAV·MV 출력 |
| 55 | 한 번의 생성으로 음악+MV | 핵심 생성/학습 미연결·최종 미입증 | [`createSongVideo97.js`](../MYVOCAL-Studio-source/src/lib/createSongVideo97.js), [`AutoCreate.jsx`](../MYVOCAL-Studio-source/src/pages/AutoCreate.jsx) | 한 번 CREATE→학습된 본인 음색 가창·완성 음악·실제 AI MV 모두 산출 |
| 56 | 사용자가 사진을 넣었을 경우 | 핵심 생성/학습 미연결·최종 미입증 | [`imageToMv.js`](../MYVOCAL-Studio-source/src/lib/imageToMv.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 사진 등록→자신이 노래하는 공연 MV 출력 |
| 57 | 캐릭터 이미지를 넣었을 경우 | 핵심 생성/학습 미연결·최종 미입증 | [`vocalSynthPv95.js`](../MYVOCAL-Studio-source/src/lib/vocalSynthPv95.js), [`Video.jsx`](../MYVOCAL-Studio-source/src/pages/Video.jsx) | 캐릭터 원화 등록→캐릭터 보컬 신스 PV 출력 |
| 58 | AI가 전부 만드는 경우 | 핵심 생성/학습 미연결·최종 미입증 | [`createSongVideo97.js`](../MYVOCAL-Studio-source/src/lib/createSongVideo97.js), [`AutoCreate.jsx`](../MYVOCAL-Studio-source/src/pages/AutoCreate.jsx) | 이미지 없을 때 캐릭터 자동 생성→가창·MV 출력 |
| 59 | Music / Character / Video 분리 저장 | 부분 사용자 흐름 검증 | [`schema.js`](../MYVOCAL-Studio-source/src/lib/schema.js), [`store.js`](../MYVOCAL-Studio-source/src/lib/store.js), [`projectBundle.js`](../MYVOCAL-Studio-source/src/lib/projectBundle.js) | Voice/Character/Music/Video 자산 분리 저장·백업·복원 후 동일 연결 |
| 60 | 예시 조합 | 소스/화면 확인·완료 미입증 | [`createSongVideo97.js`](../MYVOCAL-Studio-source/src/lib/createSongVideo97.js), [`genreMix.js`](../MYVOCAL-Studio-source/src/lib/genreMix.js) | 다양한 Voice/Character/Music/Video 조합 실제 결과 재생 |
| 61 | AI Creative Director | 핵심 생성/학습 미연결·최종 미입증 | [`creativeDirector96.js`](../MYVOCAL-Studio-source/src/lib/creativeDirector96.js), [`AutoCreate.jsx`](../MYVOCAL-Studio-source/src/pages/AutoCreate.jsx) | 상위 AI Director가 음악·영상·인물 계획을 실제 생성·합성까지 오케스트레이션 |
| 62 | 자연어로 프로젝트 전체 제어 | 핵심 생성/학습 미연결·최종 미입증 | [`producerCommands.js`](../MYVOCAL-Studio-source/src/lib/producerCommands.js), [`creativeDirector96.js`](../MYVOCAL-Studio-source/src/lib/creativeDirector96.js) | 자연어 한 번으로 음악·영상 타임라인을 모두 수정·출력 |
| 63 | 학습 자료 권한 관리 | 소스/화면 확인·완료 미입증 | [`learningRights.js`](../MYVOCAL-Studio-source/src/lib/learningRights.js), [`Learning.jsx`](../MYVOCAL-Studio-source/src/pages/Learning.jsx) | 학습권한 / Reference 권한 구분에 따라 엔진 학습 동작 제한 |
| 64 | 최종 구조 | 핵심 생성/학습 미연결·최종 미입증 | [`App.jsx`](../MYVOCAL-Studio-source/src/App.jsx), [`readiness.js`](../MYVOCAL-Studio-source/src/lib/readiness.js) | 모든 주요 Studio 간 하나의 프로젝트/라이브러리/Export로 완전 연결 |
| 65 | 최종 제품 한 문장 | 핵심 생성/학습 미연결·최종 미입증 | [`acceptance100.js`](../MYVOCAL-Studio-source/src/lib/acceptance100.js), [`App.jsx`](../MYVOCAL-Studio-source/src/App.jsx) | 최종 제품 정의의 모든 핵심 기능을 실제 Windows EXE에서 한 번에 검증 |
| 66 | 핵심 차별점 | 핵심 생성/학습 미연결·최종 미입증 | [`acceptance100.js`](../MYVOCAL-Studio-source/src/lib/acceptance100.js), [`readiness.js`](../MYVOCAL-Studio-source/src/lib/readiness.js) | 음악 생성+가창+캐릭터 생성+MV가 하나의 프로그램에서 끝까지 완성 |

## 결론 및 처리 순서

1. **66항목 중 전체 수용 완료로 확정 가능한 항목: 0개**. 이유: 전체 수용 조건이 충족되었다는 실물 사용자 흐름 증거가 제출·확인되지 않았기 때문이며, 실제 코드 구현이 0개라는 뜻이 **아니다**. 이전에 '복원, Windows 10/11만 남았다'고 한 것은 전체 기획안을 대조하지 않은 잘못된 단정.
2. Windows CI 복원 단계는 반복 실패. 관리자/일반 사용자 모두 native file picker 미생성을 관측했으나 이 원인이 실제 Windows 10/11에서도 재현되는지 불명. 버튼 클릭만 반복하지 말고 WebView2 host 파일 대화상자 처리와 실제 Windows 10/11 사용자 흐름을 분리 진단. 기존 개인 데이터 변경 금지.
3. 원본 제품의 핵심 목표인 **내 목소리 모델 학습→AI Singing→캐릭터/사람 AI MV 출력**을 먼저 실제 기능으로 통합해야 한다. 기존 코드의 조건부 연결 인터페이스를 검사해 재사용하고, 실제 모델/음원/영상 아티팩트를 얻기 전 완료로 표시하지 않는다.
4. 다음 작업마다 **(가) 해당 번호 (나) 소스 커밋/코드 리뷰 (다) 실제 Windows EXE GUI 클릭 (라) 생성·저장·복원 파일 검증 (마) 실기기/CI 구분** 5가지를 묶어 기록. 코드 테스트만으로 전체 수용 완료 판정 금지.

**이 파일의 목적은 사용자의 66항목 원본에서 나온 '남은 일'을 근거로 특정하기 위한 것이지, 사용자 지시 없는 범위 재편성/기능 축소가 아니다.**
