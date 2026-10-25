// STEP96: local-first conductor with explicit preview/approval, never an unverified LLM.
// Unsupported instructions are rejected, not silently reinterpreted.
import {interpretMvInstruction93,applyMvInstruction93} from './mvNaturalEdit93.js';
import {applyProducerCommand} from './producerCommands.js';
import {isSectionNaturalInstruction,previewSectionNaturalEdit,applySectionNaturalEdit} from './mvSectionNaturalEdit.js';
// 미리보기와 적용 시점 사이에 MIDI 구간·코드 진행·트랙이 바뀌면 변경을 거부한다.
const sourceSnapshot96=project=>JSON.stringify({
 bpm:project.bpm,lyrics:project.lyrics,sections:project.sections,chords:project.chords,
 scenes:project.scenes,tracks:project.tracks,
 locks:[project.outfitLock,project.backgroundLock,project.cameraLock]
});
const producerMidi96=/^(?:(?:마지막\s*후렴|인트로|전주|1절|2절|후렴|브리지|아웃트로|엔딩)(?:에서|의)?\s*(?:멜로디|코드|드럼|베이스|기타|피아노|스트링|신스|패드)|후렴이\s*심심해|마지막\s*후렴(?:만|을|에서)?\s*(?:반키|반음)|드럼\s*(?:을\s*)?(?:더\s*)?강화|(?:후렴(?:의|에|에서)?\s*)?(?:멜로디|베이스|화음|스트링)\s*(?:변경|바꿔|강화|추가|넣어)|후렴(?:을|이)?\s*(?:더\s*)?웅장하게)/u;
// 사용자가 장면 번호 또는 정확한 제목을 지정하면 첫 장면 대신 그 장면을 수정한다.
function selectDirectedScene96(project,text){
 const ordinal=text.match(/^(?:(\d{1,2})번째\s*장면|장면\s*(\d{1,2})번?)(?:의|에서|을|은)?\s+(.+)$/u);
 if(ordinal){
  const index=Number(ordinal[1]||ordinal[2])-1;
  if(index<0||index>=project.scenes.length)throw Error('지정한 장면 번호가 프로젝트 범위를 벗어났습니다.');
  return {scene:project.scenes[index],instruction:ordinal[3]};
 }
 const named=text.match(/^(?:["“]([^"”]{1,80})["”]|'([^']{1,80})')\s*장면(?:의|에서|을|은)?\s+(.+)$/u);
 if(named){
  const title=named[1]||named[2];
  const matches=project.scenes.filter(s=>s.title===title);
  if(matches.length!==1)throw Error('장면 제목이 없거나 중복됩니다. 정확한 제목 또는 장면 번호를 지정하세요.');
  return {scene:matches[0],instruction:named[3]};
 }
 return {scene:project.scenes[0],instruction:text};
}
// 기존 영상 파일은 건드리지 않고 스토리보드 시간만 조정한다.
// 다른 장면과 겹치는 변경은 실제 MV 렌더 전에 차단한다.
function sceneTimePlan96(project,scene,instruction){
 const match=instruction.match(/^시간(?:을|를)?\s*(\d{1,3}(?:\.\d{1,3})?)\s*초?\s*(?:부터|~|-)\s*(\d{1,3}(?:\.\d{1,3})?)\s*초?\s*(?:까지)?\s*(?:로|으로)?\s*(?:바꿔|변경해|설정해)(?:줘|주세요)?[.!]?$/u);
 if(!match)return null;
 const start=Number(match[1]),end=Number(match[2]);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>360||end-start<.05)
  throw Error('장면 시간은 0~360초 범위이며 최소 0.05초 이상이어야 합니다.');
 for(const other of project.scenes){
  if(other.id===scene.id)continue;
  if(!Number.isFinite(other.start)||!Number.isFinite(other.end)||other.end<=other.start)
   throw Error('다른 장면의 시간 정보가 올바르지 않습니다.');
  if(start<other.end&&end>other.start)
   throw Error('장면 시간이 다른 장면과 겹칩니다. 기존 장면을 보존합니다.');
 }
 return {domain:'video',sceneId:scene.id,field:'sceneTime',value:{start,end},
  summary:(scene.title||scene.id)+': '+scene.start+'~'+scene.end+'초 → '+start+'~'+end+'초'};
}
export function previewCreativeDirection96(project,command){
 if(!project?.id||!Array.isArray(project.scenes))throw Error('프로젝트가 필요합니다.');
 if(typeof command!=='string'||!command.trim()||command.length>500||/[\u0000-\u001f\u007f]/u.test(command))throw Error('500자 이하의 단일 명령을 입력하세요.');
 const text=command.trim();let action;
 if(isSectionNaturalInstruction(text)){
  const section=previewSectionNaturalEdit(project,text);
  const action={domain:'video',field:'sectionBatch',value:section,summary:section.summary};
  return {version:1,projectId:project.id,command:text,action,source:sourceSnapshot96(project),summary:action.summary};
 }
 // 음악·영상 타임라인 변경을 한 번에 미리 검토하고 한 번에 적용한다.
 const parts=text.split(/\s+그리고\s+/u);
 if(parts.length>1){
  if(parts.length!==2||parts.some(p=>!p.trim()))throw Error('음악 명령 하나와 영상 명령 하나만 그리고로 연결하세요.');
  // 영상 속성 두 개를 같은 장면에서 승인/적용하고, 기존 음악+영상 동시 편집은 유지한다.
  const directed=selectDirectedScene96(project,text);
  let compound=null;
  if(directed.scene){try{compound=interpretMvInstruction93(project,directed.scene.id,directed.instruction);}catch{}}
  if(compound?.field==='multi'){
   const changes=compound.changes.map(({field,after})=>({field,after}));
   const action={domain:'video',sceneId:directed.scene.id,sceneCommand:directed.instruction,field:'multi',
    value:changes,summary:(directed.scene.title||directed.scene.id)+': '+compound.summary};
   return {version:1,projectId:project.id,command:text,action,source:sourceSnapshot96(project),summary:action.summary};
  }
  const previews=parts.map(part=>previewCreativeDirection96(project,part));
  if(previews[0].action.domain===previews[1].action.domain)
   throw Error('음악과 영상 명령을 하나씩 지정하세요.');
  return {version:2,projectId:project.id,command:text,source:sourceSnapshot96(project),
   parts,actions:previews.map(p=>p.action),action:{domain:'both'},
   summary:previews.map(p=>p.summary).join(' / ')};
 }
 const bpm=text.match(/^(?:BPM|템포)\s*(?:을|를)?\s*(\d{2,3})\s*(?:으로|로)\s*(?:바꿔|설정해)(?:줘|주세요)?[.!]?$/i);
 if(bpm){const value=Number(bpm[1]);if(value<40||value>240)throw Error('템포는 40~240 BPM이어야 합니다.');action={domain:'music',field:'bpm',value,summary:`BPM ${project.bpm} → ${value}`};}
 else if(/^가사(?:를|을)?\s*.+(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?[.!]?$/u.test(text)){
  const m=text.match(/^가사(?:를|을)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?[.!]?$/u);
  if(!m||m[1].trim().length>300)throw Error('가사 수정 범위를 확인하세요.');
  action={domain:'music',field:'lyrics',value:m[1].trim(),summary:'가사 전체 교체 — 적용 전 확인 필요'};
 }else if(/(?:WAV|오디오).*(?:음량|음소거|소리|페이드인|페이드아웃|좌우\s*위치|시작|재생\s*길이)/iu.test(text)){
  // 같은 기존 프로젝트의 실제 독립 MusicGen WAV 믹스 변경을 검토한다.
  // 미리보기 단계에서 새 프로젝트를 저장하거나 원본 WAV를 수정하지 않는다.
  const result=applyProducerCommand(project,text);
  if(!['neural-wav-mix-86','neural-wav-clip-10'].includes(result.kind))throw Error('신경망 WAV 트랙·클립 편집 명령만 지원합니다.');
  action={domain:'music',field:'neuralWav',value:text,summary:result.response};
 }else if(producerMidi96.test(text)){
  // 기존 AI Producer의 실제 MIDI 편집 함수를 재사용한다. 새 모델·가짜 출력 없음.
  const result=applyProducerCommand(project,text);
  if(!['section-midi-rest','section-midi-rest-restore','section-midi-dynamics-84',
    'section-midi-transpose-85','chorus-arrangement-11','final-chorus-semitone',
    'chorus-drums','chorus-energy'].includes(result.kind))
   throw Error('실제 MIDI 편집으로 확인되지 않은 명령입니다.');
  action={domain:'music',field:'midi',value:text,kind:result.kind,
   changed:result.changed,summary:result.response};
 }else{
  const {scene,instruction}=selectDirectedScene96(project,text);
  if(!scene)throw Error('변경할 장면이 없습니다.');
  const timing=sceneTimePlan96(project,scene,instruction);
  if(timing)action={...timing,sceneCommand:instruction};
  else{
   const p=interpretMvInstruction93(project,scene.id,instruction);
   action={domain:'video',sceneId:scene.id,sceneCommand:instruction,field:p.field,value:p.field==='multi'?p.changes.map(({field,after})=>({field,after})):p.after,
    summary:(scene.title||scene.id)+': '+p.summary};
  }
 }
 return {version:1,projectId:project.id,command:text,action,source:sourceSnapshot96(project),summary:action.summary};
}
export function applyCreativeDirection96(project,plan){
 if(plan?.version===2){
  if(plan.projectId!==project?.id||plan.source!==sourceSnapshot96(project)||
   !Array.isArray(plan.parts)||plan.parts.length!==2||!Array.isArray(plan.actions)||
   plan.actions.length!==2||plan.parts.join(' 그리고 ')!==plan.command)
   throw Error('검토한 음악·영상 동시 수정이 아니거나 프로젝트가 변경됐습니다.');
  let updated=project;
  for(let i=0;i<2;i++){
   const verified=previewCreativeDirection96(updated,plan.parts[i]);
   if(JSON.stringify(verified.action)!==JSON.stringify(plan.actions[i]))
    throw Error('음악·영상 동시 수정 계획이 달라졌습니다. 다시 검토하세요.');
   updated=applyCreativeDirection96(updated,verified);
  }
  const history=[...(project.creativeDirector96?.history||[]),
   {command:plan.command,domain:'music+video',summary:plan.summary,at:new Date().toISOString()}].slice(-30);
  return {...updated,creativeDirector96:{version:1,history}};
 }

 if(plan?.version!==1||plan.projectId!==project?.id)throw Error('검토한 프로젝트가 아닙니다.');
 const current=sourceSnapshot96(project);
 if(current!==plan.source)throw Error('검토 후 내용이 변경되었습니다. 다시 미리 확인하세요.');
 const action=plan.action;if(!action||!['bpm','lyrics','location','outfit','camera','expression','action','lighting','neuralWav','midi','sceneTime','multi','sectionBatch'].includes(action.field))throw Error('지원하지 않는 수정입니다.');
 let updated;
 if(action.domain==='video'&&action.field==='sectionBatch'){
  const checked=previewSectionNaturalEdit(project,plan.command);
  if(JSON.stringify(checked)!==JSON.stringify(action.value)||checked.summary!==plan.summary)
   throw Error('구간 자연어 수정 계획이 검토 이후 변경됐습니다.');
  updated=applySectionNaturalEdit(project,checked);
 }else if(action.domain==='video'&&action.field==='sceneTime'){
  const scene=project.scenes.find(s=>s.id===action.sceneId);
  if(!scene)throw Error('변경할 장면이 없습니다.');
  const verified=sceneTimePlan96(project,scene,action.sceneCommand||plan.command);
  if(!verified||JSON.stringify(verified.value)!==JSON.stringify(action.value)||verified.summary!==plan.summary)
   throw Error('장면 시간 미리보기와 적용 결과가 달라졌습니다.');
  updated={...project,scenes:project.scenes.map(s=>s.id===scene.id?
   {...s,start:verified.value.start,end:verified.value.end}:s)};
 }else if(action.domain==='video'){
  const validation=interpretMvInstruction93(project,action.sceneId,action.sceneCommand||plan.command);
  const actual=validation.field==='multi'?validation.changes.map(({field,after})=>({field,after})):validation.after;
  if(validation.field!==action.field||JSON.stringify(actual)!==JSON.stringify(action.value))throw Error('검토 결과가 변조되었습니다.');
  updated=applyMvInstruction93(project,validation);
 }else if(action.domain==='music'&&action.field==='neuralWav'&&action.value===plan.command){
  const result=applyProducerCommand(project,plan.command);
  if(!['neural-wav-mix-86','neural-wav-clip-10'].includes(result.kind)||result.response!==plan.summary)
   throw Error('신경망 WAV 미리보기와 적용 결과가 다릅니다. 다시 검토하세요.');
  updated=result.project;
 }else if(action.domain==='music'&&action.field==='midi'&&action.value===plan.command){
  const result=applyProducerCommand(project,plan.command);
  if(result.kind!==action.kind||result.changed!==action.changed||result.response!==plan.summary)
   throw Error('MIDI 편집 미리보기와 실제 적용 결과가 달라졌습니다. 다시 검토하세요.');
  updated=result.project;
 }else if(action.domain==='music'&&action.field==='bpm'&&Number.isInteger(action.value)&&action.value>=40&&action.value<=240){updated={...project,bpm:action.value};}
 else if(action.domain==='music'&&action.field==='lyrics'&&typeof action.value==='string'&&action.value.length<=300){updated={...project,lyrics:action.value};}
 else throw Error('지원하지 않는 음악 편집입니다.');
 const audit={command:plan.command,domain:action.domain,summary:plan.summary,at:new Date().toISOString()};
 return {...updated,creativeDirector96:{version:1,history:[...(project.creativeDirector96?.history||[]),audit].slice(-30)}};
}
export function directorCapabilities96(){return {music:['BPM 설정','가사 전체 수정','신경망 WAV 트랙 음량·음소거 및 클립별 음소거·페이드 곡선·팬·음량·트림','구간별 MIDI 악기 쉼표·복원·강약·길이·음높이·후렴 편곡'],video:['장면 번호·정확한 제목으로 배경·의상·카메라·표정·동작·조명 변경','후렴·절·브리지·전체 장면 동시 수정·복원','같은 장면의 서로 다른 두 속성 동시 수정·복원','장면 시간(0~360초) 이동·겹침 방지','그리고로 음악·영상 명령 동시 적용'],unavailable:['자유 대화 AI','모델 미설치 시 영상 픽셀 생성','학습되지 않은 가창 모델 추론']};}
