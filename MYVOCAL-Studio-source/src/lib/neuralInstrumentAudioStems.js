// MYVOCAL 원본 66항: 로컬 신경망에서 악기별 오디오를 독립 생성해
// 기존 DAW의 신규 편집 WAV 트랙에 저장한다. Demucs 사후 분리·SoundFont 샘플과 구분.
// MusicGen 텍스트 조건은 완벽한 악기 격리를 보장하지 않으며 모델 WAV를 검사한다.
import {generateMusicGenSequence} from './musicGenSequence.js';
import {buildNeuralMusicPrompts} from './neuralMusicPromptTimeline.js';
import {latestCompleteNeuralScore,NEURAL_SCORE_ROLES} from './neuralScoreBatch.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {analyzeNeuralStemPcm,assertDistinctNeuralStems} from './neuralStemPcmIntegrity.js';
import {planScoreMatchedMusicGenSegments} from './neuralStemScoreTiming.js';

const INSTRUMENT={
 melody:['lead melody','멜로디'],chords:['piano chord progression','코드'],
 bass:['electric bass guitar','베이스'],drums:['acoustic and electronic drums','드럼'],
 guitar:['electric guitar','기타'],pad:['sustained orchestral string pads','패드']
};
const alive=(project,current,signal)=>{
 if(signal?.aborted||current()!==project)throw Error('신경망 악기 제작을 취소하거나 프로젝트를 변경했습니다. 원본을 보존합니다.');
};
export function instrumentNeuralPrompts(project,role,{segments,seconds=18,crossfadeSec=.5,segmentSeconds=[]}={}){
 if(!Object.hasOwn(INSTRUMENT,role))throw Error('지원하지 않는 신경망 악기입니다.');
 const base=buildNeuralMusicPrompts(project,{segments,seconds,crossfadeSec,segmentSeconds});
 if(base.length!==segments)throw Error('같은 작곡 회차의 원본 6악기 MIDI가 필요합니다.');
 const musicalRole=INSTRUMENT[role][0];
 const score=latestCompleteNeuralScore(project);
 const notes=score?.get(role)?.midiNotes||[];
 const bpm=Number(project.bpm);
 const allDurations=segmentSeconds.length?segmentSeconds:Array(segments).fill(seconds);
 let absoluteSec=0;
 return base.map((text,index)=>{
  const from=absoluteSec*bpm/60;
  const to=(absoluteSec+allDurations[index])*bpm/60;
  absoluteSec+=allDurations[index]-crossfadeSec;
  const phrase=notes.filter(n=>Number.isInteger(n.pitch)&&Number.isFinite(n.startBeat)&&
   Number.isFinite(n.length)&&n.length>0&&n.startBeat<to&&n.startBeat+n.length>from)
   .sort((a,b)=>a.startBeat-b.startBeat).slice(0,16)
   .map(n=>{
    // 이전 구간부터 이어지는 음표는 현 구간의 0박부터 이어지는
    // 실제 겹침 부분만 전달한다. 음수 시작 박자·구간 밖 길이 금지.
    const localStart=Math.max(from,n.startBeat);
    const localEnd=Math.min(to,n.startBeat+n.length);
    return String(n.pitch)+'@'+(localStart-from).toFixed(2)+
     'b/'+(localEnd-localStart).toFixed(2)+'b/'+Math.round(Number(n.velocity)||80);
   }).join(' ');
  const cue='solo '+musicalRole+' only, instrumental, no singing, no other instruments; '+
   bpm+' BPM; actual MIDI pitches/relative beat/length/velocity '+(phrase||'continue previous original phrase')+'; ';
  const compact=text.replace(/continuous original arrangement with drums, bass, guitar, keys and pads; /,
   'maintain original instrumental theme; ')
   .replace(/; preserve the same song theme and transition smoothly from the previous audio\.$/,'');
  // Place this part's genuine neural MIDI before the generic scene prose
  // so it remains available to the real MusicGen model at its prompt limit.
  return [...(cue+compact)].slice(0,600).join('');
 });
}
export async function renderAndStoreNeuralAudioStems(project,{
 python,modelDir,seconds=18,segments=11,crossfadeSec=.5,audible=false,session,signal,
 current,onChange,newId,readInfo,createTrack,save,remove,
 generate=generateMusicGenSequence,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!project.neuralAutoScore||
 [current,onChange,newId,readInfo,createTrack,save,remove,generate].some(f=>typeof f!=='function'))
  throw Error('기존 MYVOCAL 프로젝트와 로컬 모델·편집기 연결이 필요합니다.');
 if(typeof python!=='string'||!/python\.exe$/i.test(python)||typeof modelDir!=='string'||modelDir.length<3||
 typeof session!=='string'||session.length<8||typeof audible!=='boolean'||![11,20].includes(segments)||seconds!==18||
 crossfadeSec!==.5)throw Error('로컬 MusicGen 실행 환경과 3~6분 설정을 확인하세요.');
 alive(project,current,signal);
 if(!latestCompleteNeuralScore(project))throw Error('실제 로컬 AI가 생성한 동일 회차의 6악기 MIDI가 필요합니다.');
 const scoreSec=Number(project.neuralAutoScore.durationSec)||
  Number(project.neuralAutoScore.bars)*4*60/Number(project.bpm);
 const timing=planScoreMatchedMusicGenSegments(scoreSec,segments,{fadeSec:crossfadeSec,bpm:Number(project.bpm)});
 const entries=[],tracks=[],integrity=[],allocated=new Set(project.tracks.map(t=>t.id));
 let baseline=0;
 const allocate=prefix=>{
  const id=newId(prefix);
  if(typeof id!=='string'||!id||allocated.has(id))throw Error('새 신경망 악기 자산 또는 트랙 ID가 중복됐습니다.');
  allocated.add(id);return id;
 };
 for(const [index,role] of NEURAL_SCORE_ROLES.entries()){
  alive(project,current,signal);
  const prompts=instrumentNeuralPrompts(project,role,{segments,seconds,crossfadeSec,segmentSeconds:timing.segmentSeconds});
  onProgress('로컬 신경망 독립 악기 오디오 '+INSTRUMENT[role][1]+' '+(index+1)+'/6 생성 중');
  const rendered=await generate({
   python,modelDir,prompt:prompts[0],seconds,seed:4200+index*100
  },{segments,crossfadeSec,prompts,continuation:true,
    segmentSeconds:timing.segmentSeconds,trimToSeconds:timing.targetSec,session,signal,
    onProgress:(done,total)=>onProgress(INSTRUMENT[role][1]+' '+done+'/'+total+'구간')});
  alive(project,current,signal);
  if(!(rendered instanceof Blob)||rendered.size<44||rendered.size>90*1024*1024)
   throw Error('로컬 신경망이 실제 PCM WAV를 반환하지 않았습니다: '+INSTRUMENT[role][1]);
  const pcm=await rendered.arrayBuffer();
  assertUsableSingingWav(pcm,{maxDurationSec:360});
  const profile=analyzeNeuralStemPcm(pcm);
  for(const previous of integrity)assertDistinctNeuralStems(profile,previous.profile,role,previous.role);
  integrity.push({role,profile});
  const info=await readInfo(rendered);alive(project,current,signal);
  const duration=Number(info?.duration??info?.durationSec);
  if(!Number.isFinite(duration)||Math.abs(duration-timing.targetSec)>.12)
   throw Error('신경망 오디오와 한국어 MIDI 원곡 길이가 다릅니다. 원본을 보존합니다.');
  if(!Number.isFinite(duration)||duration<160||duration>360||
     (baseline&&Math.abs(duration-baseline)>.1))throw Error('신경망 악기 오디오가 3~6분 길이/동기화 조건을 충족하지 않습니다.');
  baseline||=duration;
  const assetId=allocate('neural-audio-asset'),trackId=allocate('neural-audio-track');
  const file=new File([rendered],'MYVOCAL-독립신경망-'+role+'.wav',{type:'audio/wav'});
  const track=createTrack(project,file,assetId,duration);
  if(!track||!Array.isArray(track.clips)||track.clips.length!==1||
     track.clips[0]?.assetId!==assetId)
   throw Error('독립 신경망 악기 WAV를 하나의 편집 가능한 클립으로 연결하지 못했습니다.');
  // 원곡 6악기는 모두 한 마디 첫 위치에서 시작해야 실제 PCM 녹음 및
  // 가사·보컬과 드리프트 없이 편집할 수 있다. 새 트랙만 수정한다.
  const syncedClip={...track.clips[0],startBar:1,durationSec:duration};
  if(!Number.isFinite(syncedClip.durationSec)||syncedClip.durationSec<150||
     Math.abs(syncedClip.durationSec-baseline)>.1)
   throw Error('독립 신경망 MIDI 악기 WAV 길이와 DAW 편집 클립이 일치하지 않습니다.');
  entries.push([assetId,file]);
  tracks.push({...track,id:trackId,clips:[syncedClip],
   name:'MusicGen 개별 신경망 악기 · '+INSTRUMENT[role][1],
   type:'instrument',mute:!audible,solo:false,volume:audible?35:70,generatedBy:'musicgen-independent-audio',
   sourceRole:role,sourceMidiTrackId:latestCompleteNeuralScore(project).get(role).id});
 }
 alive(project,current,signal);
 let stored=false;
 try{
  await save(entries);stored=true;alive(project,current,signal);
  const changed={...project,tracks:[...project.tracks,...tracks]};
  await Promise.resolve(onChange(changed));stored=false;
  return {project:changed,assets:6,tracks:6,durationSec:baseline,source:'real-musicgen-independent'};
 }catch(e){
  if(stored&&current()===project){
   try{await remove(entries.map(([id])=>id));}
   catch(clean){throw Error('신규 신경망 오디오 정리 실패: '+clean.message+' / '+e.message);}
  }
  throw e;
 }
}
