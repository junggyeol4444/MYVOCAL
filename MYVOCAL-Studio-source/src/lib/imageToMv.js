// Step79: consent-gated reuse of a registered person's actual photo in local img2img.
// Does not identify faces or promise consistent identity; only supports registered persons.
import {buildSceneImageRequest} from './mvSceneImages.js';
export const PERSON_MV_SOURCE_ROLES=['portrait','front','side','full-body','expression'];
export function personPhotoAssets(person){
 if(person?.kind!=='person')return [];
 return (person.assets||[]).filter(a=>PERSON_MV_SOURCE_ROLES.includes(a.role)&&['image/png','image/jpeg'].includes(a.type));
}
export function validatePersonSource(person,assetId){
 if(!person||person.kind!=='person')throw Error('실제 사람으로 등록한 프로필을 선택하세요.');
 if(person.rights!=='self'&&!(person.rights==='licensed'&&typeof person.rightsNote==='string'&&person.rightsNote.trim()))throw Error('본인 또는 사용 허가가 명시된 사람만 Image-to-MV에 사용할 수 있습니다.');
 if(!personPhotoAssets(person).some(a=>a.id===assetId))throw Error('프로필에 등록된 PNG/JPEG 정면·인물 사진을 선택하세요.');
 return true;
}
export function linkPersonToMvScene(project,sceneId,person,photoId,denoise){
 validatePersonSource(person,photoId);
 if(!Number.isFinite(denoise)||denoise<0.15||denoise>0.75)throw Error('사진 변환 강도는 0.15~0.75입니다.');
 if(!project?.scenes?.some(s=>s.id===sceneId))throw Error('장면이 삭제되거나 프로젝트가 없습니다.');
 return {...project,scenes:project.scenes.map(s=>s.id!==sceneId?s:(()=>{const {characterMv:unused,...rest}=s;return {...rest,characterId:person.id,
   personMv:{personId:person.id,referenceAssetId:photoId,denoise}};})())};
}
export function personSceneImageRequest(project,scene,person,direction){
 if(!scene?.personMv||scene.personMv.personId!==person?.id)throw Error('사진과 사람 연결이 올바르지 않습니다.');
 validatePersonSource(person,scene.personMv.referenceAssetId);
 return buildSceneImageRequest(project,scene,person,direction);
}
export async function generatePersonMvImage(settings,session,signal){
 const res=await fetch('/api/person-mv/generate',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},body:JSON.stringify({...settings,rightsAttested:true}),cache:'no-store',signal});
 if(!res.ok){let error='Image-to-MV 사진 변환 실패';try{error=(await res.json()).error||error;}catch{}throw Error(error);}
 const blob=await res.blob();
 if(!['image/png','image/jpeg'].includes(blob.type)||blob.size<16||blob.size>12*1024*1024)throw Error('사진 기반 생성 결과 PNG/JPEG 오류');
 return blob;
}
export function personMvSceneStatus(scene){
 if(!scene?.personMv)return '미연결';
 return scene.videoClipAssetId?'영상 클립 저장됨':scene.imageAssetId?'이미지 저장됨 / 영상 대기':'사진 연결됨';
}
