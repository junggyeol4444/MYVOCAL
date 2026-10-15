# MYVOCAL Studio — STEP83 개발 및 검증 보고서

작성일: 2026-10-14

## 개발 기준과 순서
- 입력 원본: `MYVOCAL-Studio-Step82-LocalOnly.zip` (원본 541개 파일).
- 이번 개발: **83단계 — 3D 캐릭터 시스템**만 수행했습니다.
- 66개 제품 기획, 100단계 순서, Step82까지의 음악·Voice·Character·Video/2D 애니메이션 소스와 파일 저장 구조를 유지합니다. 84단계 3D 무대, 85단계 Lip Sync 및 90단계 가상 밴드 기능은 구현하지 않았습니다.

## 83단계 구현 내용
1. 기존 Character Studio 카드에서 등록된 `.vrm`, `.glb`, 포함형 `.gltf` 원본을 선택하여 IndexedDB에서 로컬 로딩합니다.
2. glTF 2.0 GLB의 청크, 버퍼/액세서, 노드 계층, 기본 메시/UV/텍스처, 스킨·조인트, Morph Target, glTF 애니메이션 채널을 읽습니다. VRM 0.x와 VRM 1.0 휴머노이드 본 및 표정 바인딩을 분석합니다.
3. 자체 WebGL1 렌더러에서 실제 정점 메시·로컬 임베디드 텍스처를 표시하고, 기본 단색 재질과 원근 카메라·깊이 테스트로 모델을 미리 봅니다. 본 스킨·모프 정점을 CPU에서 계산하여 GPU 버퍼에 보냅니다.
4. VRM 휴머노이드 본에 대기/고개 끄덕이기/오른팔 흔들기 프리셋을 적용할 수 있습니다. 파일에 포함된 glTF 모션 채널은 선택하여 재생할 수 있습니다. 선택한 본/노드의 Z축 회전을 수동 조정할 수 있습니다.
5. VRM 표정이 실제 Morph에 매핑돼 있다면 웃음·분노·슬픔 등 표정을 강도로 조정합니다. 매핑 없는 표정은 연결되지 않았다고 명시합니다.
6. 미리보기의 재생/일시정지, 시점 방향, 속도, PNG 스냅샷, 본/표정 설정 JSON 내보내기를 지원합니다.
7. `character.rig3d`에 설정만 저장하고, 원본 모델 파일 및 Step81/82 레이어/모션 데이터는 수정하지 않습니다. 프로젝트 내보내기·복원 시 모델 자산 ID가 바뀌어도 새 ID로 다시 연결합니다.
8. 길이·접근 범위·순환 노드 계층 검증을 통해 손상 파일과 외부 리소스를 차단합니다. 모델은 최대 40MB의 기존 등록 정책을 따르며, 압축 모델은 미지원 메시지를 표시합니다.

## 실제 실행한 테스트
- JavaScript 전체 테스트 (빌드 이후 최종 회귀): **1,580 / 1,580 통과**. 신규 STEP83 테스트 **17 / 17 통과**.
- Go 전체 단위 테스트: `go test ./...` **통과**.
- Go 경합 검사: `go test -race -count=1 ./...` **통과**.
- Go 정적 검사: `go vet ./...` **통과**.
- Python 도구 테스트: **4 / 4 통과**.
- GLB/VRM 0.x/VRM 1.0/포함형 glTF 합성 테스트 데이터로 실제 메타데이터·정점 파싱, 애니메이션 포즈 변경, 표정 바인딩, 외부 참조 및 손상 데이터 차단, 프로젝트 백업의 `rig3d.assetId` 재매핑을 검증했습니다.
- `node scripts/build-standalone.cjs` **성공** (실행 HTML에 83단계 모듈 포함).
- `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-H=windowsgui'` **성공** (Windows x64 GUI PE 실행 파일).
- 빌드한 EXE에 `STEP83`, `Character3dRenderer`, `VRMC_vrm` 코드 포함 검사 **통과**.
- Step82 원본 **541개 파일 전부 보존**, 기존 파일 **4개 수정**(기존 HTML/Characters/projectBundle/desktop HTML), **537개 원본 바이트 동일**, 원본 삭제 0개. 신규 추가는 별도 파일로 보존.

