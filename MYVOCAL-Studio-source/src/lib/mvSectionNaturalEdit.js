// 원본 66항 #51/#55/#62: 음악 구간별 자연어 수정·실제 SD/SVD 영상 재생성.
// 기존 STEP93 단일 장면 엔진을 그대로 사용하며 모델·미디어·원본을 대체하지 않는다.
import {interpretMvInstruction93,applyMvInstruction93} from './mvNaturalEdit93.js';
import {regenerateNaturalMvScene} from './mvNaturalMediaRegeneration.js';

const SECTION={
 '후렴':/후렴|chorus|drop/i,'브리지':/브리지|bridge/i,
 '인트로':/인트로|전주|intro/i,'아웃트로':/아웃트로|엔딩|outro|ending/i,
 '1절':/1절|verse\s*1|verse\s*i\b/i,'2절':/2절|verse\s*2|verse\s*ii\b/i
};
const COMMAND=/^(전체|마지막\s*후렴|후렴|브리지|인트로|아웃트로|1절|2절)\s*장면(?:들)?(?:의|에서|을|은)?\s+(.+)$/u;
const snapshot=p=>JSON.stringify({id:p?.id,scenes:p?.scenes,sections:p?.sections,
 bpm:p?.bpm,locks:[p?.outfitLock,p?.backgroundLock,p?.cameraLock]});
