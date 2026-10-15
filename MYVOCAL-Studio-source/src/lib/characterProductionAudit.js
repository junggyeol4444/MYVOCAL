// Step69: deterministic metadata-only production review of character MV shots and vocal cues.
// No media reading, facial matching, audio inference, rendering, or network access.
import {reviewCharacterShot} from './characterShots.js';
import {reviewCharacterVocalCue,VOCAL_PARTS} from './characterVocalCues.js';

export const PRODUCTION_AUDIT_FORMAT='myvocal-character-production-audit';
export const PRODUCTION_AUDIT_MAX_CHARACTERS=64;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const label=(x,max=120)=>typeof x==='string'?x.slice(0,max).replace(/[\u0000-\u001f\u007f]/g,'').trim():'';
const millis=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=3600&&Math.abs(x*1000-Math.round(x*1000))<1e-7?Math.round(x*1000):null;
const intersects=(a,b,c,d)=>a<d&&c<b; // half-open time intervals
const codes=Object.freeze({
 missing_look:'룩 연결 누락',identity_drift:'캐릭터 외형 기준 변경',missing_reference:'룩 참고 자료 누락',
 bad_shot_time:'컷 시간 오류',duplicate_shot:'컷 ID 중복',overlapping_shots:'같은 캐릭터 컷 시간 충돌',
 missing_shot:'보컬 큐 컷 연결 누락',outside_shot:'보컬 큐 컷 시간 불일치',bad_cue_time:'보컬 큐 시간 오류',
 bad_part:'보컬 역할 오류',duplicate_cue:'보컬 큐 ID 중복',overlapping_cues:'같은 캐릭터 보컬 시간 충돌',
 empty_lyric:'리드·대사 가사 메모 없음',no_cues:'컷에 연결된 보컬 큐 없음 (연주 컷이면 정상)',
 invalid_character:'캐릭터 자료 형식 오류',duplicate_character:'캐릭터 ID 중복',invalid_shot:'컷 자료 형식 오류',invalid_cue:'보컬 큐 자료 형식 오류'
});

