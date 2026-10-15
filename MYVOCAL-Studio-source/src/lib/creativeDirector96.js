// STEP96: local-first conductor with explicit preview/approval, never an unverified LLM.
// Unsupported instructions are rejected, not silently reinterpreted.
import {interpretMvInstruction93,applyMvInstruction93} from './mvNaturalEdit93.js';
const clone=x=>JSON.parse(JSON.stringify(x));
export function previewCreativeDirection96(project,command){
 if(!project?.id||!Array.isArray(project.scenes))throw Error('프로젝트가 필요합니다.');
 if(typeof command!=='string'||!command.trim()||command.length>500||/[\u0000-\u001f\u007f]/u.test(command))throw Error('500자 이하의 단일 명령을 입력하세요.');
 const text=command.trim();let action;
 const bpm=text.match(/^(?:BPM|템포)\s*(?:을|를)?\s*(\d{2,3})\s*(?:으로|로)\s*(?:바꿔|설정해)(?:줘|주세요)?[.!]?$/i);
 if(bpm){const value=Number(bpm[1]);if(value<40||value>240)throw Error('템포는 40~240 BPM이어야 합니다.');action={domain:'music',field:'bpm',value,summary:`BPM ${project.bpm} → ${value}`};}
 else if(/^가사(?:를|을)?\s*.+(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?[.!]?$/u.test(text)){
  const m=text.match(/^가사(?:를|을)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?[.!]?$/u);
  if(!m||m[1].trim().length>300)throw Error('가사 수정 범위를 확인하세요.');
  action={domain:'music',field:'lyrics',value:m[1].trim(),summary:'가사 전체 교체 — 적용 전 확인 필요'};
 }else{
  const scene=project.scenes[0];if(!scene)throw Error('변경할 첫 번째 장면이 없습니다.');
  const p=interpretMvInstruction93(project,scene.id,text);
  action={domain:'video',sceneId:scene.id,field:p.field,value:p.after,summary:p.summary};
 }
 return {version:1,projectId:project.id,command:text,action,source:JSON.stringify({bpm:project.bpm,lyrics:project.lyrics,scenes:project.scenes,locks:[project.outfitLock,project.backgroundLock,project.cameraLock]}),summary:action.summary};
}
export function applyCreativeDirection96(project,plan){
 if(plan?.version!==1||plan.projectId!==project?.id)throw Error('검토한 프로젝트가 아닙니다.');
 const current=JSON.stringify({bpm:project.bpm,lyrics:project.lyrics,scenes:project.scenes,locks:[project.outfitLock,project.backgroundLock,project.cameraLock]});
 if(current!==plan.source)throw Error('검토 후 내용이 변경되었습니다. 다시 미리 확인하세요.');
 const action=plan.action;if(!action||!['bpm','lyrics','location','outfit','camera','expression','action','lighting'].includes(action.field))throw Error('지원하지 않는 수정입니다.');
 let updated;
 if(action.domain==='video'){
  const validation=interpretMvInstruction93(project,action.sceneId,plan.command);
  if(validation.field!==action.field||validation.after!==action.value)throw Error('검토 결과가 변조되었습니다.');
  updated=applyMvInstruction93(project,validation);
 }else if(action.domain==='music'&&action.field==='bpm'&&Number.isInteger(action.value)&&action.value>=40&&action.value<=240){updated={...project,bpm:action.value};}
 else if(action.domain==='music'&&action.field==='lyrics'&&typeof action.value==='string'&&action.value.length<=300){updated={...project,lyrics:action.value};}
 else throw Error('지원하지 않는 음악 편집입니다.');
 const audit={command:plan.command,domain:action.domain,summary:plan.summary,at:new Date().toISOString()};
 return {...updated,creativeDirector96:{version:1,history:[...(project.creativeDirector96?.history||[]),audit].slice(-30)}};
}
export function directorCapabilities96(){return {music:['BPM 설정','가사 전체 수정'],video:['선택 첫 장면의 배경·의상·카메라·표정·동작·조명'],unavailable:['자유 대화 AI','모델 미설치 시 영상 픽셀 생성','학습되지 않은 가창 모델 추론']};}
