// 원본 66항 #51: 검토한 한국어 장면 수정 → 실제 설치된 SD/SVD 이미지·영상.
// 기존 장면·원본 사진·녹음·미디어는 덮어쓰지 않으며 새 자산만 추가한다.
import {applyMvInstruction93} from './mvNaturalEdit93.js';
import {buildSceneImageRequest,applySceneImage,validateGeneratedImage,generateComfyImage} from './mvSceneImages.js';
import {videoSourceKey,applySceneVideo,generateLocalVideoClip,readSourceFrame} from './mvSceneVideos.js';
import {validatePersonSource,personPhotoAssets,generatePersonMvImage} from './imageToMv.js';
import {validateCharacterArtwork,characterArtworkAssets,generateCharacterMvImage} from './characterToMv.js';
import {chooseSceneReference} from './characterSceneReference.js';
import {autoSingerReference,autoSingerRequest,validateAutoVirtualSinger,generateAutoSingerReferenceImage} from './autoVirtualSingerImages.js';
import {buildMvDirectionPlan} from './mvDirection.js';
import {inspectSvdClipDuration,assertSvdAutoSceneClipDuration} from './mvSvdClipTiming.js';
import {getFile,putFilesAtomic} from './assetDb.js';
import {genId} from './schema.js';
const RIGHTS=new Set(['self','owned','licensed']);
function sourceReference(scene,character){
 if(scene.personMv&&scene.characterMv)throw Error('한 장면에 실제 사람과 캐릭터 원본을 함께 연결할 수 없습니다.');
 if(scene.personMv){
  if(scene.characterId!==character?.id||scene.personMv.personId!==character.id)throw Error('등록된 실제 사람 연결이 일치하지 않습니다.');
  validatePersonSource(character,scene.personMv.referenceAssetId);
  return {kind:'person',assetId:scene.personMv.referenceAssetId,denoise:scene.personMv.denoise};
 }
 if(scene.characterMv){
  if(scene.characterId!==character?.id||scene.characterMv.characterId!==character.id)throw Error('등록된 2D 캐릭터 연결이 일치하지 않습니다.');
  validateCharacterArtwork(character,scene.characterMv.referenceAssetId);
  return {kind:'character',assetId:scene.characterMv.referenceAssetId,denoise:scene.characterMv.denoise};
 }
 // 사용자가 이미 '원본 이미지 포함'으로 일괄 생성한 자동 장면에만
 // 같은 프로필의 원본 이미지를 다시 연결한다. 새로운 사용 허가를 추측하지 않는다.
 // 기존 참조 기록의 실제 asset ID를 검사하므로 다른 사람/캐릭터 혼입을 방지한다.
 if(character?.id&&character.identityLock!==false&&
   ['ComfyUI local person img2img','ComfyUI local character img2img'].includes(scene.imageGeneration?.source)){
  let saved=[];
  try{saved=JSON.parse(scene.imageGeneration?.key||'[]');}catch{}
  if(!Array.isArray(saved))saved=[];
  const [tag,recordedId,recordedKind,originalAsset,denoise]=saved.slice(-5);
  if(tag==='registered-identity'){
   if(recordedId!==character.id||recordedKind!==character.kind)
    throw Error('영상 원본과 연결된 사람·캐릭터가 바뀌었습니다. 다시 참조 대상을 확인하세요.');
   if(!Number.isFinite(denoise)||denoise<.15||denoise>.75)
    throw Error('기존 등록 원본 변환 강도 기록이 올바르지 않습니다.');
   if(recordedKind==='person'){
    validatePersonSource(character,originalAsset);
    if(!personPhotoAssets(character).some(a=>a.id===originalAsset))
     throw Error('기존 원본 사람 사진이 제거되어 재생성할 수 없습니다.');
   }else if(recordedKind==='character'){
    validateCharacterArtwork(character,originalAsset);
    if(!characterArtworkAssets(character).some(a=>a.id===originalAsset))
     throw Error('기존 원본 캐릭터 원화가 제거되어 재생성할 수 없습니다.');
   }else throw Error('기존 장면의 이미지 참조 종류가 올바르지 않습니다.');
   const matched=chooseSceneReference(character,scene,originalAsset);
   return {kind:recordedKind,assetId:matched.assetId,denoise,
    source:'registered-identity',sourceProfileId:character.id,cameraView:matched.view};
  }
 }
 if(character)throw Error('등록 인물·캐릭터는 장면에 원본 사진 또는 원화를 먼저 연결해야 합니다.');
 return null;
}
function validateSettings(o){
 if(!Number.isInteger(o.port)||o.port<1024||o.port>65535||o.port===58319||
 typeof o.session!=='string'||o.session.length<8||!o.checkpoint||!o.videoModel)
  throw Error('Windows EXE와 실제 설치된 SD/SVD 모델을 확인하세요.');
 if(!Number.isInteger(o.width)||!Number.isInteger(o.height)||o.width<256||o.height<256||
 o.width>1024||o.height>1024||o.width%64||o.height%64||o.width*o.height>1024*1024||
 !Number.isInteger(o.imageSteps)||o.imageSteps<1||o.imageSteps>50||
 !Number.isInteger(o.videoSteps)||o.videoSteps<1||o.videoSteps>40||
 ![14,25].includes(o.frames)||![6,8].includes(o.fps)||
 !Number.isInteger(o.motion)||o.motion<1||o.motion>255)
  throw Error('SD/SVD 생성 해상도·프레임·스텝 설정 오류');
}
export async function regenerateNaturalMvScene(project,plan,characters,{
 port,session,checkpoint,videoModel,width=768,height=448,imageSteps=20,
 frames=25,fps=8,videoSteps=20,motion=127,signal,current,
 currentCharacters=()=>characters,commit,loadFile=getFile,saveFiles=putFilesAtomic,
 newId=genId,generateImage=generateComfyImage,generatePerson=generatePersonMvImage,
 generateCharacter=generateCharacterMvImage,generateAutoSinger=generateAutoSingerReferenceImage,generateVideo=generateLocalVideoClip,
 sourceFrame=readSourceFrame,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!Array.isArray(characters)||
 typeof current!=='function'||typeof commit!=='function'||
 [loadFile,saveFiles,newId,generateImage,generatePerson,generateCharacter,generateVideo,sourceFrame].some(f=>typeof f!=='function'))
  throw Error('기존 프로젝트와 자산·저장 연결이 필요합니다.');
 validateSettings({port,session,checkpoint,videoModel,width,height,imageSteps,frames,fps,videoSteps,motion});
 const draft=applyMvInstruction93(project,plan);
 const scene=draft.scenes.find(s=>s.id===plan.sceneId),before=project.scenes.find(s=>s.id===plan.sceneId);
 const characterId=scene.characterId||draft.characterId||'';
 const character=characters.find(c=>c.id===characterId);
 if(characterId&&(!character||!RIGHTS.has(character.rights)||
 (character.rights==='licensed'&&!String(character.rightsNote||'').trim())))
  throw Error('등록 인물·캐릭터 사용 권한이 확인되지 않았습니다.');
 if(draft.autoVirtualSingerImageV1?.sourceSceneId===scene.id)
  throw Error('AI 자동 가수의 첫 원화는 후속 장면의 외형 기준입니다. 다른 장면을 수정하거나 새로운 자동 MV 프로젝트를 제작하세요.');
 const reference=sourceReference(scene,character)||
  autoSingerReference(draft,scene,{enabled:!!draft.autoVirtualSingerImageV1});
 if(reference&&(!Number.isFinite(reference.denoise)||reference.denoise<.15||reference.denoise>.75))
  throw Error('등록 사진·원화 변환 강도 오류');
 const scenesSnapshot=JSON.stringify(project.scenes),charactersSnapshot=JSON.stringify(characters);
 const guard=()=>{
  if(signal?.aborted)throw Error('실제 AI 영상 생성 취소 · 원본 보존');
  if(current()!==project||JSON.stringify(project.scenes)!==scenesSnapshot||
  JSON.stringify(currentCharacters())!==charactersSnapshot)
   throw Error('생성 중 원본 프로젝트·캐릭터 변경 · 기존 영상 보존');
 };
 guard();
 const direction=buildMvDirectionPlan(draft,characters).scenes.find(s=>s.id===scene.id);
 const request=autoSingerRequest(draft,scene,buildSceneImageRequest(draft,scene,character,direction,
  ['registered-identity','project-generated-singer'].includes(reference?.source)?reference:null),
  {enabled:!!draft.autoVirtualSingerImageV1});
 const seed=Math.floor(Math.random()*1999999000)+1;
 const imageSettings={port,checkpoint,prompt:request.prompt,negative:request.negative,width,height,steps:imageSteps,seed};
 let image;
 if(reference){
  const original=await loadFile(reference.assetId);guard();
  const imageData=await sourceFrame(original);guard();
  onProgress('사용 허가 원본으로 실제 로컬 SD img2img 생성 중');
  if(reference.kind==='auto-generated'){
   const anchor=validateAutoVirtualSinger(draft,{enabled:true}).anchor;
   if(!anchor||anchor.sourceAssetId!==reference.assetId)
    throw Error('실제 자동 가수의 첫 원본 이미지가 변경됐습니다.');
   image=await generateAutoSinger({...imageSettings,imageData,denoise:reference.denoise,
    sourceProjectId:project.id,sourceSceneId:anchor.sourceSceneId,
    sourceAssetId:anchor.sourceAssetId,sourceKey:anchor.sourceKey},session,signal);
  }else if(reference.kind==='person'){
   image=await generatePerson({...imageSettings,imageData,denoise:reference.denoise},session,signal);
  }else if(reference.kind==='character'){
   image=await generateCharacter({...imageSettings,imageData,denoise:reference.denoise},session,signal);
  }else throw Error('지원되지 않는 장면 참조 이미지 종류입니다.');
 }else{
  onProgress('실제 로컬 SD 장면 이미지 생성 중');
  image=await generateImage(imageSettings,session,signal);
 }
 guard();validateGeneratedImage(image);
 const imageId=newId('img');
 if(!/^img_[A-Za-z0-9_-]{1,80}$/.test(imageId)||imageId===before.imageAssetId)
  throw Error('새 이미지 ID 오류');
 const withImage=applySceneImage(draft,scene.id,imageId,request,{
  seed,checkpoint,source:reference?.kind==='person'?'person-img2img':
  reference?.kind==='character'?'character-img2img':
  reference?.kind==='auto-generated'?'auto-singer-img2img':'plain'});
 const imageScene=withImage.scenes.find(s=>s.id===scene.id);
 const sourceKey=videoSourceKey(withImage,imageScene,request);
 const fullSong=scene.generatedBy==='full-song-auto-scene';
 const renderFrames=fullSong?25:frames,renderFps=fullSong?8:fps;
 onProgress('수정된 SD 장면을 실제 로컬 SVD 영상으로 생성 중');
 const imageData=await sourceFrame(image);guard();
 const video=await generateVideo({port,checkpoint:videoModel,imageData,frames:renderFrames,
  fps:renderFps,steps:videoSteps,motion,seed:seed+1},session,signal);
 guard();
 const info=fullSong?
  await assertSvdAutoSceneClipDuration(video,Number(scene.end)-Number(scene.start),{signal}):
  await inspectSvdClipDuration(video,{signal});
 guard();
 if(!['video/mp4','image/webp'].includes(video.type)||info.durationSec<=0)
  throw Error('SVD가 실제 움직이는 영상 파일을 반환하지 않았습니다.');
 const videoId=newId('vid');
 if(!/^vid_[A-Za-z0-9_-]{1,80}$/.test(videoId)||videoId===before.videoClipAssetId)
  throw Error('새 영상 ID 오류');
 const withVideo=applySceneVideo(withImage,scene.id,videoId,sourceKey,{
  checkpoint:videoModel,frames:renderFrames,fps:renderFps,seed:seed+1,
  mime:video.type,actualDurationSec:info.durationSec,actualFrames:info.frames});
 const after=withVideo.scenes.find(s=>s.id===scene.id);
 const history=[...(project.mvNeuralNaturalEdits?.history||[]),{
  sceneId:scene.id,before,after:JSON.stringify(after),summary:plan.summary,
  at:new Date().toISOString()}].slice(-8);
 const result={...withVideo,videoEdits93:project.videoEdits93,
  mvNeuralNaturalEdits:{version:1,history}};
 const imageExt=image.type==='image/jpeg'?'jpg':'png',videoExt=video.type==='video/mp4'?'mp4':'webp';
 guard();
 onProgress('기존 자산과 별도로 실제 이미지·영상 2개 저장 중');
 await saveFiles([
  [imageId,new File([image],'MYVOCAL-자연어-장면-'+scene.id+'-'+seed+'.'+imageExt,{type:image.type})],
  [videoId,new File([video],'MYVOCAL-자연어-영상-'+scene.id+'-'+(seed+1)+'.'+videoExt,{type:video.type})]
 ]);
 guard();await Promise.resolve(commit(result));
 onProgress('실제 영상 수정 완료 · 이전 이미지·영상 연결 복원 가능');
 return {project:result,sceneId:scene.id,imageId,videoId,videoSeconds:info.durationSec,
  engine:'installed-local-SD-SVD'};
}
export function undoNeuralNaturalMvScene(project){
 const history=project?.mvNeuralNaturalEdits?.history||[],last=history.at(-1);
 if(!last)throw Error('복원할 실제 AI 장면 수정이 없습니다.');
 const scene=project.scenes?.find(s=>s.id===last.sceneId);
 if(!scene||JSON.stringify(scene)!==last.after)
  throw Error('이후 장면이 변경되어 이전 미디어를 안전하게 복원할 수 없습니다.');
 return {...project,scenes:project.scenes.map(s=>s.id===last.sceneId?last.before:s),
  mvNeuralNaturalEdits:{version:1,history:history.slice(0,-1)}};
}