export function auditCharacterProduction(characters){
 if(!Array.isArray(characters)||characters.length>PRODUCTION_AUDIT_MAX_CHARACTERS)
  throw Error('검토할 캐릭터는 최대 64명입니다.');
 const issues=[],shotRows=[],seenCharacters=new Set();
 let totalShots=0,totalCues=0,duetCuePairs=0;
 const allCues=[];
 const report=(level,code,characterId,shotId='',cueId='')=>issues.push({level,code,message:codes[code],characterId,shotId,cueId});
 for(const character of characters){
  if(!plain(character)||!label(character.id))throw Error('캐릭터 ID 또는 자료 형식이 올바르지 않습니다.');
  const characterId=label(character.id),characterName=label(character.name)||characterId;
  if(seenCharacters.has(characterId)){report('error','duplicate_character',characterId);continue;}
  seenCharacters.add(characterId);
  const shots=Array.isArray(character.shots)?character.shots:[];
  const cues=Array.isArray(character.vocalCues)?character.vocalCues:[];
  if(shots.length>48||cues.length>96)throw Error('캐릭터별 컷 48개·보컬 큐 96개 제한을 초과했습니다.');
  if(!Array.isArray(character.shots||[])||!Array.isArray(character.vocalCues||[])||!Array.isArray(character.looks||[])||!Array.isArray(character.assets||[]))
   throw Error('캐릭터의 룩·컷·큐·자료 목록 형식이 올바르지 않습니다.');
  const shotMap=new Map(),shotPeriods=[],cueIds=new Set(),cuePeriods=[];
  for(const shot of shots){
   totalShots++;
   if(!plain(shot)||!label(shot.id)){report('error','invalid_shot',characterId);continue;}
   const id=label(shot.id),a=millis(shot.startSec),b=millis(shot.endSec);
   if(shotMap.has(id))report('error','duplicate_shot',characterId,id);
   else shotMap.set(id,shot);
   if(a===null||b===null||a>=b)report('error','bad_shot_time',characterId,id);
   else {
    if(shotPeriods.some(p=>intersects(a,b,p.a,p.b)))report('error','overlapping_shots',characterId,id);
    shotPeriods.push({a,b});
   }
   // Reuse Step62/64 review rules rather than inventing automatic identity recognition.
   try{
    const review=reviewCharacterShot(character,shot);
    if(review.missingLook)report('error','missing_look',characterId,id);
    if(review.identityDrift)report('warning','identity_drift',characterId,id);
    if(review.missingReference)report('warning','missing_reference',characterId,id);
   }catch{report('error','invalid_shot',characterId,id);}
  }
  for(const cue of cues){
   totalCues++;
   if(!plain(cue)||!label(cue.id)){report('error','invalid_cue',characterId);continue;}
   const cueId=label(cue.id),shotId=label(cue.shotId),a=millis(cue.startSec),b=millis(cue.endSec);
   if(cueIds.has(cueId))report('error','duplicate_cue',characterId,shotId,cueId);
   cueIds.add(cueId);
   if(a===null||b===null||a>=b)report('error','bad_cue_time',characterId,shotId,cueId);
   else {
    if(cuePeriods.some(p=>intersects(a,b,p.a,p.b)))report('error','overlapping_cues',characterId,shotId,cueId);
    cuePeriods.push({a,b});
    allCues.push({characterId,a,b});
   }
   if(!VOCAL_PARTS.includes(cue.part))report('error','bad_part',characterId,shotId,cueId);
   if(!shotMap.has(shotId))report('error','missing_shot',characterId,shotId,cueId);
   else if(a!==null&&b!==null&&a<b){
    const review=reviewCharacterVocalCue(character,cue);
    if(review.outsideShot)report('error','outside_shot',characterId,shotId,cueId);
   }
   if((cue.part==='lead'||cue.part==='spoken')&&!label(cue.lyric,240))
    report('warning','empty_lyric',characterId,shotId,cueId);
  }
  for(const shot of shots){
   if(!plain(shot)||!label(shot.id))continue;
   const cueCount=cues.filter(c=>plain(c)&&c.shotId===shot.id).length;
   if(!cueCount)report('info','no_cues',characterId,label(shot.id));
   shotRows.push({characterId,characterName,shotId:label(shot.id),title:label(shot.title),
    startSec:shot.startSec,endSec:shot.endSec,cueCount});
  }
 }
 // Count distinct inter-character pairs of simultaneously authored cues, not rendered harmonies.
 for(let i=0;i<allCues.length;i++)for(let j=0;j<i;j++)
  if(allCues[i].characterId!==allCues[j].characterId&&intersects(allCues[i].a,allCues[i].b,allCues[j].a,allCues[j].b))duetCuePairs++;
 issues.sort((a,b)=>a.characterId.localeCompare(b.characterId)||a.shotId.localeCompare(b.shotId)||a.cueId.localeCompare(b.cueId)||a.code.localeCompare(b.code));
 shotRows.sort((a,b)=>a.startSec-b.startSec||a.characterId.localeCompare(b.characterId)||a.shotId.localeCompare(b.shotId));
 const errors=issues.filter(i=>i.level==='error').length,warnings=issues.filter(i=>i.level==='warning').length;
 return {format:PRODUCTION_AUDIT_FORMAT,version:1,scope:'manually-authored-metadata',
  characters:seenCharacters.size,shots:totalShots,cues:totalCues,duetCuePairs,
  errors,warnings,information:issues.filter(i=>i.level==='info').length,
  metadataReady:errors===0&&warnings===0,shotRows,issues,
  automatedFaceMatching:false,automatedLipSync:false,renderedAudio:false,renderedVideo:false};
}
export function exportCharacterProductionAudit(characters){
 return {...auditCharacterProduction(characters),exportedAt:new Date().toISOString(),
  note:'수동 캐릭터·컷·보컬 큐 메타데이터 점검 결과입니다. 음원/영상/이미지/가사 원문은 포함하지 않으며 실제 제작 완료나 자동 AI 검사 결과가 아닙니다.'};
}
