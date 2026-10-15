# MYVOCAL Studio Step78 — 로컬 AI 영상 생성 엔진

**100단계 로드맵 78단계만 구현.** Step77의 스토리보드 정지 이미지에서 ComfyUI의 실제 SVD/SVD-XT 모델로 **장면별 짧은 움직이는 영상 클립**을 생성·저장한다. 79단계(Image-to-MV), 80단계(Character-to-MV), 98단계(MP4 최종 출력)는 진행하지 않았다.

## 동작 순서

1. Step77 Windows 프로그램으로 음악 프로젝트와 MV Storyboard를 연다. 기존 Step77에서 해당 장면의 PNG/JPEG 정지 이미지를 생성해 둔다.
2. PC에 **ComfyUI와 Stable Video Diffusion 이미지-투-비디오 체크포인트**를 사용자 책임으로 별도 설치한다. ComfyUI를 로컬 `127.0.0.1:8188`로 구동한다. 프로그램에는 AI 체크포인트 또는 ComfyUI 실행파일이 포함되지 않는다.
3. MV 화면 Step78에서 **ComfyUI 영상 모델 확인**을 누른다. 이 기능은 모델(`ImageOnlyCheckpointLoader`)과 필수 ComfyUI 노드가 모두 로컬에 있는지 검사한다. Step77 이미지용 모델 목록과 다르다.
4. SVD 체크포인트 선택 후 14 또는 25 프레임, 6/8 FPS, 1~40 생성 스텝, Motion Bucket 1~255, 시드를 설정하고 **선택 장면 AI 영상 생성**을 누른다. 실제 SVD 모델에 따라 지원 프레임/메모리 제약이 다르며 오류가 발생할 수 있다.
5. 모델이 성공적으로 실행되면 결과 **애니메이션 WebP 영상**이 별도 IndexedDB 파일로 저장되며 장면에 연결된다. 기존 스토리보드 이미지/오디오/보컬/캐릭터는 보존된다. 장면의 **영상 클립 저장** 버튼을 눌러 `.webp`로 내보낼 수 있다.
6. 기존 `.myvocal.json` 전체 프로젝트 백업 및 복원 시 이미지와 영상 클립을 모두 포함하며, 새로운 Asset ID로 재매핑한다. 삭제·덮어쓰기 자동 실행 없음.

## 기술

- Windows EXE는 기존 전용 localhost 서버/세션 키/프로필 저장소를 그대로 사용한다. `GET /api/video/health`, `POST /api/video/generate`는 세션 보호가 적용된다.
- 임의 원격 주소 또는 외부 클라우드 Provider 없음. `127.0.0.1`의 사용자가 실행 중인 ComfyUI 포트에만 접속한다.
- ComfyUI 기본 노드 사용: `ImageOnlyCheckpointLoader`, `LoadImage`, `SVD_img2vid_Conditioning`, `VideoLinearCFGGuidance`, `KSampler`, `VAEDecode`, `SaveAnimatedWEBP`. 작업별 이미지 업로드 후 `/prompt`, `/history`, `/view`를 호출한다.
- 이미지 업로드 최대 12MiB, PNG/JPEG 실제 헤더·크기 검증. WebP 최종 결과 최대 40MiB, RIFF/애니메이션 프레임 수 검증. API 입력 검증 및 로컬 세션 차단 확인.
- 생성 도중 프로젝트, 선택 장면 이미지, 장면 내용, 캐릭터, 연출 설정 또는 시간 구간이 바뀌면 결과를 자동 적용하지 않고 이전 파일을 유지한다.

## 제약 및 미검증

- **실제 ComfyUI 모델 추론·GPU 결과는 이 개발 환경에서 테스트하지 않았다.** ComfyUI 프로토콜 모의 HTTP 서버로 노드 조회→이미지 등록→작업 생성→history→실제 애니메이션 WebP 반환까지 검증했다. 실제 모델/PC에서 실패할 수 있다.
- **영상 클립 길이**: 14/6 ≈ 2.33초, 25/8 = 3.125초. Storyboard 12초짜리 장면을 12초 영상으로 자동 늘리지 않는다.
- WebP는 움직이는 이미지 파일이다. **MP4 변환/음원 합성/전체 MV 타임라인 렌더링은 지원하지 않는다.** FFmpeg 자동 변환 경로는 검증에 실패하여 Step78 UI에서 제공하지 않는다.
- 실제 인물의 사진 기반 영상/고정 얼굴 보장, 캐릭터 Lip Sync, 춤, 2D/3D 애니메이션, 캐릭터 교체는 이후 정해진 단계에서 진행한다.
- Windows 10/11 실기기 실행·UI 클릭 동작·프로젝트 저장/복원 실기기 검증은 미실시. Windows x64 EXE 교차 빌드와 API 및 프로젝트 단위 테스트가 실기기를 대체하지 않는다.
- standalone HTML(`file://`)은 Go 세션 브리지가 없어 로컬 모델 호출이 되지 않는다. Windows EXE에서 실행해야 한다.

### 참고 워크플로

ComfyUI 공식 워크플로 예시: https://github.com/comfyanonymous/ComfyUI_examples/blob/master/video/workflow_image_to_video.json
