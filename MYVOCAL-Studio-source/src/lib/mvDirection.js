// Step76 — offline MV direction metadata, never AI generated footage.
// Project-level overrides are independent of editable Step71 scene interchange.
import {auditMvStoryboard} from './mvStoryboard.js';

export const MV_DIRECTION_FORMAT = 'myvocal-mv-direction-plan';
export const MV_DIRECTION_MODES = ['Performance MV', 'Story MV', 'Mixed MV'];
export const MV_DIRECTION_PRESENCE = ['캐릭터 중심', '캐릭터 + 배경 반반', '스토리 중심', '캐릭터 가끔 등장', 'AI가 결정'];
export const MV_SCENE_ROLES = ['auto','performance','story'];
const basePresence = {'캐릭터 중심':90,'캐릭터 + 배경 반반':50,'스토리 중심':25,'캐릭터 가끔 등장':10};
const ms = n => Math.round(n*1000)/1000;
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
function directionMode(project){
 // Existing Vocal Synth PV setting must remain intact. A step76 shot plan is a
 // generic PV guide until the dedicated step95 producer exists.
 return project.mvMode || 'Story MV';
}
function suggestedRole(mode,index,count){
 if(mode==='Performance MV')return 'performance';
 if(mode==='Story MV'||mode==='Vocal Synth PV')return 'story';
 // Mixed MV: alternate story / performance shots in chronological order.
 // With a single shot, both roles cannot occur; make this limitation explicit.
 return index%2 ? 'performance' : 'story';
}
function desiredPresence(setting,role){
 return setting==='AI가 결정' ? (role==='performance'?80:35) : basePresence[setting];
}
export function setMvSceneRole(project,sceneId,role){
 if(!project||!Array.isArray(project.scenes)||!project.scenes.some(s=>s?.id===sceneId))throw Error('수정할 장면을 찾을 수 없습니다.');
 if(!MV_SCENE_ROLES.includes(role))throw Error('지원하지 않는 장면 연출 역할입니다.');
 const source=project.mvDirectionOverrides;
 const result=Object.create(null);
 if(source && typeof source==='object'&&!Array.isArray(source)) {
  for(const scene of project.scenes){
   const id=scene?.id;
   if(typeof id==='string' && id!==sceneId && own(source,id) && ['story','performance'].includes(source[id]))result[id]=source[id];
  }
 }
 if(role!=='auto')result[sceneId]=role;
 // No in-place writes to original project, scenes, audio or stored media.
 return {...project,mvDirectionOverrides:result};
}
export function buildMvDirectionPlan(project,characters=[]){
 const audit=auditMvStoryboard(project,characters);
 if(audit.errors)throw Error(`장면 시간·ID 오류 ${audit.errors}개를 먼저 수정하세요.`);
 if(!audit.scenes)throw Error('연출할 장면이 없습니다.');
 if(audit.issues.some(i=>i.code==='UNKNOWN_CHARACTER'))throw Error('존재하지 않는 캐릭터 연결을 수정하세요.');
 const mode=directionMode(project);
 if(![...MV_DIRECTION_MODES,'Vocal Synth PV'].includes(mode))throw Error('지원하지 않는 MV 타입입니다.');
 const presence=project.presence||'AI가 결정';
 if(!MV_DIRECTION_PRESENCE.includes(presence))throw Error('지원하지 않는 캐릭터 등장 강도입니다.');
 const overrides=project.mvDirectionOverrides;
 const charIds=new Set(characters.map(c=>c?.id));
 const allScenes=audit.rows.map((row,index)=>{
  const s=project.scenes[row.index];
  const custom=overrides && typeof overrides==='object' && !Array.isArray(overrides) && own(overrides,s.id) ? overrides[s.id] : null;
  if(custom!==null && !['performance','story'].includes(custom))throw Error('저장된 장면 연출 역할이 올바르지 않습니다.');
  const role=custom||suggestedRole(mode,index,audit.rows.length);
  const characterId=s.characterId||project.characterId||'';
  // No character is ever fabricated or pulled from another project's library.
  const available=!!characterId&&charIds.has(characterId);
  const targetPresencePercent=desiredPresence(presence,role);
  return {id:s.id,title:s.title||'',start:s.start,end:s.end,durationSec:row.duration,
    role,source:custom?'manual':'mode',targetPresencePercent,
    characterId,characterAvailable:available,
    direction:role==='performance'?'공연·가창 중심 연출':'서사·상황 중심 연출',
    framing:targetPresencePercent>=75?'인물 중심':targetPresencePercent>=40?'인물과 배경 균형':targetPresencePercent>=20?'배경 중심 + 인물 보조':'배경 중심 + 짧은 인물 등장'};
 });
 const duration=allScenes.reduce((sum,s)=>sum+s.durationSec,0);
 const weighted=allScenes.reduce((sum,s)=>sum+s.durationSec*s.targetPresencePercent,0);
 const performanceSec=ms(allScenes.filter(s=>s.role==='performance').reduce((sum,s)=>sum+s.durationSec,0));
 const storySec=ms(allScenes.filter(s=>s.role==='story').reduce((sum,s)=>sum+s.durationSec,0));
 const issues=[];
 if(mode==='Mixed MV' && (!performanceSec||!storySec))issues.push('Mixed MV는 공연·스토리 장면이 모두 있어야 합니다. 장면을 추가하거나 역할을 변경하세요.');
 if(allScenes.some(s=>!s.characterAvailable))issues.push('캐릭터가 연결되지 않은 장면이 있습니다. 출연 계획을 확정하려면 캐릭터를 지정하세요.');
 if(audit.gapSeconds>0)issues.push(`스토리보드에 ${audit.gapSeconds}초의 빈 구간이 있습니다.`);
 return {format:MV_DIRECTION_FORMAT,version:1,kind:'manual-mv-direction-metadata-only',projectId:project.id||'',
  mode,presence,sceneCount:allScenes.length,durationSec:audit.durationSec,
  plannedSeconds:ms(duration),gapSeconds:audit.gapSeconds,performanceSec,storySec,
  targetPresencePercent:duration?Math.round(weighted/duration):0,
  scenes:allScenes,issues,capabilities:{aiGeneration:false,renderedVideo:false,actualCharacterScreenTime:false}};
}
// Export only authored scene labels and scene-direction metadata. No original
// media, voice, lyrics, portraits, clips, descriptions or generated frames.
export function exportMvDirectionPlan(project,characters=[]){
 const plan=buildMvDirectionPlan(project,characters);
 return {
  format:plan.format,version:plan.version,kind:plan.kind,projectId:plan.projectId,
  mode:plan.mode,presence:plan.presence,sceneCount:plan.sceneCount,durationSec:plan.durationSec,
  plannedSeconds:plan.plannedSeconds,gapSeconds:plan.gapSeconds,
  performanceSec:plan.performanceSec,storySec:plan.storySec,targetPresencePercent:plan.targetPresencePercent,
  scenes:plan.scenes.map(({id,title,start,end,role,source,targetPresencePercent,characterId,characterAvailable,direction,framing})=>
   ({id,title,start,end,role,source,targetPresencePercent,characterId,characterAvailable,direction,framing})),
  issues:plan.issues,capabilities:plan.capabilities
 };
}
