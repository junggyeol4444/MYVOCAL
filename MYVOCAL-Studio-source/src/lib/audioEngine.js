// MYVOCAL Studio v0.3: local-only audio playback and deterministic WAV mixdown.
// This is NOT an AI composition, voice conversion, or mastering engine.
import {getFile} from './assetDb';
import {midiEnd,validNotes,beatSeconds,noteMidi} from './midiEngine';
const cache = new Map();
let decodingContext;
function context(){
 if(!decodingContext){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('이 환경은 Web Audio API를 지원하지 않습니다.');decodingContext=new C();}
 return decodingContext;
}
export const secondsPerBar=bpm=>240/Math.max(1,Number(bpm)||120);
export const audioEnd=p=>Math.max(midiEnd(p),0,...(p.tracks||[]).flatMap(t=>(t.clips||[]).map(c=>(Math.max(1,Number(c.startBar)||1)-1)*secondsPerBar(p.bpm)+(Number(c.durationSec)||0))));
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
  this.offset=offset;this.startedAt=ctx.currentTime+.045;this.playing=true;
  const bar=secondsPerBar(project.bpm);const solo=project.tracks.some(t=>t.solo);
  clips.forEach((item,i)=>{
   const start=(Math.max(1,Number(item.clip.startBar)||1)-1)*bar;
   const duration=buffers[i].duration;
   const localOffset=Math.max(0,offset-start);
   if(localOffset>=duration||start+duration<=offset)return;
   const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers[i];
   gain.gain.value=audible(item.track,solo)?Math.max(0,Math.min(1,Number(item.track.volume??75)/100)):0;
   source.connect(gain);gain.connect(ctx.destination);
   const delay=Math.max(0,start-offset),when=this.startedAt+delay;
   source.start(when,localOffset);
   this.sources.push({source,gain,trackId:item.track.id});
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
function encodeWav(buf){
 const channels=2,n=buf.length,dataBytes=n*channels*2;const arr=new ArrayBuffer(44+dataBytes),v=new DataView(arr);
 const str=(pos,s)=>{for(let i=0;i<s.length;i++)v.setUint8(pos+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+dataBytes,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,dataBytes,true);
 const l=buf.getChannelData(0),r=buf.getChannelData(buf.numberOfChannels>1?1:0);let off=44;
 for(let i=0;i<n;i++){for(const x of [l[i],r[i]]){const s=Math.max(-1,Math.min(1,x));v.setInt16(off,s<0?s*32768:s*32767,true);off+=2;}}
 return new Blob([arr],{type:'audio/wav'});
}
export async function mixdownWav(project){
 const max=audioEnd(project);if(!max)throw new Error('믹스할 오디오가 없습니다.');
 if(max>8*60)throw new Error('현재 버전은 8분 이하 프로젝트만 WAV로 내보낼 수 있습니다.');
 const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw new Error('오프라인 오디오 믹싱을 지원하지 않는 환경입니다.');
 const rate=44100,offline=new C(2,Math.ceil(max*rate),rate),solo=project.tracks.some(t=>t.solo);
 let count=0;
 for(const t of project.tracks){if(!audible(t,solo))continue;
  for(const c of t.clips||[]){if(!c.assetId)continue;
   const decoded=await audioBufferFor(c.assetId),src=offline.createBufferSource(),gain=offline.createGain();
   src.buffer=decoded;gain.gain.value=Math.max(0,Math.min(1,Number(t.volume??75)/100));src.connect(gain);gain.connect(offline.destination);
   const start=(Math.max(1,Number(c.startBar)||1)-1)*secondsPerBar(project.bpm);
   src.start(start);count++;
  }
 }
 for(const track of project.tracks){if(!audible(track,solo))continue;
  for(const n of validNotes(track)){const begin=Math.max(0,Number(n.startBeat))*beatSeconds(project.bpm),dur=Math.max(.05,Number(n.length))*beatSeconds(project.bpm);
   const voice=noteMidi(offline,track,n,begin,dur,offline.destination);voice.gain.gain.value=Math.max(0,Math.min(1,Number(track.volume??75)/100));count++;
  }
 }
 if(!count)throw new Error('믹싱할 활성 오디오 또는 MIDI 음표가 없습니다. 음소거/솔로 설정을 확인해 주세요.');
 const rendered=await offline.startRendering();return encodeWav(rendered);
}
export const formatClock=s=>{const v=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;};
