// Step66: derived, local-only multi-character MV cast board.
// This is planning metadata, not performer recognition, audio/video rendering or lip sync.
import {reviewCharacterShot,SHOT_LIMIT} from './characterShots.js';

export const CAST_CHARACTER_LIMIT=64;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const ms=value=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3600||Math.abs(value*1000-Math.round(value*1000))>1e-7)throw Error('캐스팅 컷 시간은 0~3600초 밀리초 단위여야 합니다.');
 return Math.round(value*1000);
};
const validId=value=>typeof value==='string'&&value.trim()&&value.length<=120&&!/[\u0000-\u001f\u007f]/.test(value);

function collectCast(characters){
 if(!Array.isArray(characters)||characters.length>CAST_CHARACTER_LIMIT)throw Error('캐스팅 보드 캐릭터는 최대 64명입니다.');
 const ids=new Set(),cues=[];
 for(const profile of characters){
  if(!isObject(profile)||!validId(profile.id)||ids.has(profile.id))throw Error('캐릭터 ID가 유효하지 않거나 중복됩니다.');
  ids.add(profile.id);
  if(!Array.isArray(profile.looks||[])||!Array.isArray(profile.shots||[])||(profile.shots||[]).length>SHOT_LIMIT)throw Error('캐릭터 룩 또는 컷 목록이 유효하지 않습니다.');
  const ownShotIds=new Set();
  for(const shot of profile.shots||[]){
   if(!isObject(shot)||!validId(shot.id)||ownShotIds.has(shot.id)||!validId(shot.lookId))throw Error('캐릭터 컷 ID가 유효하지 않거나 중복됩니다.');
   ownShotIds.add(shot.id);
   const start=ms(shot.startSec),end=ms(shot.endSec);
   if(start>=end)throw Error('캐릭터 컷 종료 시간이 시작보다 커야 합니다.');
   const look=profile.looks.find(l=>l.id===shot.lookId);
   const review=reviewCharacterShot(profile,shot);
   cues.push({characterId:profile.id,characterName:profile.name||profile.id,kind:profile.kind||'character',
    shotId:shot.id,shotTitle:shot.title||shot.id,lookId:shot.lookId,lookName:look?.name||'',
    startMs:start,endMs:end,camera:shot.camera||'',reviewRequired:review.reviewRequired,missingLook:review.missingLook,
    missingReference:review.missingReference,identityDrift:review.identityDrift});
  }
 }
 // Existing per-character plans may be corrupt legacy data: do not silently turn overlapping
 // simultaneous shots for the SAME performer into two performers.
 for(const id of ids){
  const own=cues.filter(c=>c.characterId===id).sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
  for(let i=1;i<own.length;i++)if(own[i].startMs<own[i-1].endMs)throw Error('같은 캐릭터의 컷 시간이 겹칩니다.');
 }
 return cues;
}

export function buildCharacterCastTimeline(characters){
 const cues=collectCast(characters);
 const endMs=cues.reduce((v,c)=>Math.max(v,c.endMs),0);
 if(!endMs)return {durationSec:0,intervals:[],gaps:[],duetIntervals:0,reviewRequiredShots:0,
  participants:0,shots:0,automatedCasting:false,renderedVideo:false};
 const cutpoints=[...new Set([0,endMs,...cues.flatMap(c=>[c.startMs,c.endMs])])].sort((a,b)=>a-b);
 const intervals=[],gaps=[];
 for(let i=0;i<cutpoints.length-1;i++){
  const start=cutpoints[i],end=cutpoints[i+1];
  if(start===end)continue;
  const active=cues.filter(c=>c.startMs<=start&&c.endMs>=end).sort((a,b)=>a.characterName.localeCompare(b.characterName)||a.characterId.localeCompare(b.characterId));
  if(!active.length){gaps.push({startSec:start/1000,endSec:end/1000});continue;}
  intervals.push({startSec:start/1000,endSec:end/1000,cast:active.map(({startMs,endMs,...fields})=>({...fields,startSec:startMs/1000,endSec:endMs/1000})),
   simultaneous:active.length>1,reviewRequired:active.some(c=>c.reviewRequired),
   leftPercent:100*start/endMs,widthPercent:100*(end-start)/endMs});
 }
 return {durationSec:endMs/1000,intervals,gaps,duetIntervals:intervals.filter(i=>i.simultaneous).length,
  reviewRequiredShots:cues.filter(c=>c.reviewRequired).length,
  participants:new Set(cues.map(c=>c.characterId)).size,shots:cues.length,
  automatedCasting:false,renderedVideo:false};
}

export function exportCharacterCastTimeline(characters){
 const timeline=buildCharacterCastTimeline(characters);
 return {format:'myvocal-character-cast-timeline',version:1,exportedAt:new Date().toISOString(),
  source:'manually-authored-character-shots',...timeline,
  note:'여러 캐릭터의 수동 컷 메타데이터만 포함합니다. 원본 이미지·영상·음원·3D 파일은 포함하지 않으며, AI 캐스팅·립싱크·렌더링 결과가 아닙니다.'};
}
