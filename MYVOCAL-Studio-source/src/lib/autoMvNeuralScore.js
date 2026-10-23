// One-click local AI score creation in the ORIGINAL MYVOCAL project.
// Installed Ollama proposes Korean lyrics AND all six neural MIDI instruments;
// the existing phoneme planner derives pronounceable timed Korean syllables.
// Not a new app, not a synthesized audio placeholder, and no user edits erased.
import {composeWithLocalAI} from './localAiComposer.js';
import {composeNeuralMidiArrangement} from './neuralMidiComposer.js';
import {alignLyricNotes,lyricUnits} from './lyricAlignment.js';
import {buildPhonemePlan} from './phonemePlan.js';

export async function generateNeuralScoreForMv(project,{
 model,prompt,genre='K-pop',key='C Major',targetSeconds=180,session,
 current,onChange,newId,signal,onProgress=()=>{},
 writeLyrics=composeWithLocalAI,writeMidi=composeNeuralMidiArrangement
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||typeof current!=='function'||
 typeof onChange!=='function'||typeof newId!=='function')
  throw Error('기존 MYVOCAL 음악 프로젝트가 필요합니다.');
 if(typeof prompt!=='string'||prompt.trim().length<3||prompt.length>1200)
  throw Error('AI 작사·작곡할 노래 설명을 입력하세요.');
 if(typeof session!=='string'||!session)throw Error('Windows EXE 로컬 세션이 필요합니다.');
 const guard=()=>{if(signal?.aborted||current()!==project)throw Error('AI 작곡 도중 취소/프로젝트 변경: 원본 보존');};
 guard();
 const bpm=Number(project.bpm)||120;
 if(!Number.isInteger(bpm)||bpm<40||bpm>240)throw Error('곡의 BPM 범위를 확인하세요.');
 onProgress('실제 로컬 AI 한국어 가사·코드 제안 생성 중');
 const draft=await writeLyrics({prompt,genre,key,bpm,mood:'감성적',bars:32},{
  model,key:session,fetchImpl:(url,init)=>fetch(url,{...init,signal})
 });
 guard();
 if(typeof draft?.lyrics!=='string'||lyricUnits(draft.lyrics).length<8||draft.source!=='ollama-local')
  throw Error('신경망 모델이 실제 한국어 노랫말을 충분히 작성하지 못했습니다.');
 onProgress('6악기 신경망 MIDI 음표를 구간별로 실제 생성 중');
 const music=await writeMidi({model,prompt,genre,key,bpm,targetSeconds,session,signal,
  onProgress:(i,n)=>onProgress('6악기 신경망 MIDI '+i+'/'+n+' 구간')});
 guard();
 if(music?.neuralSymbolic!==true||!Array.isArray(music.tracks)||music.tracks.length!==6||
  !music.tracks.some(t=>t.role==='melody'))throw Error('로컬 신경망 작곡 결과 6악기 MIDI를 확인하세요.');
 const existing=new Set(project.tracks.map(t=>t.id));
 const tracks=music.tracks.map(t=>{
  const id=newId('auto-score-midi');
  if(!id||existing.has(id))throw Error('신규 신경망 MIDI 트랙 ID 충돌');
  existing.add(id);
  return {...t,id,generatedBy:'ollama-neural-score',type:t.role==='melody'?'vocal':'instrument',
   ...(t.role==='melody'?{name:'AI 가창용 한국어 선율',instrument:'synth'}:{})};
 });
 const lead=tracks.find(t=>t.role==='melody');
 const preservedLyrics=typeof project.lyrics==='string'&&project.lyrics.trim();
 const lyrics=preservedLyrics?project.lyrics:draft.lyrics;
 const candidate={...project,bpm,lyrics,tracks:[...project.tracks,...tracks]};
 let alignment=alignLyricNotes(candidate,lead.id,{longForm:true});
 // Keep original user-written lyrics exactly as they are. For a longer neural
 // score, repeat its syllables as performance cues rather than invent blanks.
 const syllables=lyricUnits(lyrics);
 if(!syllables.length)throw Error('가창할 한국어 음절이 없습니다.');
 alignment={...alignment,cues:alignment.cues.map((cue,i)=>({
  ...cue,lyric:syllables[i%syllables.length]
 })),unfilled:0};
 const phonemePlan=buildPhonemePlan(alignment);
 const next={...candidate,key:project.key||key,vocalAlignment:alignment,phonemePlan,
  neuralAutoScore:{provider:'local-ollama',model,at:new Date().toISOString(),
   sourceLyrics:preservedLyrics?'user-original':'local-ollama',
   bars:music.bars,durationSec:music.durationSec,
   melodyNotes:lead.midiNotes.length}};
 guard();
 await Promise.resolve(onChange(next));
 return {project:next,tracks:tracks.length,notes:music.notes,cues:alignment.cues.length,
  phonemes:phonemePlan.segments.length,durationSec:music.durationSec};
}
