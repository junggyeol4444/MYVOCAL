// 원본 66항 13·55·58: 자료를 업로드하지 않은 사용자의 선택적 자동 가수
// 실제 설치된 SD 생성 첫 장면 이미지를 다른 장면의 img2img 원본으로 재사용.
// 프로젝트의 기존 이미지, 인물, 설정과 녹음은 수정하거나 삭제하지 않는다.
// 이는 동일성 향상을 위한 이미지 참조이며 학습된 Identity Lock 보증이 아니다.
const IMAGE_ID=/^img_[A-Za-z0-9_-]{1,80}$/;
const initialKind='MYVOCAL_AUTO_SINGER_FIRST_IMAGE_V1';
const sourceKind='ComfyUI local auto singer';
const allowedScene=s=>!!s&&typeof s.id==='string'&&!s.characterId&&!s.personMv&&!s.characterMv;

export function validateAutoVirtualSinger(project,{enabled=false}={}){
 if(!enabled)return {enabled:false,anchor:null};
 if(!project?.id||project.videoMode!=='auto'||!Array.isArray(project.scenes)||
   !project.scenes.length||project.characterId||project.scenes.some(s=>!allowedScene(s)))
  throw Error('AI 자동 가수는 사람·캐릭터 원본이 연결되지 않은 자동 MV 프로젝트에서만 선택할 수 있습니다.');
 const anchor=project.autoVirtualSingerImageV1||null;
 if(!anchor){
  if(project.scenes.some(s=>s.imageAssetId||s.videoClipAssetId))
   throw Error('기존 생성·수동 장면이 있는 프로젝트는 자동 가수 원본으로 덮어쓰지 않습니다. 새 자동 MV 프로젝트에서 시작하세요.');
  return {enabled:true,anchor:null};
 }
 if(anchor.version!==1||anchor.sourceProjectId!==project.id||
   typeof anchor.sourceSceneId!=='string'||!IMAGE_ID.test(anchor.sourceAssetId)||
   typeof anchor.sourceKey!=='string'||anchor.sourceKey.length>8192)
  throw Error('기존 자동 가수 첫 장면의 출처 기록이 올바르지 않습니다.');
 const scene=project.scenes.find(s=>s.id===anchor.sourceSceneId);
 if(!scene||scene.imageAssetId!==anchor.sourceAssetId||
   scene.imageGeneration?.source!==sourceKind||scene.imageGeneration.key!==anchor.sourceKey)
  throw Error('자동 가수 첫 장면 이미지가 변경됐습니다. 기존 영상은 보존하고 사용자의 확인을 기다립니다.');
 return {enabled:true,anchor};
}

export function autoSingerFirstImageRequest(request){
 if(!request?.key||!request?.prompt)throw Error('자동 가수의 장면 이미지 설명이 없습니다.');
 const key=JSON.stringify([initialKind,request.key]);
 if(key.length>8192)throw Error('자동 가수의 이미지 생성 식별 정보가 너무 깁니다.');
 return {...request,key,
  prompt:('single original virtual singer as main character, clear recognizable face, consistent hair and costume, stage performer, one protagonist only. '+request.prompt).slice(0,3000),
  negative:(request.negative+', additional singers, cloned faces, multiple protagonists').slice(0,600)};
}

export function recordAutoSingerFirstImage(project,sceneId,assetId,request){
 const plan=validateAutoVirtualSinger(project,{enabled:true});
 if(plan.anchor||!IMAGE_ID.test(assetId)||!request?.key)
  throw Error('자동 가수 첫 장면 원본은 기존 자료와 충돌 없이 한 번만 등록합니다.');
 const scene=project.scenes.find(s=>s.id===sceneId);
 if(!scene||scene.imageAssetId!==assetId||scene.imageGeneration?.source!==sourceKind||
   scene.imageGeneration.key!==request.key)
  throw Error('실제 생성·저장된 첫 가수 이미지가 확인되지 않습니다.');
 return {...project,autoVirtualSingerImageV1:{version:1,sourceProjectId:project.id,
  sourceSceneId:sceneId,sourceAssetId:assetId,sourceKey:request.key}};
}

export function autoSingerReference(project,scene,{enabled=false}={}){
 const plan=validateAutoVirtualSinger(project,{enabled});
 if(!plan.enabled||!plan.anchor||!scene||scene.id===plan.anchor.sourceSceneId)return null;
 return {kind:'auto-generated',assetId:plan.anchor.sourceAssetId,
  denoise:.27,source:'project-generated-singer',sourceProfileId:project.id};
}

export function autoSingerRequest(project,scene,request,{enabled=false}={}){
 const plan=validateAutoVirtualSinger(project,{enabled});
 if(!plan.enabled)return request;
 if(!plan.anchor||scene?.id===plan.anchor.sourceSceneId)
  return autoSingerFirstImageRequest(request);
 return request;
}
