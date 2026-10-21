// Explicit, user-placed 2D mouth overlay over existing character MV media.
// It burns timed character lipSync shapes into *real WebM/MP4 frames*; it does
// NOT discover faces, warp a face, perform phoneme recognition or drive VRM.
import {validateLipSync} from './characterLipSync.js';
import {automaticSingingVisemes} from './autoMvPhonemeLip.js';

export const MV_MOUTH_MIN = 2;
export const MV_MOUTH_MAX = 18;
function validPlacement({xPercent,yPercent,sizePercent}) {
 if (![xPercent,yPercent,sizePercent].every(Number.isFinite)||xPercent<5||xPercent>95||yPercent<5||yPercent>95||sizePercent<MV_MOUTH_MIN||sizePercent>MV_MOUTH_MAX)
  throw Error('입 위치 X/Y는 5~95%, 크기는 2~18%만 가능합니다.');
}
export function planMvLipSyncOverlay(project,characters=[],{xPercent=50,yPercent=58,sizePercent=8}={}){
 validPlacement({xPercent,yPercent,sizePercent});
 if(!project?.id||!Array.isArray(project.scenes)||!Array.isArray(characters))throw Error('영상 프로젝트 또는 캐릭터 목록이 올바르지 않습니다.');
 const identities=new Map(),scenes={};let matched=0;
 const automatic=automaticSingingVisemes(project,characters);
 for(const character of characters){
  if(!character?.id||identities.has(character.id))throw Error('캐릭터 ID가 없거나 중복됐습니다.');
  identities.set(character.id,character);
 }
 for(const scene of project.scenes){
  if(!scene?.id)throw Error('장면 ID가 올바르지 않습니다.');
  const character=identities.get(scene.characterId||project.characterId);
  const manual=character?.lipSync?.cues?.length?character.lipSync:null;
  if(!manual&&(!automatic||!character||character.id!==automatic.characterId))continue;
  if(manual)validateLipSync(manual);
  if(!Number.isFinite(scene.start)||!Number.isFinite(scene.end)||scene.start<0||scene.end>360||scene.start>=scene.end)throw Error('립싱크 영상 장면 시간이 잘못됐습니다.');
  if(scenes[scene.id])throw Error('립싱크 장면 ID가 중복됐습니다.');
  // Copy the validated timing; rendering cannot mutate the character object.
  const cues=(manual?.cues||automatic.cues).filter(c=>c.endMs>scene.start*1000&&c.startMs<scene.end*1000).map(c=>({startMs:c.startMs,endMs:c.endMs,viseme:c.viseme,lyric:c.lyric}));
  if(cues.length){scenes[scene.id]={characterId:character.id,cues};matched++;}
 }
 if(!matched)throw Error('영상 장면에 연결된 캐릭터의 유효한 립싱크 시간표가 없습니다. 캐릭터와 시간을 확인하세요.');
 return {version:1,source:automatic?'user-reviewed-or-project-phoneme-lip-sync':'user-reviewed-character-lip-sync',projectId:project.id,xPercent,yPercent,sizePercent,scenes,matchedScenes:matched,
  automaticFaceTracking:false,neuralFaceAnimation:false};
}
export function mouthAtTime(overlay,sceneId,seconds){
 const row=overlay?.scenes?.[sceneId];if(!row||!Number.isFinite(seconds))return null;
 const time=Math.round(seconds*1000),cues=row.cues;
 let lo=0,hi=cues.length-1;
 while(lo<=hi){let mid=(lo+hi)>>1,c=cues[mid];if(time<c.startMs)hi=mid-1;else if(time>=c.endMs)lo=mid+1;
  else {const w=Math.max(0,Math.min(1,(time-c.startMs)/60,(c.endMs-time)/60));return {viseme:c.viseme,weight:w,lyric:c.lyric,characterId:row.characterId};}}
 return null;
}
export function drawMvLipSyncOverlay(ctx,overlay,sceneId,seconds,width,height){
 const current=mouthAtTime(overlay,sceneId,seconds);
 if(!current||current.viseme==='sil'||current.weight<=0||!(width>0&&height>0))return false;
 const x=width*overlay.xPercent/100,y=height*overlay.yPercent/100;
 const r=width*overlay.sizePercent/200,weight=Math.min(1,current.weight),v=current.viseme;
 const flat=v==='I'||v==='E'||v==='F',closed=v==='M';
 const halfW=closed?r*.9:flat?r*1.15:v==='U'?r*.43:v==='O'?r*.53:r*.85;
 const halfH=closed?Math.max(1,weight*1.5):flat?r*.2*Math.max(.2,weight):v==='U'?r*.45*Math.max(.2,weight):v==='O'?r*.6*Math.max(.2,weight):r*.7*Math.max(.2,weight);
 ctx.save();try{
  ctx.beginPath();ctx.ellipse(x,y,Math.max(1,halfW),Math.max(1,halfH),0,0,Math.PI*2);
  ctx.fillStyle=closed?'rgba(48,16,28,.86)':'rgba(35,8,19,.92)';ctx.fill();
  ctx.strokeStyle='rgba(254,166,171,.98)';ctx.lineWidth=Math.max(1,Math.min(4,r*.12));ctx.stroke();
  if(v==='F'){ctx.beginPath();ctx.moveTo(x-halfW*.65,y-halfH*.12);ctx.lineTo(x+halfW*.65,y-halfH*.12);ctx.strokeStyle='#f6e6dc';ctx.lineWidth=Math.max(1,r*.15);ctx.stroke();}
 }finally{ctx.restore();}
 return true;
}