export const isSectionNaturalInstruction=text=>typeof text==='string'&&COMMAND.test(text.trim());
function targets(project,scope){
 if(!Array.isArray(project.scenes)||!project.scenes.length)throw Error('현재 프로젝트의 장면이 없습니다.');
 let ranges;
 if(scope==='전체')ranges=[{start:0,end:360}];
 else{
  const bpm=Number(project.bpm);
  if(!Number.isFinite(bpm)||bpm<40||bpm>240||!Array.isArray(project.sections)||
   !project.sections.length||project.sections.length>256)
   throw Error('구간 편집에는 실제 BPM·곡 구간 정보가 필요합니다.');
  let beat=0;
  const sections=project.sections.map(s=>{
   if(!Number.isInteger(s?.bars)||s.bars<1||s.bars>128)throw Error('곡 마디 수 오류');
   const start=beat*60/bpm;beat+=s.bars*4;
   return {start,end:beat*60/bpm,name:String(s.name||'')};
  });
  const key=scope==='마지막 후렴'?'후렴':scope;
  ranges=sections.filter(s=>SECTION[key].test(s.name));
  if(scope==='마지막 후렴')ranges=ranges.slice(-1);
  if(!ranges.length)throw Error('원곡에 '+scope+' 구간이 없습니다.');
 }
 const selected=project.scenes.filter(s=>{
  const start=Number(s.start),end=Number(s.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>360)
   throw Error('0~360초 이내의 장면 시간 정보가 필요합니다.');
  return ranges.some(r=>start<r.end-.001&&end>r.start+.001);
 }).sort((a,b)=>a.start-b.start);
 if(!selected.length||selected.length>48)throw Error('대상 장면은 1~48개여야 합니다.');
 return selected;
}
export function previewSectionNaturalEdit(project,command){
 if(!project?.id||typeof command!=='string'||!command.trim()||command.length>500||
  /[\u0000-\u001f\u007f]/u.test(command))
  throw Error('500자 이하의 한국어 구간 수정 지시가 필요합니다.');
 const match=command.trim().match(COMMAND);
 if(!match)throw Error('예: 후렴 장면들의 배경을 밤거리로 바꿔 그리고 조명을 푸른빛으로 바꿔');
 const scope=match[1].replace(/\s+/g,' '),instruction=match[2].trim();
 const scenes=targets(project,scope);
 const parsed=scenes.map(s=>interpretMvInstruction93(project,s.id,instruction));
 return {version:1,projectId:project.id,source:snapshot(project),command:command.trim(),
  scope,instruction,sceneIds:scenes.map(s=>s.id),
  summary:scope+' '+scenes.length+'개 장면: '+parsed[0].summary};
}
function assertPlan(project,plan){
 if(plan?.version!==1||plan.projectId!==project?.id||plan.source!==snapshot(project))
  throw Error('검토 이후 장면·곡 구간·잠금 상태가 변경됐습니다.');
 const checked=previewSectionNaturalEdit(project,plan.command);
 if(JSON.stringify(checked)!==JSON.stringify(plan))throw Error('검토한 구간 편집 계획이 변경됐습니다.');
 return checked;
}
export function applySectionNaturalEdit(project,plan){
 const checked=assertPlan(project,plan);
 const before=checked.sceneIds.map(id=>project.scenes.find(s=>s.id===id));
 let next=project;
 for(const id of checked.sceneIds)
  next=applyMvInstruction93(next,interpretMvInstruction93(next,id,checked.instruction));
 const after=checked.sceneIds.map(id=>JSON.stringify(next.scenes.find(s=>s.id===id)));
 return {...next,videoEdits93:project.videoEdits93,mvSectionEdits:{version:1,
  history:[...(project.mvSectionEdits?.history||[]),
   {sceneIds:checked.sceneIds,before,after,at:new Date().toISOString()}].slice(-12)}};
}
export function undoSectionNaturalEdit(project){
 const history=project?.mvSectionEdits?.history||[],last=history.at(-1);
 if(!last||!Array.isArray(last.sceneIds)||last.sceneIds.length!==last.before?.length||
  last.sceneIds.length!==last.after?.length)throw Error('복원할 구간 설명 수정이 없습니다.');
 for(let i=0;i<last.sceneIds.length;i++){
  const scene=project.scenes?.find(s=>s.id===last.sceneIds[i]);
  if(!scene||JSON.stringify(scene)!==last.after[i])throw Error('구간 수정 후 장면이 변경됐습니다.');
 }
 const previous=new Map(last.sceneIds.map((id,i)=>[id,last.before[i]]));
 return {...project,scenes:project.scenes.map(s=>previous.get(s.id)||s),
  mvSectionEdits:{version:1,history:history.slice(0,-1)}};
}
// 실제 SD/SVD 호출은 각 장면에서 성공한 경우에만 새로운 자산을 저장한다.
// 실패·취소 시 이전 원본은 삭제되지 않고 완료된 장면은 개별 이력으로 남는다.
export async function regenerateSectionNaturalMvScenes(project,plan,characters,{
 current,commit,signal,onProgress=()=>{},...settings
}={}){
 const checked=assertPlan(project,plan);
 if(typeof current!=='function'||typeof commit!=='function'||current()!==project)
  throw Error('Windows EXE 현재 프로젝트와 저장 연결을 확인하세요.');
 let working=project;const records=[];
 for(let i=0;i<checked.sceneIds.length;i++){
  if(signal?.aborted||current()!==working)
   throw Error('구간 생성이 중단됐습니다. 이미 생성된 자산은 보존됩니다.');
  const id=checked.sceneIds[i],before=working.scenes.find(s=>s.id===id);
  const single=interpretMvInstruction93(working,id,checked.instruction);
  const result=await regenerateNaturalMvScene(working,single,characters,{
   ...settings,signal,current,commit:async next=>{
    await Promise.resolve(commit(next));working=next;
   },onProgress:message=>onProgress((i+1)+'/'+checked.sceneIds.length+' · '+message)
  });
  records.push({sceneId:id,before,after:JSON.stringify(result.project.scenes.find(s=>s.id===id))});
 }
 if(signal?.aborted||current()!==working)throw Error('구간 최종 저장 전에 프로젝트가 변경됐습니다.');
 const next={...working,mvSectionNeuralEdits:{version:1,history:[
  ...(working.mvSectionNeuralEdits?.history||[]),
  {records,command:checked.command,at:new Date().toISOString()}].slice(-12)}};
 await Promise.resolve(commit(next));
 return {project:next,sceneIds:checked.sceneIds,generatedVideos:records.length};
}
export function undoSectionNaturalMvScenes(project){
 const history=project?.mvSectionNeuralEdits?.history||[],last=history.at(-1);
 const records=last?.records;
 if(!Array.isArray(records)||!records.length||records.length>48)
  throw Error('복원할 구간 실제 영상 이력이 없습니다.');
 for(const record of records){
  const scene=project.scenes?.find(s=>s.id===record.sceneId);
  if(!scene||JSON.stringify(scene)!==record.after)
   throw Error('구간 영상 수정 후 장면이 변경되어 복원할 수 없습니다.');
 }
 const singles=project.mvNeuralNaturalEdits?.history||[];
 const tail=records.slice(-Math.min(8,records.length));
 if(singles.length<tail.length||tail.some((r,i)=>
  singles[singles.length-tail.length+i]?.sceneId!==r.sceneId))
  throw Error('이후 다른 영상 수정 이력이 있어 구간 복원이 불가능합니다.');
 const originals=new Map(records.map(r=>[r.sceneId,r.before]));
 return {...project,scenes:project.scenes.map(s=>originals.get(s.id)||s),
  mvSectionNeuralEdits:{version:1,history:history.slice(0,-1)},
  mvNeuralNaturalEdits:{version:1,history:singles.slice(0,-tail.length)}};
}
