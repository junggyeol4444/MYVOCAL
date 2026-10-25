// Sequential real local image -> short video generation for unlinked MV scenes.
// Uses the EXISTING ComfyUI and SVD endpoints, and existing IndexedDB assets.
// Never deletes existing images, clips, characters, models or projects.
import {buildSceneImageRequest,applySceneImage,generateComfyImage} from './mvSceneImages.js';
import {videoSourceKey,applySceneVideo,generateLocalVideoClip,readSourceFrame} from './mvSceneVideos.js';
import {buildMvDirectionPlan} from './mvDirection.js';
import {getFile,putFileNew} from './assetDb.js';
import {genId} from './schema.js';
import {assertSvdAutoSceneClipDuration} from './mvSvdClipTiming.js';
import {validatePersonSource,personPhotoAssets,generatePersonMvImage} from './imageToMv.js';
import {validateCharacterArtwork,characterArtworkAssets,generateCharacterMvImage} from './characterToMv.js';
import {chooseSceneReference} from './characterSceneReference.js';
import {validateAutoVirtualSinger,autoSingerReference,autoSingerRequest,recordAutoSingerFirstImage} from './autoVirtualSingerImages.js';
// A registered character reuses the SAME sampling seed in each scene.
// img2img still uses the original authorized reference; seed consistency
// reduces variation but does not guarantee neural identity equivalence.
export function stableMvCharacterSeed(projectId,characterId){
 const key=String(projectId||'')+'|'+String(characterId||'');
 if(!projectId||!characterId||key.length>600)throw Error('고정할 캐릭터·프로젝트 ID가 올바르지 않습니다.');
 let value=2166136261;
 for(const point of key){value=Math.imul(value^point.codePointAt(0),16777619);}
 return (value>>>0)%2000000000;
}
const sceneReference=(scene,character)=>{
 if(!scene?.personMv&&!scene?.characterMv)return null;
 if(scene.personMv&&scene.characterMv)throw Error('같은 장면에 사람과 캐릭터 원본을 동시에 연결할 수 없습니다.');
 if(scene.personMv){
  if(scene.personMv.personId!==scene.characterId||character?.id!==scene.personMv.personId)throw Error('등록된 실제 사람과 장면 캐릭터 ID가 다릅니다.');
  validatePersonSource(character,scene.personMv.referenceAssetId);
  return {assetId:scene.personMv.referenceAssetId,denoise:scene.personMv.denoise,kind:'person'};
 }
 if(scene.characterMv.characterId!==scene.characterId||character?.id!==scene.characterMv.characterId)throw Error('등록된 캐릭터와 장면 ID가 다릅니다.');
 validateCharacterArtwork(character,scene.characterMv.referenceAssetId);
 return {assetId:scene.characterMv.referenceAssetId,denoise:scene.characterMv.denoise,kind:'character'};
};
// 등록된 동일 원본 참조는 사용자가 참조 이미지 포함을 선택한 경우에만 사용한다.
// 기존 장면의 수동 personMv/characterMv 연결을 우선하며 원본 연결 메타데이터를 변경하지 않는다.
export function authorizedAutoSceneReference(scene,character,{includeReferences=false}={}){
 if(!includeReferences||scene?.personMv||scene?.characterMv||!character?.id||
    character.identityLock===false)return null;
 if(character.kind==='person'){
  if(character.rights!=='self'&&!(character.rights==='licensed'&&String(character.rightsNote||'').trim()))return null;
  const first=personPhotoAssets(character).find(a=>['portrait','front'].includes(a.role))||
   personPhotoAssets(character)[0];
  if(!first)return null;
  // 장면의 실제 카메라·동작 문구에 맞는 같은 인물의 정면/측면/전신 사진 사용.
  const chosen=chooseSceneReference(character,scene,first.id);
  validatePersonSource(character,chosen.assetId);
  return {assetId:chosen.assetId,denoise:.25,kind:'person',source:'registered-identity',
   cameraView:chosen.view,referenceRole:chosen.role,sourceProfileId:chosen.sourceProfileId};
 }
 if(character.kind==='character'){
  if(!['self','owned'].includes(character.rights)&&
     !(character.rights==='licensed'&&String(character.rightsNote||'').trim()))return null;
  const first=characterArtworkAssets(character).find(a=>['portrait','front'].includes(a.role))||
   characterArtworkAssets(character)[0];
  if(!first)return null;
  // 해당 캐릭터의 여러 원화 중 장면 시점에 맞는 것을 실제 img2img에 전달.
  const chosen=chooseSceneReference(character,scene,first.id);
  validateCharacterArtwork(character,chosen.assetId);
  return {assetId:chosen.assetId,denoise:.25,kind:'character',source:'registered-identity',
   cameraView:chosen.view,referenceRole:chosen.role,sourceProfileId:chosen.sourceProfileId};
 }
 return null;
}
export function planMvBatch(project,{maxScenes=120,includeReferences=false}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length)throw Error('MV 장면이 있는 프로젝트를 선택해 주세요.');
 if(project.scenes.length>maxScenes)throw Error(`한 번에 최대 ${maxScenes}개 장면만 처리합니다. 구간을 나누어 실행하세요.`);
 const sceneIds=[];let already=0,linked=0;const knownIds=new Set();
 for(const scene of project.scenes){
  if(!scene||typeof scene.id!=='string'||!scene.id||knownIds.has(scene.id))throw Error('누락되거나 중복된 장면 ID가 있습니다.');
  knownIds.add(scene.id);
  if(scene.videoClipAssetId){already++;continue}
  // Personal photos and 2D artwork require their separate, consent-aware img2img pipeline.
  if(scene.personMv||scene.characterMv){linked++;if(!includeReferences)continue}
  sceneIds.push(scene.id);
 }
 return {sceneIds,already,linked,total:sceneIds.length};
}
export async function runMvBatch({project,data,checkpoint,videoModel,port,session,imageSteps=20,width=768,height=448,frames=14,fps=6,videoSteps=20,motion=127,includeReferences=false,autoVirtualSinger=false,current,currentData=()=>data,commit,progress,signal,
 generateImage=generateComfyImage,generateReferencePerson=generatePersonMvImage,generateReferenceCharacter=generateCharacterMvImage,generateVideo=generateLocalVideoClip,loadFile=getFile,saveFile=putFileNew,sourceFrame=readSourceFrame,idFactory=genId}={}){
 const plan=planMvBatch(project,{includeReferences});
 validateAutoVirtualSinger(project,{enabled:autoVirtualSinger});
 if(!session||typeof session!=='string')throw Error('Windows EXE의 로컬 세션이 없습니다.');
 if(!checkpoint||!videoModel||!Number.isSafeInteger(port)||port<1024||port>65535||port===58319)throw Error('ComfyUI 이미지·SVD 모델 및 포트를 확인하세요.');
 if(!Number.isSafeInteger(imageSteps)||imageSteps<1||imageSteps>50||!Number.isSafeInteger(videoSteps)||videoSteps<1||videoSteps>40||!Number.isSafeInteger(frames)||(frames!==14&&frames!==25)||!Number.isSafeInteger(fps)||(fps!==6&&fps!==8)||!Number.isSafeInteger(motion)||motion<1||motion>255||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<256||height<256||width>1024||height>1024||width%64!==0||height%64!==0||width*height>1024*1024)throw Error('이미지·영상 생성 옵션 범위가 올바르지 않습니다.');
 if(typeof current!=='function'||typeof commit!=='function')throw Error('프로젝트 저장 연결이 필요합니다.');
 const checkCancel=()=>{if(signal?.aborted)throw Error('사용자가 자동 생성을 취소했습니다. 기존 생성 자료는 유지합니다.');};
 checkCancel();const initialId=project.id;let generatedImages=0,generatedVideos=0;
 const resolvedReference=(scene,character,live)=>
  sceneReference(scene,character)||
  authorizedAutoSceneReference(scene,character,{includeReferences})||
  autoSingerReference(live,scene,{enabled:autoVirtualSinger});
 const sceneImageRequest=(live,scene,character,direction,reference)=>
  autoSingerRequest(live,scene,buildSceneImageRequest(live,scene,character,direction,reference),{enabled:autoVirtualSinger});
 for(const [index,sceneId] of plan.sceneIds.entries()){
  checkCancel();let live=current();if(!live||live.id!==initialId)throw Error('다른 프로젝트로 이동했습니다. 자동 생성을 중단했습니다.');
  let scene=live.scenes.find(s=>s.id===sceneId);
  if(!scene||(!includeReferences&&(scene.personMv||scene.characterMv))||scene.videoClipAssetId)throw Error('장면이 변경됐습니다. 기존 미디어를 보존하고 중단했습니다.');
  let character=(currentData()?.characters||[]).find(c=>c.id===(scene.characterId||live.characterId));
  const reference=resolvedReference(scene,character,live);
  if(character&&(!['self','owned','licensed'].includes(character.rights)||
   (character.rights==='licensed'&&!String(character.rightsNote||'').trim())))
   throw Error('사용 허가가 확인되지 않은 인물·캐릭터로 AI 이미지를 생성할 수 없습니다.');
  let direction=null;try{direction=buildMvDirectionPlan(live,currentData()?.characters||[]).scenes.find(s=>s.id===sceneId)}catch{}
  let request=sceneImageRequest(live,scene,character,direction,reference);
  if(!scene.imageAssetId){
   progress?.(`${index+1}/${plan.total}장면: ComfyUI 이미지 생성 중`);
   const seed=character?.id?stableMvCharacterSeed(initialId,character.id):
     reference?.source==='project-generated-singer'?stableMvCharacterSeed(initialId,'auto-virtual-singer'):
     Math.floor(Math.random()*2000000000);
   let referenceImage=null;
   if(reference){
    const original=await loadFile(reference.assetId);
    if(!(original instanceof Blob)||!['image/png','image/jpeg'].includes(original.type))throw Error('등록된 인물·캐릭터의 원본 PNG/JPEG가 없습니다.');
    referenceImage=await sourceFrame(original);checkCancel();
   }
   const settings={port,checkpoint,prompt:request.prompt,negative:request.negative,width,height,steps:imageSteps,seed};
   const blob=reference?
     await (reference.kind==='person'?generateReferencePerson:generateReferenceCharacter)({...settings,imageData:referenceImage,denoise:reference.denoise},session,signal):
     await generateImage(settings,session,signal);
   checkCancel();live=current();scene=live?.scenes?.find(s=>s.id===sceneId);
   if(!live||live.id!==initialId||!scene)throw Error('이미지 생성 중 장면이 변경됐습니다.');
   const latestCharacter=(currentData()?.characters||[]).find(c=>c.id===(scene.characterId||live.characterId));
   if(JSON.stringify(resolvedReference(scene,latestCharacter,live))!==JSON.stringify(reference)||
     sceneImageRequest(live,scene,latestCharacter,direction,reference).key!==request.key)
    throw Error('이미지 생성 중 캐릭터 원본 또는 장면 내용이 변경됐습니다.');
   checkCancel();const id=idFactory('img');await saveFile(id,new File([blob],`MYVOCAL-MV-${sceneId}-${seed}.${blob.type==='image/jpeg'?'jpg':'png'}`,{type:blob.type}));
   const source=reference?.kind==='person'?'person-img2img':
    reference?.kind==='character'?'character-img2img':
    reference?.kind==='auto-generated'?'auto-singer-img2img':
    autoVirtualSinger&&!live.autoVirtualSingerImageV1?'auto-singer-anchor':'plain';
   const newScene=applySceneImage(live,sceneId,id,request,{seed,checkpoint,source});
   // 첫 실제 SD 파일 저장이 완료된 경우에만 가수 원본을 프로젝트에 기록한다.
   const updated=autoVirtualSinger&&!live.autoVirtualSingerImageV1?
    recordAutoSingerFirstImage(newScene,sceneId,id,request):newScene;
   commit(updated);generatedImages++;
   checkCancel();live=current();scene=live?.scenes?.find(s=>s.id===sceneId);
  }
  if(!scene?.imageAssetId)throw Error('이미지 저장 상태를 확인할 수 없습니다.');
  character=(currentData()?.characters||[]).find(c=>c.id===(scene.characterId||live.characterId));
  if(JSON.stringify(resolvedReference(scene,character,live))!==JSON.stringify(reference))throw Error('장면 사람·캐릭터 참조가 변경됐습니다.');
  direction=null;try{direction=buildMvDirectionPlan(live,currentData()?.characters||[]).scenes.find(s=>s.id===sceneId)}catch{}
  request=sceneImageRequest(live,scene,character,direction,reference);
  if(scene.imageGeneration?.key!==request.key)throw Error('장면과 생성 이미지가 일치하지 않습니다. 수동으로 확인해 주세요.');
  const sourceKey=videoSourceKey(live,scene,request),image=await loadFile(scene.imageAssetId);
  if(!image)throw Error('장면 이미지 파일이 없어 원본을 유지하고 중단했습니다.');
  const imageData=await sourceFrame(image);
  progress?.(`${index+1}/${plan.total}장면: SVD 영상 클립 생성 중`);
  // 원본 수동 장면은 기존 영상 설정을 그대로 사용한다.
  const isFullSongAuto=scene.generatedBy==='full-song-auto-scene';
  const sceneFrames=isFullSongAuto?25:frames,sceneFps=isFullSongAuto?8:fps;
  // 등록된 동일 원화·사진을 사용하는 자동 장면에서는 인물별
  // SVD 시드도 일정하게 유지한다. 참조 없는 배경은 장면별 독립 시드를 사용한다.
  // 이것만으로 모델의 얼굴 일관성이 보장되지는 않으며 실제 GPU 품질 확인이 필요하다.
  const seed=isFullSongAuto?
   (reference?.source==='project-generated-singer'?stableMvCharacterSeed(initialId,'auto-virtual-singer'):
    reference&&character?.id?stableMvCharacterSeed(initialId,character.id):
    stableMvCharacterSeed(initialId,sceneId+'|background')):
   Math.floor(Math.random()*2000000000);
  const clip=await generateVideo({port,checkpoint:videoModel,imageData,
   frames:sceneFrames,fps:sceneFps,steps:videoSteps,motion,seed},session,signal);
  const actualSvd=isFullSongAuto?
   await assertSvdAutoSceneClipDuration(clip,Number(scene.end)-Number(scene.start),{signal}):null;
  checkCancel();live=current();scene=live?.scenes?.find(s=>s.id===sceneId);
  if(!live||live.id!==initialId||!scene||videoSourceKey(live,scene,request)!==sourceKey)throw Error('영상 생성 중 프로젝트 내용이 변경됐습니다. 기존 원본은 그대로 유지합니다.');
  const finalCharacter=(currentData()?.characters||[]).find(c=>c.id===(scene.characterId||live.characterId));
  if(JSON.stringify(resolvedReference(scene,finalCharacter,live))!==JSON.stringify(reference))throw Error('영상 생성 중 사람·캐릭터 참조가 변경됐습니다.');
  checkCancel();const clipId=idFactory('vid');await saveFile(clipId,new File([clip],`MYVOCAL-MV-${sceneId}-${seed}.${clip.type==='video/mp4'?'mp4':'webp'}`,{type:clip.type}));
  commit(applySceneVideo(live,sceneId,clipId,sourceKey,{checkpoint:videoModel,seed,
   frames:sceneFrames,fps:sceneFps,mime:clip.type,
   actualDurationSec:actualSvd?.durationSec,actualFrames:actualSvd?.frames}));generatedVideos++;
  progress?.(`${index+1}/${plan.total}장면 생성·저장 완료`);
 }
 return {...plan,generatedImages,generatedVideos,videoGenerated:generatedVideos>0,completedScenes:generatedVideos,fullMovieExported:false};
}