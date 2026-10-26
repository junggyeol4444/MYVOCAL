// STEP90: locally rendered 2D / VRM / consented-person-video ensemble.
// Musical audio mixing and motion capture remain separate from this silent performance video.
import {modelAssets} from './character3d.js';
import {personVideoAssets} from './personLipSync.js';
import {visemeAt} from './characterLipSync.js';
import {performanceAt} from './characterPerformance89.js';
import {validateDancePlan} from './characterDanceDirector.js';
import {savedRhythmSources} from './musicReactiveDance30.js';
export const BAND90_ROLES=['lead','harmony','guitar','bass','drums','piano','strings','synth'];
const allowed=c=>c&&['owned','self','licensed'].includes(c.rights)&&(c.rights!=='licensed'||!!c.rightsNote?.trim());
const number=(n,low,high)=>typeof n==='number'&&Number.isFinite(n)&&n>=low&&n<=high;
export function eligibleBandCharacters(characters){return (characters||[]).filter(c=>allowed(c)&&(modelAssets(c).length||c.layerPlan?.reviewed||personVideoAssets(c).length));}
export function createBand90(project,characters){if(!project?.id)throw Error('음악 프로젝트가 필요합니다.');const first=eligibleBandCharacters(characters).slice(0,2);return {version:1,durationSec:10,fps:24,members:first.map((c,i)=>({characterId:c.id,role:i?'harmony':'lead',startSec:0,endSec:10,position:i?'right':'left'}))};}
// 원본 47항: 기존 STEP90 짧은 공연 구성원을 유지하면서 전곡 공연으로 확장한다.
export function createFullSongBand90(project,characters,durationSec,{existing=project?.band90}={}){
 if(!Number.isFinite(durationSec)||durationSec<150||durationSec>360)
  throw Error('3~6분 전체 음악 길이를 입력해야 합니다.');
 const original=existing||createBand90(project,characters);
 const members=original.members.map(member=>({
  ...member,
  startSec:Math.min(member.startSec,Math.max(0,durationSec-.001)),
  endSec:Math.abs(member.endSec-original.durationSec)<.001?durationSec:Math.min(member.endSec,durationSec)
 }));
 return validateBand90(project,characters,{...original,durationSec,members});
}
export function validateBand90(project,characters,plan){
 if(!project?.id||!plan||plan.version!==1||!number(plan.durationSec,2,360)||!Number.isInteger(plan.fps)||![24,30].includes(plan.fps)||!Array.isArray(plan.members)||plan.members.length<1||plan.members.length>6)throw Error('STEP90 공연 인원·길이·FPS 오류');
 const eligible=new Map(eligibleBandCharacters(characters).map(c=>[c.id,c])),seen=new Set();
 for(const m of plan.members){if(!m||typeof m.characterId!=='string'||!eligible.has(m.characterId)||seen.has(m.characterId)||!BAND90_ROLES.includes(m.role)||!['left','center','right'].includes(m.position)||!number(m.startSec,0,plan.durationSec)||!number(m.endSec,0,plan.durationSec)||m.endSec<=m.startSec||Math.abs(m.startSec*1000-Math.round(m.startSec*1000))>1e-7||Math.abs(m.endSec*1000-Math.round(m.endSec*1000))>1e-7)throw Error('멤버 중복·사용권한·구간·포지션 오류');seen.add(m.characterId);}
 // Real PCM-generated per-project dance is optional. It is not a
 // replacement for a character's hand-authored movement plan.
 if(plan.pcmDances!==undefined){
  if(!plan.pcmDances||typeof plan.pcmDances!=='object'||Array.isArray(plan.pcmDances))
   throw Error('밴드 공연의 PCM 춤 계획 형식 오류');
  const allowed=new Set(plan.members.map(m=>m.characterId));
  const sources=savedRhythmSources(project);
  for(const [id,movement] of Object.entries(plan.pcmDances)){
   if(!allowed.has(id)||!movement||movement.projectId!==project.id||
    movement.audioReactive30?.version!==1||
    movement.audioReactive30?.source!=='real-stored-drums-pcm'||
    Math.abs(movement.durationMs-plan.durationSec*1000)>1||
    !sources.some(s=>s.trackId===movement.audioReactive30.sourceTrackId&&
      s.assetId===movement.audioReactive30.sourceAssetId))
    throw Error('선택한 밴드 멤버와 실제 PCM WAV 춤 계획 연결이 다릅니다.');
   const character=characters.find(c=>c.id===id);
   validateDancePlan(character,movement);
  }
 }
 return plan;
}
export function saveBand90(project,characters,plan){validateBand90(project,characters,plan);return {...project,band90:structuredClone(plan),updatedAt:new Date().toISOString()};}
export function bandFrame90(project,characters,plan,seconds){validateBand90(project,characters,plan);if(!number(seconds,0,plan.durationSec))throw Error('공연 프레임 시간 오류');const map=new Map(characters.map(c=>[c.id,c]));return plan.members.filter(m=>m.startSec<=seconds&&seconds<m.endSec).map(m=>{const c=map.get(m.characterId);const t=seconds-m.startSec;return {...m,name:c.name,kind:c.kind,viseme:visemeAt(c.lipSync,t),performance:performanceAt(c.performance89,t),has3d:!!modelAssets(c).length,hasPersonVideo:!!personVideoAssets(c).length};});}
