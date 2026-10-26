// Original MYVOCAL #8: derive a reusable profile from AUTHORIZED ORIGINAL
// LOCAL PCM (not merely a file name or an invented neural trained model).
// No source melody, waveform, lyrics, human identity or source recording is
// stored in the style profile. An output profile may guide NEW MIDI/MusicGen.
import {analyzeMusicStructure} from './musicStructureAnalysis.js';
import {createMusicStyleProfile} from './musicStyleProfile.js';
import {createLearningRights,assertLearningPermission} from './learningRights.js';
import {analyzeOwnedMusicTempoTonal8,suggestOwnedMusicTempoKey8} from './ownedMusicTempoTonal8.js';

const int=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
const rounded=n=>Math.round(n*10000)/10000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const OWNED_MUSIC_STYLE_LIMITS=Object.freeze({
 maxBytes:90*1024*1024,maxDurationSec:360,targetRate:16000,
 maxAnalysisSamples:6000000,maxProfilesPerProject:1
});
function signedRights(entry){
 if(!entry||entry.kind!=='Music Learning'||!entry.assetId)throw Error('Music Learning 원본 등록 자료가 아닙니다.');
 const category=entry.rights==='owned'?'self-created':
  entry.rights==='self'?'self-identity':
  entry.rights==='licensed'?'licensed':null;
 if(!category)throw Error('Reference 자료는 MY MUSIC STYLE로 학습·재사용할 수 없습니다.');
 const rights=createLearningRights({category,consentConfirmed:true,
  sourceLabel:String(entry.name||'').slice(0,200),
  licenseNote:entry.rightsNote||''});
 assertLearningPermission(rights,'style-learning');
 return rights;
}
export function ownedMusicEnergyCurve8(analysis,bins=32){
 if(!int(bins,8,64)||analysis?.analysisType!=='signal-energy-only'||
  !Number.isFinite(analysis.durationSeconds)||analysis.durationSeconds<=0||
  !Array.isArray(analysis.windows)||!analysis.windows.length)
  throw Error('실제 PCM 오디오 에너지 시간표가 필요합니다.');
 const total=analysis.durationSeconds,weight=new Float64Array(bins),
  power=new Float64Array(bins);
 for(const w of analysis.windows){
  if(!Number.isFinite(w.startSeconds)||!Number.isFinite(w.endSeconds)||
    !Number.isFinite(w.rms)||w.rms<0)throw Error('오디오 RMS 구간이 올바르지 않습니다.');
  let pos=w.startSeconds,limit=w.endSeconds;
  while(pos<limit-1e-8){
   const k=Math.min(bins-1,Math.floor(pos/total*bins));
   const stop=Math.min(limit,(k+1)*total/bins);
   if(stop<=pos)break;
   const sec=stop-pos;weight[k]+=sec;power[k]+=w.rms*w.rms*sec;pos=stop;
  }
 }
 const rms=Array.from(power,(v,k)=>weight[k]?Math.sqrt(v/weight[k]):0);
 const mean=rms.reduce((a,b)=>a+b,0)/bins;
 return Object.freeze(rms.map(value=>rounded(mean>0?
  clamp(value/mean,0,2.5):1)));
}
export async function analyzeOwnedMusicStyle8(entry,{
 loadFile,AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext,
 hashFile,signal,onProgress=()=>{}
}={}){
 signedRights(entry);
 if(typeof loadFile!=='function'||typeof hashFile!=='function'||
  typeof AudioContextClass!=='function')throw Error('로컬 원본 파일·해시·PCM 디코더가 필요합니다.');
 const abort=()=>{if(signal?.aborted)throw Error('자기 음악 스타일 분석이 취소됐습니다. 기존 원본은 보존됩니다.');};
 abort();onProgress('등록된 사용 권한 있는 자기 음악의 원본 WAV/오디오 열기');
 const file=await loadFile(entry.assetId);abort();
 if(!(file instanceof Blob)||file.size<44||file.size>OWNED_MUSIC_STYLE_LIMITS.maxBytes)
  throw Error('등록된 자기 음악 원본 파일이 없거나 90MB를 초과했습니다.');
 const sourceHash=await hashFile(file);abort();
 if(!/^[a-f0-9]{64}$/i.test(sourceHash))
  throw Error('원본 음악 파일의 SHA-256이 유효하지 않습니다.');
 const context=new AudioContextClass();
 try{
  const audio=await context.decodeAudioData(await file.arrayBuffer());abort();
  const duration=audio.duration;
  if(!Number.isFinite(duration)||duration<2||
    duration>OWNED_MUSIC_STYLE_LIMITS.maxDurationSec||
    !int(audio.numberOfChannels,1,8))
   throw Error('실제 자기 음악은 2~360초, 1~8채널 PCM이어야 합니다.');
  const sampleRate=OWNED_MUSIC_STYLE_LIMITS.targetRate;
  const frames=Math.floor(duration*sampleRate);
  if(!int(frames,1,OWNED_MUSIC_STYLE_LIMITS.maxAnalysisSamples))
   throw Error('오디오 분석용 PCM 길이가 허용치를 초과했습니다.');
  const pcm=new Float32Array(frames);
  const channels=Array.from({length:audio.numberOfChannels},
   (_,k)=>audio.getChannelData(k));
  // Interpolate to 16kHz mono for analysis only. This does not save a
  // resampled music file, extract source melody, or train a generative model.
  for(let index=0;index<frames;index++){
   if(index%32000===0)abort();
   const exact=index*audio.sampleRate/sampleRate,
    before=Math.min(audio.length-1,Math.floor(exact)),
    after=Math.min(audio.length-1,before+1),alpha=exact-before;
   let sum=0;
   for(const ch of channels)sum+=ch[before]*(1-alpha)+ch[after]*alpha;
   pcm[index]=sum/channels.length;
  }
  onProgress('실제 원곡 16kHz 분석용 PCM의 RMS·시간대별 강약 계산 중');
  const analysis=analyzeMusicStructure({samples:pcm,sampleRate,
   channels:1,windowSeconds:.25});abort();
  const rights=signedRights(entry);
  const entryManifest={music:{
   id:entry.id,sha256:sourceHash,rights
  },analysis};
  const basic=createMusicStyleProfile({
   id:'style_'+String(entry.id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,65),
   name:String(entry.name||'MY MUSIC STYLE').slice(0,200),
   entries:[entryManifest]
  });
  const energy32=ownedMusicEnergyCurve8(analysis);
  abort();onProgress('원곡의 실제 PCM 비트 간격과 12개 음높이 클래스 조성 분석 중');
  const audioFeatures8=frames>=sampleRate*8?
   analyzeOwnedMusicTempoTonal8(pcm,sampleRate,{signal,onProgress}):null;
  abort();
  return {...basic,version:2,id:basic.id,sourceLearningId:entry.id,
   ownerRights:entry.rights,energy32,
   ...(audioFeatures8?{audioFeatures8}:{}),
   analysisSource:'actual-owned-local-pcm',
   learningScope:'original-song-energy-descriptors-only',
   trainedNeuralWeights:false,
   unavailable:[
    ...(audioFeatures8?.rhythm.estimatedBpm?[]:['confident-inferred-bpm']),
    ...(audioFeatures8?.tonality.estimatedKey?[]:['confident-inferred-key']),
    'inferred-genre','extracted-melody','separated-instruments',
    'detected-chord-progression','fully-neural-style-training'
   ]};
 }finally{await context.close().catch(()=>{});}
}
export function validateOwnedMusicStyle8(style){
 if(!style||style.type!=='my-music-style'||style.version!==2||
  style.analysisSource!=='actual-owned-local-pcm'||
  style.learningScope!=='original-song-energy-descriptors-only'||
  style.trainedNeuralWeights!==false||
  !['owned','self','licensed'].includes(style.ownerRights)||
  typeof style.sourceLearningId!=='string'||!style.sourceLearningId||
  !Array.isArray(style.energy32)||style.energy32.length!==32||
  style.energy32.some(v=>!Number.isFinite(v)||v<0||v>2.5))
  throw Error('소유권 확인된 실제 오디오 분석 스타일 프로필만 재사용할 수 있습니다.');
 if(style.audioFeatures8!==undefined&&(
   style.audioFeatures8?.version!==1||
   style.audioFeatures8.source!=='actual-owner-authorized-pcm-dsp'||
   style.audioFeatures8.neuralTraining!==false||
   (style.audioFeatures8.rhythm?.estimatedBpm!==null&&
    (!Number.isInteger(style.audioFeatures8.rhythm?.estimatedBpm)||
     style.audioFeatures8.rhythm.estimatedBpm<40||
     style.audioFeatures8.rhythm.estimatedBpm>240))||
   (style.audioFeatures8.tonality?.chroma12!==null&&
    (!Array.isArray(style.audioFeatures8.tonality?.chroma12)||
     style.audioFeatures8.tonality.chroma12.length!==12||
     style.audioFeatures8.tonality.chroma12.some(x=>!Number.isFinite(x)||x<0||x>1)))))
  throw Error('오디오 BPM·조성 추정 프로필 데이터가 올바르지 않습니다.');
 return true;
}
export function ownedMusicGuideForProject8(profile){
 validateOwnedMusicStyle8(profile);
 return {version:1,type:'original-owned-music-energy-only',
  profileId:profile.id,sourceLearningId:profile.sourceLearningId,
  energy32:[...profile.energy32],sourceHash:profile.sources?.[0]?.sha256||'',
  scope:'relative-dynamics-not-melody-or-composition',
  ...(profile.audioFeatures8?{
   estimatedBpm:profile.audioFeatures8.rhythm.estimatedBpm,
   estimatedKey:profile.audioFeatures8.tonality.estimatedKey,
   estimatedBpmConfidence:profile.audioFeatures8.rhythm.confidence,
   estimatedKeyConfidence:profile.audioFeatures8.tonality.confidence,
   note:'추정 BPM/조성은 수동 선택 전까지 원곡과 새 노래 BPM/Key를 변경하지 않음'
  }: {})};
}
export function ownedMusicSectionEnergy8(project,position){
 const guide=project?.ownedMusicGuide8;
 if(guide?.version!==1||
  guide.type!=='original-owned-music-energy-only'||
  !Array.isArray(guide.energy32)||guide.energy32.length!==32||
  !Number.isFinite(position)||position<0||position>1)return null;
 const x=position*31,index=Math.floor(x),hi=Math.min(31,index+1);
 const lo=guide.energy32[index],up=guide.energy32[hi];
 if(!Number.isFinite(lo)||!Number.isFinite(up)||lo<0||up<0||
    lo>2.5||up>2.5)return null;
 return lo+(up-lo)*(x-index);
}
