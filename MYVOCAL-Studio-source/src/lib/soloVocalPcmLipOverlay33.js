// Original requirements #24/#33/#35/#55:
// Real recorded/trained solo vocal WAV PCM gates the reviewed Korean
// phoneme visemes of a SINGLE licensed 2D character in the finished MV.
// NOT automatic face tracking, phoneme recognition or synthetic demo audio.
// Existing WAV, score, media and character drawings are only read.
import {planMvLipSyncOverlay} from './mvLipSyncOverlay.js';
import {singleAuthorizedMvSinger,reviewedCharacterMouthPlacement} from './autoMvPhonemeLip.js';
import {clipWindow,clipLevel,clipFadeGain} from './clipTiming.js';

const STEP=.05,STEP_MS=50,LIMIT=90*1024*1024;
const alive=(project,current,signal)=>{
 if(signal?.aborted||current()!==project)
  throw Error('실제 보컬 립싱크 도중 취소 또는 프로젝트 변경 · 기존 원본을 보존합니다.');
};
export function selectSoloVocalPcm33(project,characters=[]){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(characters)||
    project.duetSingers?.version===1)
  throw Error('한 명의 2D 가수가 있는 기존 노래 프로젝트가 필요합니다. 듀엣은 별도의 두 가수 PCM 립싱크를 사용하세요.');
 const singer=singleAuthorizedMvSinger(project,characters);
 if(!singer||singer.kind!=='character')
  throw Error('이 뮤직비디오의 한 명의 본인·허가받은 2D 캐릭터를 선택하세요.');
 const matching=project.tracks.filter(t=>
  t?.type==='vocal'&&t.mute!==true&&
  Number(t.volume??100)>0&&Array.isArray(t.clips)&&
  t.clips.length>=1&&t.clips.length<=24&&t.clips.every(c=>!!c?.assetId)&&
  (!t.singerCharacterId||t.singerCharacterId===singer.id)&&
  (!t.singerVoiceId||t.singerVoiceId===project.voiceId));
 // A harmony/adlib or multiple overlapping vocals is not a unique target.
 // Avoid moving the protagonist's mouth with the wrong singer's audio.
 if(matching.length!==1)
  throw Error('실제 독립 가창 WAV가 정확히 한 트랙이어야 합니다. 화음·Ad-lib와 주보컬을 구별해 한 명의 원본 보컬 트랙을 선택하세요.');
 return {singer,track:matching[0]};
}
function collect(buffer,clip,project,track,levels,signal){
 const timing=clipWindow(clip,project.bpm,buffer.duration);
 if(!(timing.durationSec>0))return;
 const rate=buffer.sampleRate,
   data=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));
 const stride=Math.max(1,Math.floor(rate/1800));
 const from=Math.max(0,Math.floor(timing.startSec/STEP));
 const to=Math.min(levels.length,Math.ceil(timing.endSec/STEP));
 const volume=Math.max(0,Math.min(2,Number(track.volume??100)/100));
 for(let index=from;index<to;index++){
  if(index%150===0&&signal?.aborted)throw Error('실제 가창 WAV 발성 분석을 취소했습니다.');
  const start=Math.max(timing.startSec,index*STEP),end=Math.min(timing.endSec,(index+1)*STEP);
  if(end<=start)continue;
  const first=Math.max(0,Math.floor((timing.sourceOffsetSec+start-timing.startSec)*rate));
  const last=Math.min(buffer.length,Math.ceil((timing.sourceOffsetSec+end-timing.startSec)*rate));
  let sum=0,count=0;
  for(let frame=first;frame<last;frame+=stride){
   let power=0;for(const channel of data)power+=channel[frame]**2;
   sum+=power/data.length;count++;
  }
  if(!count)continue;
  const gain=volume*clipLevel(clip)*
   clipFadeGain(clip,timing.durationSec,(start+end)/2-timing.startSec);
  levels[index]+=(sum/count)*gain*gain;
 }
}
export function normalizeSoloVocalActivity33(power){
 if(!(power instanceof Float32Array)||!power.length||
  power.length>7202||power.some(n=>!Number.isFinite(n)||n<0))
  throw Error('실제 보컬 발성 RMS 분석 결과가 올바르지 않습니다.');
 const levels=Float32Array.from(power,n=>Math.sqrt(n));
 const nonzero=Array.from(levels).filter(v=>v>0).sort((a,b)=>a-b);
 const reference=nonzero[Math.floor((nonzero.length-1)*.95)]||0;
 if(reference<.0015)
  throw Error('선택한 보컬 WAV에 분석할 만한 실제 발성 에너지가 없습니다.');
 const threshold=Math.max(.0015,reference*.11);
 return Array.from(levels,n=>n<=threshold?0:
  Math.min(1,(n-threshold)/(reference*.55)));
}
export async function planRecordedSoloVocalPcmLip33(project,characters,{
 loadFile,current=()=>project,signal,onProgress=()=>{},audioContext=null,
 placement=null,createContext=()=>{
  const C=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!C)throw Error('실제 WAV PCM 디코딩을 지원하는 Windows WebView2가 필요합니다.');
  return new C();
 }
}={}){
 if(typeof loadFile!=='function'||typeof current!=='function')
  throw Error('실제 원곡 보컬 WAV 자산을 열 수 없습니다.');
 const {singer,track}=selectSoloVocalPcm33(project,characters);
 const position=placement||reviewedCharacterMouthPlacement(project,characters);
 if(!position)throw Error('실제 2D 원화의 입 위치를 검토하거나 MV 립싱크 입 위치를 저장하세요.');
 const overlay=planMvLipSyncOverlay(project,characters,position);
 const duration=Math.max(0,...project.scenes.map(s=>Number(s.end)||0));
 if(duration<2||duration>360)throw Error('현재 완성 노래의 MV는 2~360초여야 합니다.');
 const power=new Float32Array(Math.ceil(duration/STEP)+1);
 const own=!audioContext,context=audioContext||createContext();
 try{
  let used=0;
  for(const clip of track.clips){
   alive(project,current,signal);
   const file=await loadFile(clip.assetId);alive(project,current,signal);
   if(!(file instanceof Blob)||file.size<44||file.size>LIMIT||
    !['audio/wav','audio/x-wav','audio/wave'].includes(file.type)&&
    !/\.wav$/i.test(file.name||''))
    throw Error('선택한 실제 가창 WAV 자산이 저장소에 없거나 유효하지 않습니다.');
   const buffer=await context.decodeAudioData(await file.arrayBuffer());
   alive(project,current,signal);
   if(!buffer||buffer.sampleRate<8000||buffer.sampleRate>96000||
    buffer.numberOfChannels<1||buffer.numberOfChannels>2||buffer.duration<=0)
    throw Error('실제 가창 WAV의 PCM 샘플레이트·채널·길이가 올바르지 않습니다.');
   used+=buffer.duration;
   if(used>720)throw Error('보컬 WAV 원본 분석 합계가 최대 12분을 초과했습니다.');
   collect(buffer,clip,project,track,power,signal);
   onProgress('한 명의 실제 보컬 PCM '+track.clips.length+'개 클립 중 분석 완료');
  }
  alive(project,current,signal);
  const levels=normalizeSoloVocalActivity33(power);
  if(!overlay.matchedScenes)throw Error('등록한 2D 캐릭터의 가사·MIDI 음소와 영상 장면이 일치하지 않습니다.');
  return {...overlay,source:'original-single-singer-real-pcm-and-reviewed-korean-visemes',
   singleVocalAudioActivity:{version:1,stepMs:STEP_MS,levels,
    sourceTrackId:track.id,sourceAssetIds:track.clips.map(c=>c.assetId),
    characterId:singer.id,origin:'actual-saved-vocal-pcm'},
   automaticFaceTracking:false,neuralFaceAnimation:false};
 }finally{if(own){try{await context.close()}catch{/* 기존 원본 보존 */}}}
}
