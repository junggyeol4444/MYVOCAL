// 원본 48·49항: 사용 권한이 있는 동일 프로필의 다중 원본 자료 중
// 현재 장면 카메라·설명과 가장 가까운 원화를 고른 후 실제 SD img2img에 전달.
// 새 모델 학습, 임의 생성, 원본 삭제 없음. 권한 없는 프로필/사람 혼입 금지.
import {personPhotoAssets,validatePersonSource} from './imageToMv.js';
import {characterArtworkAssets,validateCharacterArtwork} from './characterToMv.js';

const PRIORITY={
 front:['front','portrait','full-body','expression','side','back','outfit','other'],
 side:['side','portrait','front','full-body','expression','back','outfit','other'],
 back:['back','full-body','side','front','portrait','expression','outfit','other'],
 full:['full-body','front','portrait','side','back','expression','outfit','other'],
 expression:['expression','portrait','front','full-body','side','back','outfit','other']
};
function cameraView(scene){
 const text=[scene?.camera,scene?.action,scene?.description].filter(x=>typeof x==='string').join(' ').toLowerCase();
 if(/\b(back view|rear view|from behind)\b|뒷모습|후면|뒤에서/u.test(text))return 'back';
 if(/\b(profile view|side view|side angle)\b|측면|옆모습|옆에서/u.test(text))return 'side';
 if(/\b(full body|wide shot|long shot)\b|전신|풀샷|와이드/u.test(text))return 'full';
 if(/\b(close-up|facial|expression|face close)\b|표정|클로즈업|얼굴/u.test(text))return 'expression';
 return 'front';
}
export function chooseSceneReference(profile,scene,defaultAssetId){
 if(!profile?.id||!scene?.id||!defaultAssetId)throw Error('동일 인물·캐릭터 프로필과 장면의 기본 참조 이미지가 필요합니다.');
 if(profile.kind==='person')validatePersonSource(profile,defaultAssetId);
 else if(profile.kind==='character')validateCharacterArtwork(profile,defaultAssetId);
 else throw Error('실제 사람 또는 2D 캐릭터 프로필만 참조할 수 있습니다.');
 const sources=profile.kind==='person'?personPhotoAssets(profile):characterArtworkAssets(profile);
 if(!sources.some(x=>x.id===defaultAssetId))throw Error('현재 인물의 기본 원본을 찾지 못했습니다.');
 const view=cameraView(scene),ranked=sources.map(asset=>({
  asset,rank:PRIORITY[view].indexOf(asset.role),preferred:asset.id===defaultAssetId
 }));
 ranked.sort((a,b)=>a.rank-b.rank||Number(b.preferred)-Number(a.preferred)||a.asset.id.localeCompare(b.asset.id));
 const source=ranked[0];
 return {assetId:source.asset.id,role:source.asset.role,view,
  sourceProfileId:profile.id,sourceCount:sources.length,
  reason:source.preferred?'사용자가 등록한 기본 원본 사용':'장면 시점에 맞는 동일 프로필 원본 선택'};
}
