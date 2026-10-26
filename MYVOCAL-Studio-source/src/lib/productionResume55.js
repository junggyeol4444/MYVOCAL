// Original MYVOCAL requirement #55: resumable *REAL* local Song + MV jobs.
// Records output asset+track IDs after a successful DAW commit. A resumed
// stage is skipped only with explicit user opt-in, matching model/settings
// and still-referenced ORIGINAL editable output clips. Never re-creates
// missing assets or silently reverts user edits / restores old audio.
//
// Not a render quality/Windows GPU acceptance test. It only guarantees the
// app will not blindly re-run previously committed stages under same inputs.
export const PRODUCTION_STAGE55=Object.freeze([
 'neural-score','soundfont-midi-stems','neural-audio-stems',
 'musicgen-demucs-master','neural-vocal',
]);
const LIMIT=48,MAX_RECORDS=16;
const stable=value=>{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
};
export function productionSignature55(stage,settings){
 if(!PRODUCTION_STAGE55.includes(stage)||!settings||typeof settings!=='object'||
  Array.isArray(settings))throw Error('자동 제작의 실제 단계·실행 모델 설정이 필요합니다.');
 const fields=Object.keys(settings);
 if(fields.length>35||fields.some(k=>!k||k.length>80))
  throw Error('실행 설정의 종류가 너무 많습니다.');
 const serialized=stable(settings);
 if(serialized.length>5000||/undefined|function|Symbol/.test(serialized))
  throw Error('자동 제작의 모델·곡 설정을 정확히 고정할 수 없습니다.');
 // Store the normalized options themselves rather than a weak 32-bit hash.
 // Credentials and recordings are never supplied by callers.
 return serialized;
}
const clips=track=>Array.isArray(track?.clips)?track.clips:[];
function recordedOutputs(before,after){
 const prev=new Set(before.tracks.map(t=>t.id));
 const added=after.tracks.filter(t=>!prev.has(t.id));
 return added.map(t=>({
  id:t.id,type:t.type||'',role:t.role||t.sourceRole||'',
  generatedBy:t.generatedBy||'',mute:!!t.mute,
  assets:clips(t).map(c=>c.assetId).filter(a=>typeof a==='string'&&a)
 }));
}
export function completeProductionStage55(before,after,stage,settings,{
 modelId='',voiceId=''
}={}){
 if(!before?.id||before.id!==after?.id||
  !Array.isArray(before.tracks)||!Array.isArray(after.tracks)||
  after.tracks.length>512||before.tracks.length>512)
  throw Error('같은 원본 음악 프로젝트의 실제 생성 전·후 트랙이 필요합니다.');
 const signature=productionSignature55(stage,settings);
 const output=recordedOutputs(before,after);
 const min={'neural-score':6,'soundfont-midi-stems':6,
  'neural-audio-stems':6,'musicgen-demucs-master':5,'neural-vocal':1}[stage];
 if(output.length<min||output.length>LIMIT||
   output.some(o=>!o.id||!o.type||
    (stage==='neural-score'?!o.generatedBy||o.generatedBy!=='ollama-neural-score':
      !o.assets.length)))
  throw Error('실제 생성된 '+stage+' MIDI 또는 WAV 트랙 수가 부족하여 완료 기록을 남기지 않습니다.');
 if(stage==='neural-score'&&
  (after.neuralAutoScore?.provider!=='local-ollama'||
    output.filter(o=>o.generatedBy==='ollama-neural-score').length!==6))
  throw Error('로컬 작사·MIDI 6악기 완성 표시를 위한 실제 Ollama 원본이 없습니다.');
 if(stage==='neural-audio-stems'&&
  output.filter(o=>o.generatedBy==='musicgen-independent-audio').length!==6)
  throw Error('실제 독립 MusicGen 악기 WAV 6개가 저장되지 않았습니다.');
 if(stage==='soundfont-midi-stems'&&
  output.filter(o=>o.generatedBy==='ollama-midi-soundfont-pcm').length!==6)
  throw Error('실제 SoundFont MIDI→WAV 악기 6개가 저장되지 않았습니다.');
 if(stage==='neural-vocal'&&!output.some(o=>o.type==='vocal'&&!o.mute&&o.assets.length))
  throw Error('가청 보컬 WAV가 실제로 생성되지 않았습니다.');
 const history=after.productionResume55?.history||[];
 if(!Array.isArray(history)||history.length>MAX_RECORDS)
  throw Error('기존 자동 제작 이력 형식이 올바르지 않습니다.');
 const record={
  version:1,stage,signature,projectId:after.id,
  scoreVersion:after.neuralAutoScore?.at||'',
  startedWithTrackIds:before.tracks.map(t=>t.id),
  output,modelId:String(modelId||'').slice(0,150),
  voiceId:String(voiceId||'').slice(0,150),
  committedAt:new Date().toISOString(),
  note:'실제 원곡에 저장된 트랙 참조 확인용. 파일 실물·모델 추론 품질 검증 여부와 별개'
 };
 return {...after,productionResume55:{
  version:1,
  history:[...history.filter(h=>h.stage!==stage).slice(-(MAX_RECORDS-1)),record],
 }};
}
export function resumableProductionStage55(project,stage,settings){
 const signature=productionSignature55(stage,settings);
 const history=project?.productionResume55?.history;
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(history))
  return {canResume:false,reason:'저장된 자동 제작 단계 이력이 없습니다.'};
 const entry=[...history].reverse().find(e=>e?.version===1&&
  e.stage===stage&&e.projectId===project.id&&e.signature===signature);
 if(!entry||!Array.isArray(entry.output)||!entry.output.length)
  return {canResume:false,reason:'이 모델·설정과 일치하는 이전 완료 기록이 없습니다.'};
 const entries=new Map(project.tracks.map(t=>[t.id,t]));
 if(entries.size!==project.tracks.length||
    !entry.startedWithTrackIds.every(id=>entries.has(id)))
  return {canResume:false,reason:'원본 악기·MIDI 트랙 목록이 변경됐습니다.'};
 for(const original of entry.output){
  const track=entries.get(original.id);
  if(!track||track.type!==original.type||
   (track.generatedBy||'')!==original.generatedBy||
   (track.role||track.sourceRole||'')!==original.role)
   return {canResume:false,reason:'생성한 원래 MIDI·악기 트랙이 변경됐습니다.'};
  const assets=clips(track).map(c=>c.assetId).filter(Boolean);
  if(original.assets.length!==assets.length||
   original.assets.some((id,i)=>id!==assets[i]))
   return {canResume:false,reason:'음원 WAV·MIDI 클립의 연결이 변경됐습니다.'};
  if(stage==='neural-vocal'&&track.mute!==original.mute)
   return {canResume:false,reason:'가창의 가청·음소거 상태가 바뀌었습니다.'};
 }
 if(entry.scoreVersion&&(project.neuralAutoScore?.at||'')!==entry.scoreVersion)
  return {canResume:false,reason:'새로 작곡한 다른 MIDI 회차가 감지됐습니다.'};
 if(stage==='neural-score'&&project.neuralAutoScore?.provider!=='local-ollama')
  return {canResume:false,reason:'AI 작곡 점수가 제거됐습니다.'};
 if(stage==='neural-score'&&entry.output.some(o=>{
   const midi=entries.get(o.id)?.midiNotes;
   return !Array.isArray(midi)||!midi.length;
 }))
  return {canResume:false,reason:'기존 AI MIDI 음표가 없어 처음부터 다시 작곡해야 합니다.'};
 return {canResume:true,outputCount:entry.output.length,
  assetIds:[...new Set(entry.output.flatMap(o=>o.assets))],
  note:'기존 자산 ID 참조 재사용 · 실제 원본 파일 존재와 품질은 별도 제작 단계에서 확인'};
}
