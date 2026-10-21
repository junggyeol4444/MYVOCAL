// Genuine local neural SYMBOLIC (MIDI) composition through Ollama. This is
// neither MusicGen neural audio nor a rule-based fallback: the LOCAL installed
// language model supplies each note, and malformed output is rejected.
const ROLES=['melody','chords','bass','drums','guitar','pad'];
const INSTRUMENT={melody:'synth',chords:'piano',bass:'bass',drums:'drums',guitar:'guitar',pad:'strings'};
const NAMES={melody:'신경망 작곡 · 멜로디',chords:'신경망 작곡 · 코드',bass:'신경망 작곡 · 베이스',drums:'신경망 작곡 · 드럼',guitar:'신경망 작곡 · 기타',pad:'신경망 작곡 · 패드'};
const validModel=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/.test(s);
export function validateNeuralMidiSection(response,{model,barStart}={}){
 if(!response||response.provider!=='local-ollama'||response.model!==model||
 response.neuralSymbolicGenerated!==true||response.audioGenerated!==false||
 response.bars!==8||response.barStart!==barStart||!Array.isArray(response.stems)||response.stems.length!==6)
  throw Error('로컬 신경망이 검증 가능한 6악기 MIDI 구간을 반환하지 않았습니다.');
 const names=new Set();const notes={};
 for(const stem of response.stems){
  if(!stem||!ROLES.includes(stem.role)||names.has(stem.role)||!Array.isArray(stem.notes)||
    stem.notes.length<1||stem.notes.length>(stem.role==='melody'?16:240))throw Error('로컬 신경망 악기 구성 또는 음표 개수가 잘못됐습니다.');
  names.add(stem.role);
  notes[stem.role]=stem.notes.map((note,i)=>{
   if(!note||!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
      !Number.isFinite(note.startBeat)||note.startBeat<0||note.startBeat>=32||
      !Number.isFinite(note.length)||note.length<.125||note.length>8||note.startBeat+note.length>32.001||
      !Number.isInteger(note.velocity)||note.velocity<1||note.velocity>127)
     throw Error('로컬 신경망 MIDI 음표 '+(i+1)+'의 음정·시간·세기가 올바르지 않습니다.');
   return {...note};
  });
 }
 if(names.size!==6)throw Error('신경망 악기 6개가 모두 생성되지 않았습니다.');
 return notes;
}
export async function composeNeuralMidiArrangement({model,prompt,genre='Pop',key='C Major',bpm=120,targetSeconds=180,
 session,request=fetch,signal,onProgress=()=>{}}={}){
 if(!validModel(model)||typeof prompt!=='string'||prompt.length<3||prompt.length>1200)
  throw Error('설치한 신경망 모델과 작곡 설명을 선택하세요.');
 if(!Number.isInteger(bpm)||bpm<40||bpm>240||![180,360].includes(targetSeconds))
  throw Error('신경망 곡의 BPM이나 길이가 잘못됐습니다.');
 if(typeof session!=='string'||!session)throw Error('Windows EXE 로컬 세션에서 실행해 주세요.');
 // 8 bars per request; keep each final section within the same 360-sec song.
 const sections=Math.min(45,Math.floor(targetSeconds*bpm/1920));
 if(sections<1)throw Error('이 BPM에서는 8마디 이상을 생성할 수 없습니다.');
 const durationSec=sections*32*60/bpm;
 const byRole=Object.fromEntries(ROLES.map(role=>[role,[]]));
 let previousMelody=[];
 for(let section=0;section<sections;section++){
  if(signal?.aborted)throw Error('AI 작곡을 취소했습니다. 기존 프로젝트는 보존합니다.');
  const barStart=section*8+1;
  const label=section===0?'Intro':section===sections-1?'Outro':section>=Math.floor(sections*.75)?'Final Chorus':
   section%4===3?'Chorus':section%4===2?'Pre-Chorus':'Verse';
  const body={model,prompt,genre,key,bpm,bars:8,barStart,section:label,previousMelody};
  const response=await request('/api/local-ai/midi-section',{method:'POST',
   headers:{'X-MYVOCAL-Session':session,'Content-Type':'application/json'},
   body:JSON.stringify(body),cache:'no-store',signal});
  if(!response.ok){const err=await response.json().catch(()=>({error:'로컬 모델 MIDI 응답 실패'}));throw Error(err.error||'신경망 MIDI 생성 요청 실패');}
  const result=await response.json();
  const notes=validateNeuralMidiSection(result,{model,barStart});
  for(const role of ROLES){
   for(const [index,note] of notes[role].entries()){
    byRole[role].push({...note,startBeat:+(note.startBeat+section*32).toFixed(3),
      id:'neural_'+role+'_'+section+'_'+index});
   }
  }
  previousMelody=notes.melody.slice(-12).map(note=>note.pitch);
  onProgress(section+1,sections);
 }
 if(signal?.aborted)throw Error('AI 작곡을 취소했습니다. 기존 프로젝트는 보존합니다.');
 const tracks=ROLES.map(role=>({name:NAMES[role],role,instrument:INSTRUMENT[role],
  midiNotes:byRole[role],volume:role==='drums'?65:70,clips:[],mute:false,solo:false,
  type:role==='melody'?'vocal':role==='drums'?'rhythm':'instrument',
  generatedBy:'neural-midi-v1'}));
 return {tracks,model,bpm,durationSec,bars:sections*8,sections,neuralSymbolic:true,source:'ollama-local-midi',
  notes:tracks.reduce((n,t)=>n+t.midiNotes.length,0)};
}
export async function appendNeuralMidiToProject(project,generated,{current,onChange,newId}={}){
 if(!project?.id||!Array.isArray(project.tracks)||generated?.neuralSymbolic!==true||
 !Array.isArray(generated.tracks)||generated.tracks.length!==6||
 typeof current!=='function'||typeof onChange!=='function'||typeof newId!=='function')
  throw Error('신경망 MIDI 프로젝트 데이터를 확인하세요.');
 if(current()!==project)throw Error('작곡 도중 프로젝트가 변경됐습니다. 기존 자료는 보존합니다.');
 const existing=new Set(project.tracks.map(t=>t.id));
 const tracks=generated.tracks.map(t=>{
  const id=newId('neural-midi');if(!id||existing.has(id))throw Error('새 MIDI 트랙 ID가 중복됐습니다.');
  existing.add(id);return {...t,id,midiNotes:t.midiNotes.map(n=>({...n}))};
 });
 await Promise.resolve(onChange({...project,bpm:generated.bpm,tracks:[...project.tracks,...tracks]}));
 return {addedTracks:tracks.length,newNotes:generated.notes,durationSec:generated.durationSec};
}
