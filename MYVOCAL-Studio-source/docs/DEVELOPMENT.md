# MYVOCAL Studio 개발 기준 · v0.1 → 차기 버전

## 기획서에 충실한 모듈 분리

1. **Creative Director**: 음악과 영상 작업을 함께 관리할 오케스트레이션. 현재는 Create 화면과 저장 구조만 존재.
2. **Music Studio**: Lyrics, Composer, Genre Engine, Arrangement, Instruments. v0.1은 프로젝트 스키마, 가사, 구간, 트랙 메타데이터 편집.
3. **Voice Studio**: Recording, Training, Singing Style, Singing Engine. v0.1은 음성 샘플의 실제 녹음/등록 및 Voice 프로필.
4. **Character Studio**: Person/Character Import, Identity Profile, Outfit, Expression, Library. v0.1은 이미지/영상/VRM 저장 및 정체성 정보 메타데이터.
5. **Video Studio**: Storyboard, Character Animation, Motion, Dance, Lip Sync, Camera, Lighting, Typography. v0.1은 편집 가능한 스토리보드.
6. **Learning Studio**: Music/Lyrics/Singing/Character/Motion/MV Style Learning 및 별도 Reference Analysis. v0.1은 파일과 사용 권한 분류.
7. **Mixer / Master / Export**: v0.1에서는 트랙별 볼륨 파라미터 및 프로젝트 JSON 내보내기만 지원.

## 영속 데이터 설계

`src/lib/schema.js`의 `newProject()`가 통합 프로젝트 초안을 만듭니다. Music/Character/Voice/Video는 개별 자산 및 프로젝트 내 연결 ID로 분리됩니다. Project는 타임라인, 가사, 장르, 씬, 영상 모드를 하나의 객체로 보관합니다.

- `localStorage` key: `myvocal-studio-v01` (JSON 프로젝트/자산 메타데이터)
- `IndexedDB` name: `myvocal-assets-v01`, store: `files` (File/Blob 원본)
- 장기적으로는 SQLite / 프로젝트 폴더 기반 파일 저장, 사용자 계정과 암호화, 프로젝트별 버전 관리 필요
- 현재 JSON 백업에는 `IndexedDB` 원본이 **제외**됨. 차기 버전의 백업/내보내기는 원본 포함 ZIP을 제안
- 데이터 마이그레이션은 `initialData.version` 기반으로 도입할 것

## AI Provider 연결을 위한 확장 인터페이스(예정)

```ts
interface MusicProvider {
  id: string;
  capabilities: ('lyrics'|'composition'|'arrangement'|'singing'|'stems')[];
  submit(input: MusicJob): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<{ status: string; progress?: number }>;
  downloadResult(jobId: string): Promise<MusicAssets>;
}
interface VideoProvider {
  id: string;
  submit(input: VideoJob): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<{ status: string; progress?: number }>;
  downloadResult(jobId: string): Promise<VideoAssets>;
}
```

실제 계약/엔드포인트/인증 방식은 Provider API를 검증한 후 정합니다. 특정 외부 서비스의 API 가능 여부는 현재 확인되지 않았습니다. UI에서 "지원 예정"으로 표기하고 실제 연동은 하지 않습니다.

## v0.2 우선순위

1. 오디오 업로드 → 프로젝트 트랙 클립에 연결, 파형 렌더링 및 실제 재생·정지
2. 타임라인 초/마디 단위 이동과 오디오 클립 배치, `Web Audio API` 기반 기본 믹싱
3. MIDI 파일 불러오기/편집 데이터 구조 설계
4. 원본 파일까지 포함한 프로젝트 백업·복원 ZIP
5. 캐릭터 여러 이미지를 장면과 연결하고 스토리보드 이미지 수동 지정
6. 브라우저 기반 프로토타입을 필요 시 Electron/Tauri 데스크톱 래퍼로 포장

## 이후 버전의 위험/설계 쟁점

- 타인의 음성/인물 모델 학습 시 동의 범위 기록, 학습 삭제·접근 제어
- 학습용과 단순 Reference 자료의 물리적 격리 및 모델 사용 제한
- 오디오 Provider 결과가 편집 가능한 stems/MIDI인지 여부(Provider별 상이)
- 캐릭터 Identity Lock은 영상 모델이 실질적으로 지원하는지에 따라 품질 검증 필요
- MV Lip Sync는 보컬 오디오·음소 시간 정렬·캐릭터 형태(2D/3D/실사)에 따라 각기 다른 파이프라인 필요
- 브라우저 저장은 큰 학습 데이터/영상에 부적합할 수 있으므로 로컬 프로젝트 저장소/백엔드 작업 큐가 장기적으로 필요
