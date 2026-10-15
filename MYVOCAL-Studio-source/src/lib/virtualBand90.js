// STEP90: locally rendered 2D / VRM / consented-person-video ensemble.
// Musical audio mixing and motion capture remain separate from this silent performance video.
import {modelAssets} from './character3d.js';
import {personVideoAssets} from './personLipSync.js';
import {visemeAt} from './characterLipSync.js';
import {performanceAt} from './characterPerformance89.js';
export const BAND90_ROLES=['lead','harmony','guitar','bass','drums','piano','strings','synth'];
const allowed=c=>c&&['owned','self','licensed'].includes(c.rights)&&(c.rights!=='licensed'||!!c.rightsNote?.trim());
const number=(n,low,high)=>typeof n==='number'&&Number.isFinite(n)&&n>=low&&n<=high;
export function eligibleBandCharacters(characters){return (characters||[]).filter(c=>allowed(c)&&(modelAssets(c).length||c.layerPlan?.reviewed||personVideoAssets(c).length));}
export function createBand90(project,characters){if(!project?.id)throw Error('음악 프로젝트가 필요합니다.');const first=eligibleBandCharacters(characters).slice(0,2);return {version:1,durationSec:10,fps:24,members:first.map((c,i)=>({characterId:c.id,role:i?'harmony':'lead',startSec:0,endSec:10,position:i?'right':'left'}))};}
export function validateBand90(project,characters,plan){
 if(!project?.id||!plan||plan.version!==1||!number(plan.durationSec,2,30)||!Number.isInteger(plan.fps)||![24,30].includes(plan.fps)||!Array.isArray(plan.members)||plan.members.length<1||plan.members.length>6)throw Error('STEP90 공연 인원·길이·FPS 오류');
 const eligible=new Map(eligibleBandCharacters(characters).map(c=>[c.id,c])),seen=new Set();
 for(const m of plan.members){if(!m||typeof m.characterId!=='string'||!eligible.has(m.characterId)||seen.has(m.characterId)||!BAND90_ROLES.includes(m.role)||!['left','center','right'].includes(m.position)||!number(m.startSec,0,plan.durationSec)||!number(m.endSec,0,plan.durationSec)||m.endSec<=m.startSec||Math.abs(m.startSec*1000-Math.round(m.startSec*1000))>1e-7||Math.abs(m.endSec*1000-Math.round(m.endSec*1000))>1e-7)throw Error('멤버 중복·사용권한·구간·포지션 오류');seen.add(m.characterId);}
 return plan;
}
export function saveBand90(project,characters,plan){validateBand90(project,characters,plan);return {...project,band90:structuredClone(plan),updatedAt:new Date().toISOString()};}
export function bandFrame90(project,characters,plan,seconds){validateBand90(project,characters,plan);if(!number(seconds,0,plan.durationSec))throw Error('공연 프레임 시간 오류');const map=new Map(characters.map(c=>[c.id,c]));return plan.members.filter(m=>m.startSec<=seconds&&seconds<m.endSec).map(m=>{const c=map.get(m.characterId);const t=seconds-m.startSec;return {...m,name:c.name,kind:c.kind,viseme:visemeAt(c.lipSync,t),performance:performanceAt(c.performance89,t),has3d:!!modelAssets(c).length,hasPersonVideo:!!personVideoAssets(c).length};});}
