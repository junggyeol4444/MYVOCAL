// MYVOCAL Studio v0.3: local-only audio playback and deterministic WAV mixdown.
// This is NOT an AI composition, voice conversion, or mastering engine.
import {getFile} from './assetDb.js';
import {analyzeMixPeak} from './mixPeak.js';
import {analyzeWavPeakNormalization} from './wavNormalize.js';
import {findWavAudibleRange} from './wavTrim.js';
import {analyzeWavExport} from './wavExportMeter.js';
import {resolveWavExportRange} from './wavExportRange.js';
import {encodeWavPcm,WAV_EXPORT_SAMPLE_RATES,WAV_EXPORT_CHANNELS,WAV_EDGE_FADE_MS} from './wavPcm.js';
import {midiEnd,validNotes,beatSeconds,noteMidi} from './midiEngine.js';
import {clipWindow,clipPlaybackPlan,clipsEnd,scheduleClipFade,scheduleClipLevel,clipPan,scheduleClipPan,monoPanCompensation} from './clipTiming.js';
const cache = new Map();
let decodingContext;
function context(){
 if(!decodingContext){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('이 환경은 Web Audio API를 지원하지 않습니다.');decodingContext=new C();}
 return decodingContext;
}
export const secondsPerBar=bpm=>240/Math.max(1,Number(bpm)||120);
export const audioEnd=p=>Math.max(midiEnd(p),clipsEnd(p));
export async function audioBufferFor(assetId){
 if(!assetId)throw new Error('오디오 파일 ID가 없습니다.');
 if(!cache.has(assetId))cache.set(assetId,(async()=>{
  const file=await getFile(assetId);if(!file)throw new Error('클립의 원본 파일이 없습니다. 백업에서 복원하거나 다시 가져와 주세요.');
  const arr=await file.arrayBuffer();return await context().decodeAudioData(arr.slice(0));
 })().catch(e=>{cache.delete(assetId);throw e;}));
 return cache.get(assetId);
}
export async function readAudioInfo(file){
 if(!file?.size)throw new Error('내용이 없는 파일입니다.');
 const data=await file.arrayBuffer();
 const decoded=await context().decodeAudioData(data.slice(0));
 if(!(decoded.duration>0))throw new Error('올바른 오디오가 아닙니다.');
 return decoded;
}
export function forgetAudio(assetId){cache.delete(assetId);}
function audible(track,hasSolo){return !track.mute&&(!hasSolo||!!track.solo);}
// Single routing implementation for live playback and offline export.
// Centered/legacy clips bypass the pan stage and preserve the old graph.
function connectClipAudio(ctx,source,fade,clipGain,trackGain,clip,buffer,startTime) {
 source.connect(fade);fade.connect(clipGain);
 const nodes=[source,fade,clipGain],pan=clipPan(clip);
 if (pan!==0) {
  if (typeof ctx.createStereoPanner !== 'function')
   throw Error('이 오디오 환경은 클립 좌우 위치 조절을 지원하지 않습니다.');
  const panner=ctx.createStereoPanner();
  if (buffer.numberOfChannels===1) {
   const compensation=ctx.createGain();
   compensation.gain.value=monoPanCompensation(pan);
   clipGain.connect(compensation);compensation.connect(panner);
   nodes.push(compensation);
  } else clipGain.connect(panner);
  scheduleClipPan(panner.pan,clip,startTime);
  panner.connect(trackGain);nodes.push(panner);
 } else clipGain.connect(trackGain);
 trackGain.connect(ctx.destination);
 return [...nodes,trackGain];
}
export class AudioEngine{
 constructor(){this.sources=[];this.startedAt=0;this.offset=0;this.playing=false;this.seq=0;}
 position(){return this.playing?this.offset+Math.max(0,context().currentTime-this.startedAt):this.offset;}
 stop(position){
  this.seq++;
  const current=position===undefined?this.position():position;
  for(const x of this.sources){try{x.source.stop();}catch{}try{(x.nodes||[x.source,x.gain]).forEach(n=>n.disconnect());}catch{}}
  this.sources=[];this.playing=false;this.offset=Math.max(0,current);
 }
 updateGains(tracks){
  const solo=tracks.some(t=>t.solo);
  for(const item of this.sources){const t=tracks.find(x=>x.id===item.trackId);if(t){const volume=Math.max(0,Math.min(1,Number(t.volume??75)/100));item.gain.gain.setTargetAtTime(audible(t,solo)?volume:0,context().currentTime,.012);}}
 }
 async play(project,offset=0){
  this.stop(offset);
  const seq=this.seq;
  const clips=(project.tracks||[]).flatMap(t=>(t.clips||[]).filter(c=>c.assetId).map(c=>({track:t,clip:c})));
  const midiCount=project.tracks.reduce((n,t)=>n+validNotes(t).length,0);
  if(!clips.length&&!midiCount)throw new Error('재생할 오디오 또는 MIDI 음표가 없습니다.');
  const buffers=await Promise.all(clips.map(x=>audioBufferFor(x.clip.assetId)));
  if(seq!==this.seq)return false;
  const ctx=context();await ctx.resume();if(seq!==this.seq)return false;
  if (clips.some(item=>clipPan(item.clip)!==0) && typeof ctx.createStereoPanner!=='function')
   throw Error('이 오디오 환경은 클립 좌우 위치 조절을 지원하지 않습니다.');
  this.offset=offset;this.startedAt=ctx.currentTime+.045;this.playing=true;
  const solo=project.tracks.some(t=>t.solo);
  clips.forEach((item,i)=>{
   const plan=clipPlaybackPlan(item.clip,project.bpm,offset,buffers[i].duration);
   if(!plan)return;
   const source=ctx.createBufferSource(),gain=ctx.createGain(),fade=ctx.createGain(),clipGain=ctx.createGain();source.buffer=buffers[i];
   gain.gain.value=audible(item.track,solo)?Math.max(0,Math.min(1,Number(item.track.volume??75)/100)):0;
   const when=this.startedAt+plan.delaySec;
   const nodes=connectClipAudio(ctx,source,fade,clipGain,gain,item.clip,buffers[i],when);
   const window=clipWindow(item.clip,project.bpm,buffers[i].duration);
   const elapsed=plan.sourceOffsetSec-window.sourceOffsetSec;
   scheduleClipFade(fade.gain,item.clip,window.durationSec,elapsed,when);
   scheduleClipLevel(clipGain.gain,item.clip,when);
   source.start(when,plan.sourceOffsetSec,plan.durationSec);
   this.sources.push({source,gain,nodes,trackId:item.track.id});
  });
  const beat=beatSeconds(project.bpm);
  for(const track of project.tracks){
   for(const n of validNotes(track)){
    const begin=Math.max(0,Number(n.startBeat))*beat,duration=Math.max(.05,Number(n.length))*beat;
    if(begin+duration<=offset)continue;
    const elapsed=Math.max(0,offset-begin);
    const when=this.startedAt+Math.max(0,begin-offset);
    const voice=noteMidi(ctx,track,n,when,Math.max(.03,duration-elapsed),ctx.destination);
    voice.gain.gain.value=audible(track,solo)?Math.max(0,Math.min(1,Number(track.volume??75)/100)):0;
    this.sources.push(voice);
   }
  }
  return true;
 }
}
// Detailed export is opt-in. Legacy mixdownWav() retains its original Blob API
// and identical PCM output when peak protection is not requested.
export async function mixdownWavDetailed(project, options={}){
 if (options === null || typeof options !== 'object' || Array.isArray(options))
  throw new Error('WAV 내보내기 옵션이 올바르지 않습니다.');
 const bitDepth=options.bitDepth===undefined?16:options.bitDepth;
 if (bitDepth!==16 && bitDepth!==24 && bitDepth!==32)throw new Error('WAV 형식은 16/24비트 PCM 또는 32비트 float만 지원합니다.');
 const sampleRate=options.sampleRate===undefined?44100:options.sampleRate;
 if (!WAV_EXPORT_SAMPLE_RATES.includes(sampleRate))throw new Error('WAV 샘플레이트는 44.1kHz 또는 48kHz만 지원합니다.');
 const channels=options.channels===undefined?2:options.channels;
 if (!WAV_EXPORT_CHANNELS.includes(channels))throw new Error('WAV 출력 채널은 모노(1) 또는 스테레오(2)만 지원합니다.');
 if (options.trimSilence!==undefined && typeof options.trimSilence!=='boolean')
  throw new Error('WAV 앞뒤 무음 제거 옵션이 올바르지 않습니다.');
 if (options.edgeFade!==undefined && typeof options.edgeFade!=='boolean')
  throw new Error('WAV 경계 페이드 옵션이 올바르지 않습니다.');
 if (options.dither16!==undefined && typeof options.dither16!=='boolean')
  throw new Error('WAV 16비트 디더 옵션이 올바르지 않습니다.');
 if (options.dither16===true && bitDepth!==16)
  throw new Error('WAV TPDF 디더는 16비트 PCM에서만 지원합니다.');
 if (options.normalizePeak!==undefined && typeof options.normalizePeak!=='boolean')
  throw new Error('WAV 피크 정규화 옵션이 올바르지 않습니다.');
 const max=audioEnd(project);if(!max)throw new Error('믹스할 오디오가 없습니다.');
 if(max>8*60)throw new Error('현재 버전은 8분 이하 프로젝트만 WAV로 내보낼 수 있습니다.');
 // Reject invalid selections before decoding assets or creating the renderer.
 resolveWavExportRange({length:Math.ceil(max*sampleRate),sampleRate},options);
 const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw new Error('오프라인 오디오 믹싱을 지원하지 않는 환경입니다.');
 const offline=new C(2,Math.ceil(max*sampleRate),sampleRate),solo=project.tracks.some(t=>t.solo);
 let count=0;
 for(const t of project.tracks){if(!audible(t,solo))continue;
  for(const c of t.clips||[]){if(!c.assetId)continue;
   const decoded=await audioBufferFor(c.assetId),src=offline.createBufferSource(),gain=offline.createGain(),fade=offline.createGain(),clipGain=offline.createGain();
   const timing=clipWindow(c,project.bpm,decoded.duration);
   if(timing.durationSec<.01)continue;
   src.buffer=decoded;gain.gain.value=Math.max(0,Math.min(1,Number(t.volume??75)/100));
   connectClipAudio(offline,src,fade,clipGain,gain,c,decoded,timing.startSec);
   scheduleClipFade(fade.gain,c,timing.durationSec,0,timing.startSec);
   scheduleClipLevel(clipGain.gain,c,timing.startSec);
   src.start(timing.startSec,timing.sourceOffsetSec,timing.durationSec);count++;
  }
 }
 for(const track of project.tracks){if(!audible(track,solo))continue;
  for(const n of validNotes(track)){const begin=Math.max(0,Number(n.startBeat))*beatSeconds(project.bpm),dur=Math.max(.05,Number(n.length))*beatSeconds(project.bpm);
   const voice=noteMidi(offline,track,n,begin,dur,offline.destination);voice.gain.gain.value=Math.max(0,Math.min(1,Number(track.volume??75)/100));count++;
  }
 }
 if(!count)throw new Error('믹싱할 활성 오디오 또는 MIDI 음표가 없습니다. 음소거/솔로 설정을 확인해 주세요.');
 const rendered=await offline.startRendering();
 const selection=resolveWavExportRange(rendered,options);
 const trimReport=options.trimSilence===true ? findWavAudibleRange(rendered,{channels,startFrame:selection.startFrame,endFrame:selection.endFrame}) : null;
 const frameRange=trimReport ? {startFrame:trimReport.startFrame,endFrame:trimReport.endFrame}
  : {startFrame:selection.startFrame,endFrame:selection.endFrame};
 const edgeFadeMs=options.edgeFade===true?WAV_EDGE_FADE_MS:0;
 // Normalization supersedes the attenuation-only guard, using one gain for all
 // output channels. When disabled, the legacy export path remains unchanged.
 const normalizationReport=options.normalizePeak===true
  ? analyzeWavPeakNormalization(rendered,{channels,...frameRange,edgeFadeMs}) : null;
 const peakReport=!normalizationReport && options.peakProtection===true
  ? analyzeMixPeak(rendered,undefined,{mono:channels===1,...frameRange}) : null;
 const exportGain=normalizationReport?.gain??peakReport?.gain??1;
 // Meter the exact selected/downmixed/faded samples before quantization.
 // Report PCM over-range risk and float playback risk without changing audio.
 const outputReport=analyzeWavExport(rendered,{channels,exportGain,...frameRange,edgeFadeMs});
 return {blob:encodeWavPcm(rendered,{bitDepth,channels,exportGain,...frameRange,edgeFadeMs,dither16:options.dither16===true}),peakReport,trimReport,normalizationReport,selectionReport:selection.selected?selection:null,outputReport};
}
export async function mixdownWav(project,options={}){
 return (await mixdownWavDetailed(project,options)).blob;
}
export const formatClock=s=>{const v=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;};
