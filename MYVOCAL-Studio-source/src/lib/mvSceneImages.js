// Step77 — non-destructive scene-image prompt/metadata layer.
// Images stay in the existing IndexedDB asset store, not project localStorage JSON.
import {activeMvStyleGrade91} from './mvStyleReapply91.js';
const imageFields=['title','description','location','outfit','expression','action','camera','lighting'];
const text=(v,max=320)=>String(v??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,max);
export const MAX_SCENE_IMAGE_BYTES=12*1024*1024;
export function buildSceneImageRequest(project,scene,character=null,direction=null,autoReference=null){
 if(!project||!scene||!scene.id)throw Error('장면 또는 프로젝트가 없습니다.');
 const measuredStyle=activeMvStyleGrade91(project);
 const detail=imageFields.map(k=>text(scene[k])).join('|')+
 (scene.characterLookId?'|look:'+text(scene.characterLookId,130)+'|hair:'+text(scene.characterLookHair,180)+'|accessories:'+text(scene.characterLookAccessories,180):'');
 const charName=character?text(character.name,160):'';
 const charDescription=character?text(character.description,550):'';
 const appearance=character?.appearance&&typeof character.appearance==='object'?Object.entries(character.appearance).filter(([k,v])=>['hair','eyes','outfit','palette','accessories','body'].includes(k)&&v).map(([k,v])=>`${k}: ${text(v,160)}`).join(', ').slice(0,750):'';
 const role=direction?.direction||text(project.mvMode||'Story MV',70);
 const framing=direction?.framing||'';
 const fingerprint=[project.id,scene.id,detail,charName,charDescription,appearance,role,framing,
  ...(measuredStyle?['measured-mv-style',measuredStyle.brightness,measuredStyle.contrast,measuredStyle.saturation,...measuredStyle.color]:[])];
 // Preserve exact Step77/78 fingerprints for legacy scenes; append a photo identity only for Step79 scenes.
 if(scene.personMv)fingerprint.push(scene.characterId||'',scene.personMv.personId||'',scene.personMv.referenceAssetId||'',scene.personMv.denoise??null);
 if(scene.characterMv)fingerprint.push('Step80-character',scene.characterId||'',scene.characterMv.characterId||'',scene.characterMv.referenceAssetId||'',scene.characterMv.denoise??null);
 if(autoReference&&!scene.personMv&&!scene.characterMv)fingerprint.push('registered-identity',character?.id||'',autoReference.kind,autoReference.assetId,autoReference.denoise);
 const key=JSON.stringify(fingerprint);
 const pieces=['High-quality cinematic music video storyboard still frame, detailed environment, coherent composition',
  text(scene.description)||'music video scene',scene.personMv&&'Use the supplied real-person source photo as visual reference for this scene; preserve recognizable appearance where feasible',scene.characterMv&&'Use the supplied original 2D character artwork as the visual input; retain drawing style, clothing, colors and recognizable character features as far as the local model allows',autoReference&&!scene.personMv&&!scene.characterMv&&'Use the same registered authorized reference image for this character across all scenes; retain the original face, colors, outfit, and identity where feasible',scene.location&&`Setting: ${text(scene.location)}`,
  charName&&`Character: ${charName}`,charDescription&&`Character concept: ${charDescription}`,appearance&&`Character appearance: ${appearance}`,scene.outfit&&`Outfit: ${text(scene.outfit)}`,
  scene.expression&&`Facial expression: ${text(scene.expression)}`,
  scene.action&&`Action: ${text(scene.action)}`,scene.camera&&`Camera: ${text(scene.camera)}`,
  scene.lighting&&`Lighting: ${text(scene.lighting)}`,
  scene.characterLookId&&scene.characterLookHair&&`Selected hairstyle: ${text(scene.characterLookHair,180)}`,
  scene.characterLookId&&scene.characterLookAccessories&&`Selected accessories: ${text(scene.characterLookAccessories,180)}`,
  measuredStyle&&`MV reference video measured color palette RGB ${measuredStyle.color.join(', ')}, measured brightness grade ${measuredStyle.brightness}, contrast ${measuredStyle.contrast}`,
  `Direction: ${text(role,90)}`,
  framing&&`Framing: ${text(framing,130)}`, 'single coherent shot, no captions, no watermark'];
 return {key,prompt:pieces.filter(Boolean).join('. ').slice(0,3000),negative:'low quality, blurry, distorted, duplicate body, watermark, text, logo'};
}
export function applySceneImage(project,sceneId,assetId,request,details={}){
 if(!project||!Array.isArray(project.scenes))throw Error('프로젝트가 올바르지 않습니다.');
 const scene=project.scenes.find(s=>s.id===sceneId);
 if(!scene)throw Error('생성 도중 장면이 삭제됐습니다.');
 if(!/^img_[A-Za-z0-9_-]{1,80}$/.test(assetId))throw Error('이미지 저장 ID가 올바르지 않습니다.');
 if(!request?.key||typeof request.key!=='string'||request.key.length>8192)throw Error('장면 생성 정보를 확인할 수 없습니다.');
 return {...project,scenes:project.scenes.map(s=>s.id===sceneId?{...s,imageAssetId:assetId,imageGeneration:{source:details.source==='person-img2img'?'ComfyUI local person img2img':details.source==='character-img2img'?'ComfyUI local character img2img':'ComfyUI local',key:request.key,seed:details.seed,checkpoint:text(details.checkpoint,220),createdAt:new Date().toISOString()}}:s)};
}
export function isSceneImageStale(scene,request){return !!scene?.imageAssetId&&scene?.imageGeneration?.key!==request?.key;}
export function validateGeneratedImage(blob){
 if(!(blob instanceof Blob)||blob.size<16||blob.size>MAX_SCENE_IMAGE_BYTES||!['image/png','image/jpeg'].includes(blob.type))throw Error('PNG/JPEG 이미지 형식 또는 용량이 올바르지 않습니다.');
 return true;
}
export async function checkComfy(port,session,signal){
 const res=await fetch(`/api/images/health?port=${Number(port)}`,{headers:{'X-MYVOCAL-Session':session},signal,cache:'no-store'});
 const parsed=await res.json();if(!res.ok)throw Error(parsed.error||'ComfyUI 연결에 실패했습니다.');return parsed;
}
export async function generateComfyImage(input,session,signal){
 const res=await fetch('/api/images/generate',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},body:JSON.stringify(input),signal,cache:'no-store'});
 if(!res.ok){let msg='장면 이미지 생성 실패';try{const j=await res.json();msg=j.error||msg;}catch{}throw Error(msg);}
 const blob=await res.blob();validateGeneratedImage(blob);return blob;
}
