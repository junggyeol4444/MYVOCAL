// Apply only explicitly supported music editing commands from the original
// MYVOCAL Producer specification. These are real MIDI/chord edits, not LLM AI.
// Original audio/image assets are never overwritten.
const pitchClasses=Object.freeze({C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11});
const chromatic=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const isChorus=name=>/chorus|후렴/i.test(String(name||''));
const isFinal=name=>/final\s*chorus|마지막\s*후렴/i.test(String(name||''));
const isDrums=track=>track?.instrument==='drums'||track?.type==='rhythm';
const playableNote=note=>Number.isInteger(note?.pitch)&&note.pitch>=0&&note.pitch<=127&&Number.isFinite(note?.startBeat)&&note.startBeat>=0&&Number.isFinite(note?.length)&&note.length>0;
const trimCommand=s=>String(s||'').trim().replace(/[.!。]+$/u,'').trim();

function songWindows(project){
 if(!Array.isArray(project.sections))throw Error('곡 구간 정보가 없습니다.');
 const windows=[];
 let bar=1;
 for(const section of project.sections){
  const bars=Number(section?.bars);
  if(!Number.isSafeInteger(bars)||bars<1||bars>128)throw Error('곡 구간의 마디 수를 확인해 주세요.');
  windows.push({name:section.name||'',fromBeat:(bar-1)*4,toBeat:(bar+bars-1)*4,fromBar:bar,toBar:bar+bars});
  bar+=bars;
 }
 return windows;
}
function transposeChord(symbol){
 const m=String(symbol||'').match(/^([A-G])([#b]?)(maj7|m7|dim|sus4|m|7|maj)?$/);
 if(!m)throw Error('지원하지 않는 코드가 있습니다. 먼저 코드 진행을 확인해 주세요.');
 const root=pitchClasses[m[1]+m[2]];
 return chromatic[(root+1)%12]+(m[3]||'');
}
function editNotes(project,windows,deltaFor){
 let changed=0;
 const tracks=(project.tracks||[]).map(track=>{
  if(!Array.isArray(track.midiNotes))return track;
  let touched=false;
  const notes=track.midiNotes.map(note=>{
   if(!playableNote(note))return note;
   if(!windows.some(w=>note.startBeat>=w.fromBeat&&note.startBeat<w.toBeat))return note;
   const delta=deltaFor(track,note);
   if(!delta)return note;
   const key=Object.keys(delta)[0],value=delta[key];
   if(key==='pitch'&&(value<0||value>127))throw Error('MIDI 음역을 벗어나는 음표가 있어 변경하지 않았습니다.');
   if(note[key]===value)return note;
   changed++;touched=true;
   return {...note,...delta};
  });
  return touched?{...track,midiNotes:notes}:track;
 });
 if(!changed)throw Error('해당 구간에서 수정할 수 있는 MIDI 음표를 찾지 못했습니다. 먼저 곡을 만들어 주세요.');
 return {tracks,changed};
}

export const PRODUCER_COMMAND_EXAMPLES=Object.freeze(['후렴을 더 웅장하게','드럼 강화하기','마지막 후렴만 반키 올려줘']);
export function applyProducerCommand(project,rawCommand){
 if(!project?.id||!Array.isArray(project.tracks))throw Error('편집할 음악 프로젝트가 없습니다.');
 if(typeof rawCommand!=='string'||rawCommand.length>300)throw Error('300자 이하의 수정 요청을 입력하세요.');
 const cmd=trimCommand(rawCommand);
 if(!cmd||/[\u0000-\u001f\u007f]/u.test(cmd))throw Error('수정 요청을 확인해 주세요.');
 const windows=songWindows(project);
 const choruses=windows.filter(w=>isChorus(w.name));
 if(!choruses.length)throw Error('후렴 구간이 없습니다. 곡 구조에서 후렴을 추가해 주세요.');
 const last=windows.filter(w=>isFinal(w.name)).at(-1)||choruses.at(-1);
 if(/^마지막\s*후렴(?:만|을|에서)?\s*(?:반키|반음)\s*(?:올려(?:줘|주세요)?|높여(?:줘|주세요)?|올리기)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,[last],(track,n)=>isDrums(track)?null:{pitch:n.pitch+1});
  let chordsChanged=0;
  const chords=(project.chords||[]).map(chord=>{
   const begin=Number(chord.bar),end=begin+Number(chord.bars);
   if(!Number.isFinite(begin)||!Number.isFinite(end)||begin<last.fromBar||end>last.toBar||end<=begin)return chord;
   chordsChanged++;
   return {...chord,symbol:transposeChord(chord.symbol)};
  });
  const response=`마지막 후렴의 MIDI 음표 ${changed}개와 코드 ${chordsChanged}개를 반음 올렸습니다. 원본 오디오 파일은 그대로입니다.`;
  return {project:{...project,tracks,chords},response,kind:'final-chorus-semitone',changed};
 }
 if(/^드럼\s*(?:을\s*)?(?:더\s*)?강화(?:해(?:줘|주세요)?|하기)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,choruses,(track,n)=>isDrums(track)?{velocity:Math.min(127,Math.round(Number(n.velocity)||85)+18)}:null);
  const response=`후렴의 드럼 MIDI 음표 ${changed}개를 더 강하게 연주하도록 바꿨습니다.`;
  return {project:{...project,tracks},response,kind:'chorus-drums',changed};
 }
 if(/^(?:후렴(?:을|이)?\s*(?:더\s*)?웅장하게(?:\s*만들어)?(?:줘|주세요)?|후렴이\s*심심해)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,choruses,(track,n)=>({velocity:Math.min(127,Math.round(Number(n.velocity)||85)+(isDrums(track)?18:12))}));
  const response=`후렴의 MIDI 음표 ${changed}개를 더 강하게 연주하도록 바꿨습니다. 실제 편곡 결과는 재생해서 확인하세요.`;
  return {project:{...project,tracks},response,kind:'chorus-energy',changed};
 }
 throw Error('아직 지원하지 않는 요청입니다. 제시된 명령만 실제 MIDI에 적용할 수 있습니다.');
}
