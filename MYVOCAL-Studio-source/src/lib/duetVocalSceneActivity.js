// 원본 20·21·55·59항: 저장된 두 가수의 실제 독립 WAV PCM 발성량으로
// 미생성 자동 MV 장면의 가수 역할을 선택한다. 가짜 립싱크/음원 생성은 하지 않는다.
import {clipWindow} from './clipTiming.js';

const MIN_RMS=.002;
const ROLE_RATIO=1.12;
const MAX_CLIPS=24;
const MAX_BYTES=90*1024*1024;
const isVoice=v=>v&&typeof v.voiceId==='string'&&v.voiceId&&
 typeof v.characterId==='string'&&v.characterId&&
 typeof v.trackId==='string'&&v.trackId;

function assertDuet(project){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(project.scenes))
  throw Error('실제 원곡 프로젝트와 자동 MV 장면이 필요합니다.');
 const duet=project.duetSingers;
 if(duet?.version!==1||!isVoice(duet.lead)||!isVoice(duet.harmony)||
  duet.lead.voiceId===duet.harmony.voiceId||
  duet.lead.characterId===duet.harmony.characterId||
  duet.lead.trackId===duet.harmony.trackId)
  throw Error('두 명의 서로 다른 Voice·캐릭터·독립 보컬 WAV 연결이 필요합니다.');
 if(!Number.isFinite(Number(project.bpm))||Number(project.bpm)<40||Number(project.bpm)>240)
  throw Error('듀엣 WAV 장면 동기화에는 원곡 BPM 40~240이 필요합니다.');
 return duet;
}
function candidates(project){
 return project.scenes.filter(scene=>scene?.generatedBy==='full-song-auto-scene'&&
  !scene.imageAssetId&&!scene.videoClipAssetId);
}
function sampleScene(chunks,start,end){
 let sum=0,count=0;
 for(const {buffer,timing} of chunks){
  const from=Math.max(start,timing.startSec),to=Math.min(end,timing.endSec);
  if(to<=from)continue;
  const rate=buffer.sampleRate,step=Math.max(1,Math.floor(rate/800));
  const first=Math.max(0,Math.floor((timing.sourceOffsetSec+from-timing.startSec)*rate));
  const last=Math.min(buffer.length,Math.ceil((timing.sourceOffsetSec+to-timing.startSec)*rate));
  const channels=Array.from({length:Math.min(buffer.numberOfChannels,2)},
   (_,i)=>buffer.getChannelData(i));
  for(let frame=first;frame<last;frame+=step){
   let power=0;
   for(const channel of channels){const value=channel[frame];power+=value*value;}
   sum+=power/channels.length;count++;
  }
 }
 return count?Math.sqrt(sum/count):0;
}
export async function analyzeRecordedDuetScenes(project,{
 loadFile,current=()=>project,signal,onProgress=()=>{},
 createContext=()=>{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio)throw Error('실제 WAV 디코딩을 지원하는 Windows WebView2가 필요합니다.');
  return new Audio();}
}={}){
 const duet=assertDuet(project);
 if(typeof loadFile!=='function'||typeof current!=='function')
  throw Error('원본 WAV 자산 읽기 함수가 필요합니다.');
 const scenes=candidates(project);
 if(scenes.length>120)throw Error('원본 자동 MV 장면 수가 120개를 초과했습니다.');
 if(!scenes.length)return {project,updated:0,cues:[],analyzed:0};
 const check=()=>{
  if(signal?.aborted||current()!==project)
   throw Error('보컬 분석이 취소되거나 원곡 프로젝트가 변경됐습니다. 원본은 보존합니다.');
 };
 const audio=createContext();
 const sources=new Map();
 try{
  for(const role of ['lead','harmony']){
   check();
   const singer=duet[role];
   const track=project.tracks.find(t=>t?.id===singer.trackId);
   if(!track||track.type!=='vocal'||!Array.isArray(track.clips)||
    !track.clips.length||track.clips.length>MAX_CLIPS||
    track.clips.some(c=>!c?.assetId))
    throw Error('듀엣 '+role+' 가수의 저장된 실제 WAV 클립을 찾지 못했습니다.');
   if(track.singerVoiceId&&track.singerVoiceId!==singer.voiceId||
    track.singerCharacterId&&track.singerCharacterId!==singer.characterId)
    throw Error('듀엣 가수의 Voice·캐릭터·WAV 트랙 연결이 일치하지 않습니다.');
   const chunks=[];
   for(const clip of track.clips){
    check();
    const file=await loadFile(clip.assetId);
    if(!(file instanceof Blob)||file.size<44||file.size>MAX_BYTES)
     throw Error('듀엣 가수의 실제 WAV 파일이 없거나 크기 제한을 초과했습니다.');
    const buffer=await audio.decodeAudioData(await file.arrayBuffer());
    check();
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0||
     !Number.isFinite(buffer.sampleRate)||buffer.numberOfChannels<1)
     throw Error('두 가수의 실제 보컬 WAV PCM을 디코딩하지 못했습니다.');
    const timing=clipWindow(clip,project.bpm,buffer.duration);
    if(timing.durationSec<=0)throw Error('듀엣 WAV 클립의 재생 길이가 없습니다.');
    chunks.push({buffer,timing});
   }
   sources.set(role,chunks);
   onProgress((role==='lead'?'주보컬':'화음')+' 실제 WAV '+chunks.length+'개 PCM 디코딩 완료');
  }
  const cues=[],patches=new Map();
  for(const scene of scenes){
   check();
   const start=Number(scene.start),end=Number(scene.end);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||
    end<=start||end>360.01)throw Error('자동 MV 장면 시간이 올바르지 않습니다.');
   const lead=sampleScene(sources.get('lead'),start,end);
   const harmony=sampleScene(sources.get('harmony'),start,end);
   const existing=['lead','harmony'].includes(scene.duetSingerRole)?
    scene.duetSingerRole:null;
   let role=existing;
   if(Math.max(lead,harmony)>=MIN_RMS){
    if(lead>harmony*ROLE_RATIO)role='lead';
    else if(harmony>lead*ROLE_RATIO)role='harmony';
   }
   // 무음·동시 발성은 기존 가수 역할을 유지한다. 임의 캐릭터를 만들지 않는다.
   const changed=!!role&&role!==existing;
   if(changed)patches.set(scene.id,{...scene,duetSingerRole:role,
    duetVoiceActivity:{source:'recorded-vocal-pcm',leadRms:lead,harmonyRms:harmony}});
   cues.push({sceneId:scene.id,startSec:start,endSec:end,
    role:role||'undetermined',leadRms:lead,harmonyRms:harmony,changed});
  }
  check();
  const scenesUpdated=patches.size?project.scenes.map(s=>patches.get(s.id)||s):project.scenes;
  return {project:patches.size?{...project,scenes:scenesUpdated}:project,
   updated:patches.size,analyzed:cues.length,cues};
 }finally{try{await audio?.close?.();}catch{/* 원본 WAV는 그대로 보존 */}}
}
export function recordedDuetCueSheet(project,result){
 if(!project?.id||!result||!Array.isArray(result.cues))
  throw Error('실제 WAV 기반 듀엣 장면 분석 결과가 필요합니다.');
 return new File([JSON.stringify({format:'MYVOCAL_DUET_PCM_SCENE_CUES',
  version:1,projectId:project.id,source:'recorded-vocal-pcm',
  analyzed:result.analyzed,changed:result.updated,cues:result.cues},null,2)],
  'MYVOCAL-두가수-실제WAV-MV장면큐.json',{type:'application/json'});
}
