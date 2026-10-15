// Step80 Character-to-MV: registered, licensed 2D illustration -> local img2img -> Step78 SVD.
// This is neither automatic 2D skeletal animation nor phoneme-driven singing.
import {buildSceneImageRequest} from './mvSceneImages.js';
export const CHARACTER_MV_IMAGE_ROLES=['portrait','front','side','back','full-body','expression','outfit','other'];
export function characterArtworkAssets(character){
 if(character?.kind!=='character')return [];
 return (character.assets||[]).filter(a=>CHARACTER_MV_IMAGE_ROLES.includes(a.role)&&['image/png','image/jpeg'].includes(a.type));
}
export function validateCharacterArtwork(character,assetId){
 if(!character||character.kind!=='character')throw Error('2D 캐릭터 일러스트 프로필을 선택하세요 (실제 사람·3D 제외).');
 if(character.rights!=='owned'&&character.rights!=='self'&&!(character.rights==='licensed'&&typeof character.rightsNote==='string'&&character.rightsNote.trim()))throw Error('본인 창작물 또는 사용 허가가 명시된 캐릭터만 제작할 수 있습니다.');
 if(!characterArtworkAssets(character).some(a=>a.id===assetId))throw Error('등록된 PNG/JPEG 캐릭터 그림을 선택하세요.');
 return true;
}
export function linkCharacterToMvScene(project,sceneId,character,artId,denoise){
 validateCharacterArtwork(character,artId);
 if(!Number.isFinite(denoise)||denoise<0.15||denoise>0.75)throw Error('캐릭터 이미지 변환 강도는 0.15~0.75여야 합니다.');
 if(!project?.scenes?.some(s=>s.id===sceneId))throw Error('장면이 삭제되거나 프로젝트가 없습니다.');
 return {...project,scenes:project.scenes.map(s=>{
  if(s.id!==sceneId)return s;
  // An individual scene cannot simultaneously be attached to person and character reference pipelines.
  const {personMv:unusedPerson,...rest}=s;
  return {...rest,characterId:character.id,characterMv:{characterId:character.id,referenceAssetId:artId,denoise}};
 })};
}
export function characterSceneImageRequest(project,scene,character,direction){
 if(!scene?.characterMv||scene.characterMv.characterId!==character?.id||scene.characterId!==character?.id)throw Error('장면과 캐릭터 원본 그림 연결이 올바르지 않습니다.');
 validateCharacterArtwork(character,scene.characterMv.referenceAssetId);
 return buildSceneImageRequest(project,scene,character,direction);
}
export async function generateCharacterMvImage(input,session,signal){
 const result=await fetch('/api/character-mv/generate',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},body:JSON.stringify({...input,rightsAttested:true}),cache:'no-store',signal});
 if(!result.ok){let reason='Character-to-MV 장면 이미지 생성 실패';try{reason=(await result.json()).error||reason;}catch{}throw Error(reason);}
 const blob=await result.blob();
 if(blob.size<16||blob.size>12*1024*1024||!['image/png','image/jpeg'].includes(blob.type))throw Error('캐릭터 장면 이미지 PNG/JPEG 형식 또는 용량 오류');
 return blob;
}
export function characterMvSceneStatus(scene){
 if(!scene?.characterMv)return '미연결';
 return scene.videoClipAssetId?'영상 클립 저장됨':scene.imageAssetId?'이미지 저장됨 / 영상 대기':'그림 연결됨';
}
