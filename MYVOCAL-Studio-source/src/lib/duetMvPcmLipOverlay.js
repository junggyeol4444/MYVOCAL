// 원본 20·21·28·33·55항: 두 가수의 독립 WAV PCM 발성에 맞춘 2D MV 립싱크.
// 음소 타이밍은 기존 한국어 가사/MIDI 계획이다. 얼굴 탐지나 음소 인식이 아니다.
import {clipWindow,clipLevel,clipFadeGain} from './clipTiming.js';
import {phonemeViseme,validateLipSync} from './characterLipSync.js';
import {validateLayerPlan} from './characterLayers.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale,validatePhonemePlan} from './phonemePlan.js';
const STEP_MS=50,STEP=.05,MAX_WAV=90*1024*1024;
const check=(p,current,signal)=>{if(signal?.aborted||current()!==p)
 throw Error('두 가수 PCM 분석 취소 또는 프로젝트 변경: 원본을 보존합니다.');};
function mouthPlacement(character){
 if(character?.kind!=='character'||!['self','owned','licensed'].includes(character.rights)||
  character.rights==='licensed'&&!String(character.rightsNote||'').trim()||
  character.layerPlan?.reviewed!==true)
  throw Error('두 가수 각각 사용 허가된 2D 캐릭터와 검토 완료 입 영역이 필요합니다.');
 const plan=validateLayerPlan(character,character.layerPlan),m=plan.parts.mouth;
 if(!m.enabled)throw Error('캐릭터 입 레이어가 꺼져 있습니다.');
 const p={xPercent:100*(m.x+m.w/2)/plan.width,
  yPercent:100*(m.y+m.h/2)/plan.height,sizePercent:100*m.w/plan.width};
 if(p.xPercent<5||p.xPercent>95||p.yPercent<5||p.yPercent>95||
  p.sizePercent<2||p.sizePercent>18)
  throw Error('검토된 입 위치·크기가 MV 영상 범위를 벗어납니다.');
 return p;
}
export function duetPcmLipSources(project,characters){
 const duet=project?.duetSingers;
 if(!project?.id||duet?.version!==1||!Array.isArray(project.tracks)||
  !Array.isArray(project.scenes)||!Array.isArray(characters))
  throw Error('두 가수·두 캐릭터·독립 WAV가 연결된 기존 듀엣 프로젝트가 필요합니다.');
 if(!project.vocalAlignment||isAlignmentStale(project,project.vocalAlignment)||
  !project.phonemePlan||isPhonemePlanStale(project.vocalAlignment,project.phonemePlan))
  throw Error('최신 한국어 가사·MIDI 발음 시간표가 필요합니다.');
 validatePhonemePlan(project.phonemePlan,project.vocalAlignment);
 const roles={},ids=new Set(),voices=new Set(),tracks=new Set();
 for(const role of ['lead','harmony']){
  const singer=duet[role];
  if(!singer?.characterId||!singer.voiceId||!singer.trackId||
   ids.has(singer.characterId)||voices.has(singer.voiceId)||tracks.has(singer.trackId))
   throw Error('두 가수의 Voice·캐릭터·보컬 WAV 트랙이 서로 달라야 합니다.');
  ids.add(singer.characterId);voices.add(singer.voiceId);tracks.add(singer.trackId);
  const character=characters.find(c=>c?.id===singer.characterId);
  const mouth=mouthPlacement(character);
  const track=project.tracks.find(t=>t?.id===singer.trackId);
  if(!track||track.type!=='vocal'||track.mute===true||Number(track.volume)===0||
   !Array.isArray(track.clips)||!track.clips.length||track.clips.length>24||
   track.clips.some(c=>!c?.assetId))
   throw Error('두 가수의 재생 가능한 독립 보컬 WAV 트랙이 필요합니다.');
  if((track.singerVoiceId&&track.singerVoiceId!==singer.voiceId)||
   (track.singerCharacterId&&track.singerCharacterId!==singer.characterId))
   throw Error('가수 Voice·캐릭터·보컬 WAV 연결이 다릅니다.');
  roles[role]={character,track,mouth};
 }
 return roles;
}
function lyricCues(project,character){
 if(character.lipSync?.cues?.length){
  validateLipSync(character.lipSync);return character.lipSync.cues.map(c=>({...c}));
 }
 const cues=project.phonemePlan.segments.map(s=>({
  startMs:Math.round(s.startSec*1000),endMs:Math.round(s.endSec*1000),
  viseme:phonemeViseme(s.token),lyric:project.vocalAlignment.cues[s.cueIndex-1]?.lyric||''
 })).filter(c=>c.endMs>c.startMs&&c.endMs<=360000)
  .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 const result=[];let end=0;
 for(const cue of cues){
  const startMs=Math.max(end,cue.startMs);
  if(startMs<cue.endMs)result.push({...cue,startMs});
  end=Math.max(end,cue.endMs);
 }
 return result;
}
function collect(buffer,clip,bpm,volume,energy,signal){
 const timing=clipWindow(clip,bpm,buffer.duration);
 if(timing.durationSec<=0||clipLevel(clip)<=0)return;
 const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},
  (_,i)=>buffer.getChannelData(i));
 const rate=buffer.sampleRate,stride=Math.max(1,Math.floor(rate/1600));
 const from=Math.max(0,Math.floor(timing.startSec/STEP));
 const to=Math.min(energy.length,Math.ceil(timing.endSec/STEP));
 for(let index=from;index<to;index++){
  if(index%160===0&&signal?.aborted)throw Error('실제 WAV 분석을 취소했습니다.');
  const start=Math.max(timing.startSec,index*STEP),end=Math.min(timing.endSec,(index+1)*STEP);
  if(end<=start)continue;
  const a=Math.max(0,Math.floor((timing.sourceOffsetSec+start-timing.startSec)*rate));
  const b=Math.min(buffer.length,Math.ceil((timing.sourceOffsetSec+end-timing.startSec)*rate));
  let sum=0,count=0;
  for(let frame=a;frame<b;frame+=stride){
   let sample=0;for(const channel of channels)sample+=channel[frame]*channel[frame];
   sum+=sample/channels.length;count++;
  }
  if(!count)continue;
  const gain=volume*clipLevel(clip)*clipFadeGain(clip,timing.durationSec,(start+end)/2-timing.startSec);
  energy[index]+=(sum/count)*gain*gain;
 }
}
function gate(energy){
 const rms=Array.from(energy,v=>Math.sqrt(v));
 const positive=rms.filter(v=>v>0).sort((a,b)=>a-b);
 const reference=positive[Math.floor((positive.length-1)*.95)]||0;
 if(reference<.0015)throw Error('독립 보컬 WAV 중 발성 PCM이 부족한 가수가 있습니다.');
 const threshold=Math.max(.0015,reference*.11);
 return rms.map(v=>v<=threshold?0:Math.min(1,(v-threshold)/(reference*.55)));
}
export async function planRecordedDuetPcmLipOverlay(project,characters,{
 loadFile,current=()=>project,signal,onProgress=()=>{},audioContext=null,
 createContext=()=>{const C=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!C)throw Error('실제 WAV PCM을 디코딩할 Windows WebView2가 필요합니다.');
  return new C();}
}={}){
 const roles=duetPcmLipSources(project,characters);
 if(typeof loadFile!=='function'||typeof current!=='function')
  throw Error('로컬 WAV 원본 자산 읽기 기능이 필요합니다.');
 const duration=Math.max(0,...project.scenes.map(s=>Number(s?.end)||0));
 if(duration<2||duration>360)throw Error('두 가수 MV 길이는 2~360초여야 합니다.');
 const count=Math.ceil(duration/STEP)+1,activity={},scenes={};
 const own=!audioContext,context=audioContext||createContext();
 try{
  for(const role of ['lead','harmony']){
   check(project,current,signal);
   const track=roles[role].track,energy=new Float32Array(count);
   const volume=Math.max(0,Math.min(2,Number(track.volume??100)/100));
   let seconds=0;
   for(const clip of track.clips){
    check(project,current,signal);
    const file=await loadFile(clip.assetId);
    if(!(file instanceof Blob)||file.size<44||file.size>MAX_WAV||
     !(file.type==='audio/wav'||file.type==='audio/x-wav'||/\.wav$/i.test(file.name||'')))
     throw Error('두 가수의 저장된 실제 보컬 WAV 파일을 읽을 수 없습니다.');
    const buffer=await context.decodeAudioData(await file.arrayBuffer());
    check(project,current,signal);
    if(!buffer?.length||buffer.sampleRate<8000||buffer.sampleRate>96000||
     buffer.numberOfChannels<1||buffer.numberOfChannels>2)
     throw Error('보컬 WAV PCM 채널·샘플레이트가 올바르지 않습니다.');
    seconds+=buffer.duration;
    if(seconds>720)throw Error('한 가수의 WAV 분석 총 길이는 최대 12분입니다.');
    collect(buffer,clip,project.bpm,volume,energy,signal);
   }
   activity[role]=gate(energy);
   onProgress((role==='lead'?'주보컬':'화음')+' 실제 WAV 50ms 발성 분석 완료');
  }
  let matched=0;
  for(const scene of project.scenes){
   check(project,current,signal);
   const role=scene?.duetSingerRole;
   if(!['lead','harmony'].includes(role))continue;
   const character=roles[role].character;
   if(scene.characterId!==character.id)
    throw Error('MV 장면의 가수 역할과 캐릭터가 일치하지 않습니다.');
   if(scene.personMv)continue;
   const start=Number(scene.start),end=Number(scene.end);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>360)
    throw Error('MV 장면 시간이 잘못됐습니다.');
   const cues=lyricCues(project,character).filter(c=>c.endMs>start*1000&&c.startMs<end*1000);
   if(!cues.length)continue;
   if(scenes[scene.id])throw Error('MV 장면 ID가 중복됐습니다.');
   scenes[scene.id]={characterId:character.id,role,cues,placement:{...roles[role].mouth}};
   matched++;
  }
  if(!matched)throw Error('실제 WAV와 한국어 음소 시간표에 맞는 2D 듀엣 장면이 없습니다.');
  check(project,current,signal);
  return {version:1,projectId:project.id,scenes,matchedScenes:matched,
   source:'two-independent-vocal-wav-pcm-and-reviewed-2d-korean-cues',
   duetAudioActivity:{stepMs:STEP_MS,levels:activity},
   automaticFaceTracking:false,neuralFaceAnimation:false};
 }finally{if(own){try{await context?.close?.();}catch{/* 원본 보존 */}}}
}