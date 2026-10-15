// Step73 — local-only timeline animatic of storyboard *metadata*.
// No audio, video frames, image generation, or network access is used.
import {auditMvStoryboard} from './mvStoryboard.js';
export const MV_ANIMATIC_MAX_SECONDS = 7200;
const roundMs=n=>Math.round(n*1000)/1000;
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
export function formatAnimaticTime(seconds){
 if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||seconds>MV_ANIMATIC_MAX_SECONDS)throw Error('타임코드가 유효하지 않습니다.');
 const ms=Math.round(seconds*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
}
export function buildMvAnimatic(project,characters=[]){
 const audit=auditMvStoryboard(project,characters);
 if(audit.errors)throw Error(`장면 시간·ID 오류 ${audit.errors}개를 먼저 수정하세요.`);
 if(!audit.scenes)throw Error('재생할 장면이 없습니다.');
 // Character links need to resolve; audit reports these as warnings for editing.
 if(audit.issues.some(i=>i.code==='UNKNOWN_CHARACTER'))throw Error('존재하지 않는 캐릭터 연결을 수정하세요.');
 const scenes=audit.rows.map(row=>{
  const s=project.scenes[row.index];
  return {id:s.id,start:s.start,end:s.end,duration:row.duration,title:s.title||'',description:s.description||'',characterId:s.characterId||'',camera:s.camera||'',location:s.location||'',action:s.action||'',outfit:s.outfit||'',expression:s.expression||'',lighting:s.lighting||''};
 });
 return {projectId:project.id||'',durationSec:audit.durationSec,sceneCount:scenes.length,gapSeconds:audit.gapSeconds,scenes};
}
export function findMvAnimaticFrame(timeline,seconds){
 if(!timeline||!Array.isArray(timeline.scenes)||typeof timeline.durationSec!=='number'||!Number.isFinite(timeline.durationSec)||timeline.durationSec<=0)throw Error('애니매틱 타임라인이 올바르지 않습니다.');
 if(typeof seconds!=='number'||!Number.isFinite(seconds))throw Error('재생 위치가 올바르지 않습니다.');
 const at=roundMs(clamp(seconds,0,timeline.durationSec));
 // Adjacent scenes: ending time belongs to the NEXT scene, avoiding double exposure.
 const scene=at===timeline.durationSec?null:timeline.scenes.find(s=>s.start<=at&&at<s.end)||null;
 const following=timeline.scenes.find(s=>s.start>at)||null;
 return {seconds:at,timecode:formatAnimaticTime(at),progress:at/timeline.durationSec,
  scene:scene?{...scene,offsetSec:roundMs(at-scene.start),sceneProgress:clamp((at-scene.start)/(scene.end-scene.start),0,1)}:null,
  gap:!scene,completed:at>=timeline.durationSec,nextSceneId:following?.id||null};
}
export function seekMvAnimatic(timeline,seconds){return findMvAnimaticFrame(timeline,seconds).seconds;}
export function advanceMvAnimatic(timeline,currentSeconds,elapsedMs,speed=1){
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>3_600_000)throw Error('재생 경과 시간이 유효하지 않습니다.');
 if(![0.5,1,2].includes(speed))throw Error('재생 속도는 0.5/1/2배만 지원합니다.');
 const current=findMvAnimaticFrame(timeline,currentSeconds).seconds;
 return findMvAnimaticFrame(timeline,current+elapsedMs*speed/1000);
}
export function exportMvAnimaticSrt(project,characters=[]){
 const timeline=buildMvAnimatic(project,characters);
 const blocks=[];
 for(const s of timeline.scenes){
  // A subtitle guide from the scene title, not generated speech or accurate lyric alignment.
  const title=(s.title||'장면').replace(/[\r\n\u2028\u2029]+/g,' ').trim();
  // SRT timestamps require comma millisecond separators.
  blocks.push(`${blocks.length+1}\r\n${formatAnimaticTime(s.start).replace('.',',')} --> ${formatAnimaticTime(s.end).replace('.',',')}\r\n${title}\r\n`);
 }
 return '\uFEFF'+blocks.join('\r\n');
}