## 확인되지 않은 사항과 제한
- 실제 VRM 모델 파일(제3자 제작·다양한 VRM 라이브러리) 전체 호환성은 미검증입니다. 단위 테스트에는 자체 생성한 간단한 glTF/VRM 데이터가 사용되었습니다.
- 이 환경의 Chromium은 EGL 디스플레이 초기화에 실패하여 실제 화면 WebGL 픽셀 표시를 검증할 수 없었습니다. Windows 10/11 실기기 GUI 클릭·VRM 재생·PNG 다운로드도 **미검증**입니다. 실행 파일이 만들어졌다는 것은 실제 Windows 작동 확인이 아닙니다.
- 범용 VRM 완전 렌더러가 아닙니다. MToon/PBR 정확한 셰이딩, KTX2/Draco/Meshopt 압축, 스파스 액세서, 외부 .bin·이미지로 분리된 glTF, CUBICSPLINE 동작 보간, 표정별 특수 룩·물리 시뮬레이션/스프링 본, 오디오 동기화는 지원하지 않습니다.
- VRM 본 매핑이 없는 GLB는 사전 설정한 대기/팔/머리 동작의 대상이 없어 자동 움직임이 보이지 않을 수 있습니다. 수동 노드 회전 및 모델 내부 glTF 모션을 사용하세요.
- 이번 단계는 **3D 모델 불러오기·기본 표정/본/모션 조작과 미리보기**입니다. 실제 3D 무대 영상 제작, 완성 MP4 및 가사 기반 Lip Sync는 구현하지 않았습니다.

## Windows에서 사용 방법
1. 누적 ZIP을 풀고 `MYVOCAL-Step83-Windows.exe`를 실행합니다. 이전 버전의 동일 브라우저 프로필과 로컬 프로젝트 자료는 그대로 사용합니다.
2. Character Studio → 새 캐릭터 등록에서 **3D 캐릭터 / VRM**을 선택하고 본인 제작 또는 사용 허가받은 VRM/GLB 파일을 등록합니다. 이미 등록한 캐릭터 모델도 사용할 수 있습니다.
3. 등록된 캐릭터 카드에서 **STEP83 · 3D 캐릭터 시스템**을 누릅니다.
4. 원본 모델을 선택하면 WebGL 미리보기와 메시·본·모션 수가 표시됩니다. 모션 프리셋/내장 애니메이션·표정·본을 조정하고 재생합니다.
5. 필요하면 **현재 화면 PNG**, **본·표정 설정 JSON**을 출력하고 **캐릭터 3D 설정 저장**을 눌러 프로젝트에 재사용합니다.
6. 이미지가 보이지 않으면 그래픽 드라이버의 WebGL 지원 및 모델 형식/내장 텍스처/압축 여부를 확인하세요. 원본 파일은 변경되지 않습니다.

## 변경한 기존 파일
- `source/MYVOCAL-Studio-source/src/pages/Characters.jsx`
- `source/MYVOCAL-Studio-source/src/lib/projectBundle.js`
- `source/MYVOCAL-Studio-source/MYVOCAL-Studio-v1.8.html` (누적 단일 HTML)
- `source/desktop/index.html` (EXE 내장)

## 새 파일
- `source/MYVOCAL-Studio-source/src/lib/character3d.js`
- `source/MYVOCAL-Studio-source/src/lib/character3dRenderer.js`
- `source/MYVOCAL-Studio-source/src/components/Character3dEditor.jsx`
- `source/MYVOCAL-Studio-source/tests/character-3d.test.mjs`
- `MYVOCAL-Step83-Windows.exe`, 본 보고서, 자동 테스트 로그 및 SHA-256 목록

## 다음 단계
- **84단계 — 3D 무대 연출** (미착수). 원래 로드맵을 그대로 유지합니다.
