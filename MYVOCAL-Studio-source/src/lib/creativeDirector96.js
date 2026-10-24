// STEP96: local-first conductor with explicit preview/approval, never an unverified LLM.
// Unsupported instructions are rejected, not silently reinterpreted.
import {interpretMvInstruction93,applyMvInstruction93} from './mvNaturalEdit93.js';
import {applyProducerCommand} from './producerCommands.js';
// 미리보기와 적용 시점 사이에 MIDI 구간·코드 진행·트랙이 바뀌면 변경을 거부한다.
const sourceSnapshot96=project=>JSON.stringify({
 bpm:project.bpm,lyrics:project.lyrics,sections:project.sections,chords:project.chords,
 scenes:project.scenes,tracks:project.tracks,
 locks:[project.outfitLock,project.backgroundLock,project.cameraLock]
});
const producerMidi96=/^(?:(?:마지막\\s*후렴|인트로|전주|1절|2절|후렴|브리지|아웃트로|엔딩)(?:에서|의)?\\s*(?:드럼|베이스|기타|피아노|스트링|신스|패드)|후렴이\\s*심심해|마지막\\s*후렴(?:만|을|에서)?\\s*(?:반키|반음)|드럼\\s*(?:을\\s*)?(?:더\\s*)?강화|(?:후렴(?:의|에|에서)?\\s*)?(?:멜로디|베이스|화음|스트링)\\s*(?:변경|바꿔|강화|추가|넣어)|후렴(?:을|이)?\\s*(?:더\\s*)?웅장하게)/u;
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
 }else if(/(?:WAV|오디오).*(?:음량|음소거|소리)/iu.test(text)){
  // 같은 기존 프로젝트의 실제 독립 MusicGen WAV 믹스 변경을 검토한다.
  // 미리보기 단계에서 새 프로젝트를 저장하거나 원본 WAV를 수정하지 않는다.
  const result=applyProducerCommand(project,text);
  if(result.kind!=='neural-wav-mix-86')throw Error('신경망 WAV 트랙 편집 명령만 지원합니다.');
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
  const scene=project.scenes[0];if(!scene)throw Error('변경할 첫 번째 장면이 없습니다.');
  const p=interpretMvInstruction93(project,scene.id,text);
  action={domain:'video',sceneId:scene.id,field:p.field,value:p.after,summary:p.summary};
 }
 return {version:1,projectId:project.id,command:text,action,source:sourceSnapshot96(project),summary:action.summary};
}
export function applyCreativeDirection96(project,plan){
 if(plan?.version!==1||plan.projectId!==project?.id)throw Error('검토한 프로젝트가 아닙니다.');
 const current=sourceSnapshot96(project);
 if(current!==plan.source)throw Error('검토 후 내용이 변경되었습니다. 다시 미리 확인하세요.');
 const action=plan.action;if(!action||!['bpm','lyrics','location','outfit','camera','expression','action','lighting','neuralWav','midi'].includes(action.field))throw Error('지원하지 않는 수정입니다.');
 let updated;
 if(action.domain==='video'){
  const validation=interpretMvInstruction93(project,action.sceneId,plan.command);
  if(validation.field!==action.field||validation.after!==action.value)throw Error('검토 결과가 변조되었습니다.');
  updated=applyMvInstruction93(project,validation);
 }else if(action.domain==='music'&&action.field==='neuralWav'&&action.value===plan.command){
  const result=applyProducerCommand(project,plan.command);
  if(result.kind!=='neural-wav-mix-86'||result.response!==plan.summary)
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
export function directorCapabilities96(){return {music:['BPM 설정','가사 전체 수정','신경망 WAV 트랙 음량·음소거','구간별 MIDI 악기 쉼표·복원·강약·길이·음높이·후렴 편곡'],video:['선택 첫 장면의 배경·의상·카메라·표정·동작·조명'],unavailable:['자유 대화 AI','모델 미설치 시 영상 픽셀 생성','학습되지 않은 가창 모델 추론']};}
