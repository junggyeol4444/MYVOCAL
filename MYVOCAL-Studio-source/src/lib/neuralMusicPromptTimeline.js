// 기존 MYVOCAL의 Ollama MIDI 음표를 MusicGen 연속 구간 텍스트 조건으로 전달한다.
// 오디오가 MIDI 음을 정확히 재현한다는 주장은 하지 않는다.
import {latestCompleteNeuralScore,NEURAL_SCORE_ROLES} from './neuralScoreBatch.js';
import {summarizeOriginalMidiTheme,prependSongTheme} from './neuralMusicMotifContinuity.js';
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pitchName=n=>NOTES[n%12]+Math.floor(n/12-1);
const limited=(s,n)=>[...String(s??'').replace(/[\r\n\t]/g,' ').trim()].slice(0,n).join('');
function scoreSection(i,total){
 if(i===0)return 'Intro';
 if(i===total-1)return 'Outro';
 if(i>=Math.floor(total*.75))return 'Final Chorus';
 return i%4===3?'Chorus':i%4===2?'Pre-Chorus':'Verse';
}
function projectSectionAtBeat(project,beat){
 const sections=Array.isArray(project?.sections)?project.sections:[];
 let position=0;
 for(const section of sections.slice(0,256)){
  const bars=Number(section?.bars);
  if(!Number.isInteger(bars)||bars<1||bars>512)return null;
  const end=position+4*bars;
  if(beat<end){
   const genres=Array.isArray(section.genreMix)?section.genreMix.slice(0,5)
    .map(g=>limited(g?.name,30)).filter(Boolean).join(', '):'';
   return {name:limited(section.name||'Verse',70),genres};
  }
  position=end;
 }
 return null;
}
export function buildNeuralMusicPrompts(project,{segments,seconds=18,crossfadeSec=.5,segmentSeconds=[],basePrompt}={}){
 if(!Number.isInteger(segments)||segments<2||segments>20||
    !Number.isFinite(seconds)||seconds<3||seconds>20||
    !Number.isFinite(crossfadeSec)||crossfadeSec<.1||crossfadeSec>1.5||crossfadeSec>=seconds/2)
  throw Error('신경망 반주 구간과 연결 시간을 확인하세요.');
 if(!Array.isArray(segmentSeconds)||segmentSeconds.length&&segmentSeconds.length!==segments||
  segmentSeconds.some(s=>!Number.isInteger(s)||s<3||s>20))
  throw Error('MIDI 오디오 구간 시간표가 올바르지 않습니다.');
 const bpm=Number(project?.bpm);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)return [];
 const batch=latestCompleteNeuralScore(project);
 if(!batch)return [];
 const recent=new Map(NEURAL_SCORE_ROLES.map(role=>[role,batch.get(role).midiNotes]));
 const globalTheme=summarizeOriginalMidiTheme(batch);
 const totalSections=Math.max(1,Math.ceil(Number(project.neuralAutoScore?.bars||0)/8));
 const base=limited(basePrompt||project.prompt||project.title||'오리지널 한국어 노래',220);
 const genre=limited(project.genre||'K-pop',40),key=limited(project.key||'C Major',30);
 return Array.from({length:segments},(_,index)=>{
  const fromSec=segmentSeconds.length?
   segmentSeconds.slice(0,index).reduce((sum,s)=>sum+s,0)-index*crossfadeSec:
   index*(seconds-crossfadeSec);
  const chunkSec=segmentSeconds.length?segmentSeconds[index]:seconds;
  const from=fromSec*bpm/60;
  const to=(fromSec+chunkSec)*bpm/60;
  const center=(from+to)/2;
  const section=Math.min(totalSections-1,Math.floor(center/32));
  const actualSection=projectSectionAtBeat(project,center);
  const sectionName=actualSection?.name||scoreSection(section,totalSections);
  const sectionGenres=actualSection?.genres||genre;
  const take=role=>recent.get(role).filter(n=>Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&
   Number.isFinite(n.startBeat)&&Number.isFinite(n.length)&&n.length>0&&
   n.startBeat<to&&n.startBeat+n.length>from).sort((a,b)=>a.startBeat-b.startBeat);
  const melody=take('melody').slice(0,7).map(n=>pitchName(n.pitch)).join(' ');
  const chordCounts=new Map();
  for(const note of take('chords'))chordCounts.set(note.pitch%12,(chordCounts.get(note.pitch%12)||0)+1);
  const harmony=[...chordCounts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4)
   .map(([pitch])=>NOTES[pitch]).join(' ');
  const drums=take('drums');
  const energy=drums.length?drums.reduce((s,n)=>s+Number(n.velocity||0),0)/drums.length:75;
  const intensity=energy>=95?'powerful':energy<=55?'gentle':'balanced';
  return prependSongTheme(limited(base+'; '+sectionGenres+'; '+key+'; '+bpm+' BPM; '+sectionName+
   '; continuous original arrangement with drums, bass, guitar, keys and pads; '+
   intensity+' energy; MIDI lead pitches '+(melody||'carry preceding motif')+
   '; chord pitch classes '+(harmony||'follow established harmony')+
   '; preserve the same song theme and transition smoothly from the previous audio.',520),globalTheme);
 });
}
