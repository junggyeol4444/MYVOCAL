// Long-song RVC conversion reuses the installed Windows RVC inference bridge.
// This is real sequential inference on the user's permitted model, not a demo.
// All source files and original project tracks remain unchanged.
import {convertVoiceWithRVC,RVC_SOURCE_LIMIT} from './rvcVoiceConversion.js';
import {inspectSingingWav,assertUsableSingingWav} from './singingOutputValidation.js';

const MAX_SECONDS=360;
const MAX_PARTS=16;
const OVERLAP_SECONDS=.08;
const rd32=(d,p)=>d.getUint32(p,true);
const setTag=(b,at,tag)=>{for(let i=0;i<4;i++)b[at+i]=tag.charCodeAt(i)};
function audioChunkLayout(bytes){
 const info=inspectSingingWav(bytes);
 if(!info.valid)throw Error('RVC 가창 원본 WAV가 올바르지 않습니다: '+info.reason);
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let at=12,pcm=null;
 while(at+8<=bytes.length){
  const tag=String.fromCharCode(...bytes.subarray(at,at+4)),size=rd32(v,at+4),start=at+8;
  if(size>bytes.length-start)throw Error('가창 WAV 청크가 손상됐습니다.');
  if(tag==='data'){
   if(pcm)throw Error('중복된 WAV 오디오 청크입니다.');
   pcm=bytes.subarray(start,start+size);
  }
  at=start+size+(size&1);
 }
 const align=info.channels*(info.bits/8);
 if(!pcm||pcm.length%align)throw Error('RVC 가창 WAV 데이터가 올바르지 않습니다.');
 return {info,pcm,align,frames:pcm.length/align};
}
function pcmWavSlice(layout,startFrame,endFrame){
 const {info,pcm,align}=layout,frames=endFrame-startFrame;
 const out=new Uint8Array(44+frames*align),v=new DataView(out.buffer);
 setTag(out,0,'RIFF');setTag(out,8,'WAVE');setTag(out,12,'fmt ');setTag(out,36,'data');
 v.setUint32(4,out.length-8,true);v.setUint32(16,16,true);
 v.setUint16(20,info.encoding,true);v.setUint16(22,info.channels,true);
 v.setUint32(24,info.sampleRate,true);v.setUint32(28,info.sampleRate*align,true);
 v.setUint16(32,align,true);v.setUint16(34,info.bits,true);
 v.setUint32(40,frames*align,true);
 out.set(pcm.subarray(startFrame*align,endFrame*align),44);
 return out;
}
// Neural conversion at a hard chunk edge can click or change timbre. Send
// a short shared region to both inferences and crossfade their PCM results.
// Every chunk is still a real WAV passed to the existing installed RVC CLI.
export function planRVCWavChunks(input,{maxBytes=RVC_SOURCE_LIMIT,overlapSeconds=OVERLAP_SECONDS,preferredSplitSeconds=[]}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const layout=audioChunkLayout(bytes);
 if(!Number.isInteger(maxBytes)||maxBytes<4096||maxBytes>RVC_SOURCE_LIMIT)
  throw Error('RVC 변환 분할 크기가 올바르지 않습니다.');
 if(layout.info.durationSec>MAX_SECONDS)throw Error('RVC 긴 곡 변환은 최대 360초입니다.');
 if(!Number.isFinite(overlapSeconds)||overlapSeconds<0||overlapSeconds>.25)
  throw Error('RVC 구간 겹침 길이는 0~0.25초만 지원합니다.');
 const maxFrames=Math.min(Math.floor((maxBytes-44)/layout.align),Math.floor(layout.info.sampleRate*75));
 let overlapFrames=Math.round(layout.info.sampleRate*overlapSeconds);
 // Do not allow overlap to consume most of a very short upload limit.
 if(maxFrames<layout.info.sampleRate*.20)throw Error('RVC WAV 분할 길이가 너무 짧습니다.');
 overlapFrames=Math.min(overlapFrames,Math.floor(maxFrames/8));
 const coreCapacity=maxFrames-2*overlapFrames;
 const count=Math.ceil(layout.frames/coreCapacity);
 if(count>MAX_PARTS)throw Error('긴 RVC 가창은 최대 16개 구간으로 처리합니다.');
 if(!Array.isArray(preferredSplitSeconds)||preferredSplitSeconds.length>2048||
    preferredSplitSeconds.some(x=>!Number.isFinite(x)||x<=0||x>=layout.info.durationSec))
  throw Error('MIDI 휴지 구간 분할 시간표가 올바르지 않습니다.');
 const candidates=[...new Set(preferredSplitSeconds.map(s=>Math.round(s*layout.info.sampleRate)))];
 const boundaries=[0];
 for(let i=1;i<count;i++){
  const previous=boundaries[i-1],remaining=count-i;
  const minimum=Math.max(previous+1,layout.frames-remaining*coreCapacity);
  const maximum=Math.min(previous+coreCapacity,layout.frames-remaining);
  if(minimum>maximum)throw Error('RVC 가창 분할 용량으로 전곡을 나눌 수 없습니다.');
  const nominal=Math.max(minimum,Math.min(maximum,Math.round(i*layout.frames/count)));
  const maxDeviation=Math.floor(layout.info.sampleRate*.9);
  const preferred=candidates.filter(frame=>frame>=minimum&&frame<=maximum&&
   Math.abs(frame-nominal)<=maxDeviation);
  preferred.sort((a,b)=>Math.abs(a-nominal)-Math.abs(b-nominal)||a-b);
  boundaries.push(preferred[0]??nominal);
 }
 boundaries.push(layout.frames);
 const chunks=[];
 for(let i=0;i<count;i++){
  const coreFrom=boundaries[i],coreTo=boundaries[i+1];
  const from=Math.max(0,coreFrom-overlapFrames),to=Math.min(layout.frames,coreTo+overlapFrames);
  const wav=pcmWavSlice(layout,from,to);
  if(wav.byteLength>maxBytes)throw Error('RVC 분할 WAV 크기 제한을 초과했습니다.');
  chunks.push({wav,startSec:from/layout.info.sampleRate,limitSec:to/layout.info.sampleRate,
   coreStartSec:coreFrom/layout.info.sampleRate,coreEndSec:coreTo/layout.info.sampleRate,
   durationSec:(to-from)/layout.info.sampleRate});
 }
 return {chunks,durationSec:layout.info.durationSec,info:layout.info,overlapSeconds:overlapFrames/layout.info.sampleRate};
}
function readSample(data,at,info){
 if(info.encoding===3)return new DataView(data.buffer,data.byteOffset+at,4).getFloat32(0,true);
 if(info.bits===16)return ((data[at]|data[at+1]<<8)<<16>>16)/32768;
 let v=data[at]|data[at+1]<<8|data[at+2]<<16;
 if(v&0x800000)v-=0x1000000;
 return v/8388608;
}
function writeSample(data,at,info,value){
 if(!Number.isFinite(value))throw Error('RVC 변환 결과에 유효하지 않은 샘플이 있습니다.');
 if(info.encoding===3){new DataView(data.buffer,data.byteOffset+at,4).setFloat32(0,value,true);return;}
 const max=info.bits===16?32767:8388607,min=info.bits===16?-32768:-8388608;
 const n=Math.max(min,Math.min(max,Math.round(value*(max+1))));
 if(info.bits===16){data[at]=n&255;data[at+1]=n>>8&255;return;}
 data[at]=n&255;data[at+1]=n>>8&255;data[at+2]=n>>16&255;
}
export function joinOverlappedRVCWavs(parts,durationSec){
 if(!Array.isArray(parts)||!parts.length||parts.length>MAX_PARTS||!Number.isFinite(durationSec)||durationSec<=0||durationSec>MAX_SECONDS)
  throw Error('RVC WAV 결합 구간 정보가 올바르지 않습니다.');
 const parsed=parts.map((part,i)=>{
  const wav=part.bytes instanceof Uint8Array?part.bytes:new Uint8Array(part.bytes);
  const layout=audioChunkLayout(wav);
  assertUsableSingingWav(wav,{maxDurationSec:90});
  if(!Number.isFinite(part.startSec)||!Number.isFinite(part.limitSec)||!Number.isFinite(part.coreStartSec)||!Number.isFinite(part.coreEndSec)||
    part.startSec<0||part.startSec>=part.limitSec||part.coreStartSec<part.startSec||part.coreEndSec>part.limitSec||part.coreStartSec>=part.coreEndSec||part.limitSec>durationSec+.001)
   throw Error('RVC 겹침 구간의 시간 범위가 올바르지 않습니다.');
  if(Math.abs(layout.info.durationSec-(part.limitSec-part.startSec))>.05)
   throw Error('RVC 신경망 출력이 입력 구간보다 0.05초 이상 길거나 짧습니다.');
  return {...part,layout};
 });
 const format=parsed[0].layout.info;
 for(const part of parsed){const f=part.layout.info;
  if(f.encoding!==format.encoding||f.channels!==format.channels||f.bits!==format.bits||f.sampleRate!==format.sampleRate)
   throw Error('RVC 구간마다 WAV 샘플레이트·채널·형식이 다릅니다.');
 }
 const frames=Math.round(durationSec*format.sampleRate),align=format.channels*format.bits/8;
 const pcmLength=frames*align,padding=pcmLength&1;
 if(44+pcmLength+padding>128*1024*1024)throw Error('RVC 긴 곡 WAV가 128MiB를 초과했습니다.');
 const result=new Uint8Array(44+pcmLength+padding),view=new DataView(result.buffer);
 setTag(result,0,'RIFF');setTag(result,8,'WAVE');setTag(result,12,'fmt ');setTag(result,36,'data');
 view.setUint32(4,result.length-8,true);view.setUint32(16,16,true);
 view.setUint16(20,format.encoding,true);view.setUint16(22,format.channels,true);
 view.setUint32(24,format.sampleRate,true);view.setUint32(28,format.sampleRate*align,true);
 view.setUint16(32,align,true);view.setUint16(34,format.bits,true);
 view.setUint32(40,pcmLength,true);
 let previous=null;
 for(const part of parsed){
  const {pcm}=part.layout;
  const from=Math.round(part.startSec*format.sampleRate),to=Math.min(frames,Math.round(part.limitSec*format.sampleRate));
  const boundary=Math.round(part.coreStartSec*format.sampleRate);
  if(previous && (Math.abs(part.coreStartSec-previous.coreEndSec)>.001 || part.startSec>previous.limitSec+.001))
   throw Error('RVC 분할 구간이 연속되지 않습니다.');
  const fadeStart=previous?from:to,fadeEnd=previous?Math.min(to,Math.round(previous.limitSec*format.sampleRate)):from;
  for(let frame=from;frame<to;frame++){
   const sourceFrame=frame-from;
   if(sourceFrame>=part.layout.frames)break;
   for(let channel=0;channel<format.channels;channel++){
    const src=sourceFrame*align+channel*format.bits/8;
    const dst=44+frame*align+channel*format.bits/8;
    let value=readSample(pcm,src,format);
    if(previous && frame<fadeEnd){
     const old=readSample(result,dst,format);
     const blend=fadeEnd>fadeStart?(frame-fadeStart)/(fadeEnd-fadeStart):1;
     value=old*(1-blend)+value*blend;
    }
    writeSample(result,dst,format,value);
   }
  }
  previous=part;
 }
 assertUsableSingingWav(result,{maxDurationSec:MAX_SECONDS});
 return new Blob([result],{type:'audio/wav'});
}
export async function convertLongSingingWithRVC(file,settings,{
 session,signal,onProgress=()=>{},convert=convertVoiceWithRVC,maxInputBytes=RVC_SOURCE_LIMIT,
 preferredSplitSeconds=[]
}={}){
 if(!(file instanceof Blob))throw Error('RVC 가창 원본 WAV가 필요합니다.');
 if(!Number.isInteger(maxInputBytes)||maxInputBytes<4096||maxInputBytes>RVC_SOURCE_LIMIT)throw Error('RVC 분할 크기 설정이 올바르지 않습니다.');
 if(signal?.aborted)throw Error('RVC 긴 곡 변환을 취소했습니다.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 assertUsableSingingWav(bytes,{maxDurationSec:MAX_SECONDS});
 if(bytes.byteLength<=maxInputBytes){
  const result=await convert(file,settings,{session,signal});
  if(!(result instanceof Blob))throw Error('RVC 신경망이 WAV를 반환하지 않았습니다.');
  assertUsableSingingWav(new Uint8Array(await result.arrayBuffer()),{maxDurationSec:MAX_SECONDS});
  if(signal?.aborted)throw Error('RVC 긴 곡 변환을 취소했습니다.');
  onProgress(1,1);
  return result;
 }
 const {chunks,durationSec}=planRVCWavChunks(bytes,{maxBytes:maxInputBytes,preferredSplitSeconds});
 const rendered=[];
 for(let i=0;i<chunks.length;i++){
  if(signal?.aborted)throw Error('RVC 긴 곡 변환을 취소했습니다.');
  const chunk=chunks[i];
  const input=new File([chunk.wav],`MYVOCAL-RVC-${i+1}.wav`,{type:'audio/wav'});
  const output=await convert(input,settings,{session,signal});
  if(!(output instanceof Blob))throw Error('RVC 신경망이 구간 WAV를 반환하지 않았습니다.');
  const wav=new Uint8Array(await output.arrayBuffer());
  assertUsableSingingWav(wav,{maxDurationSec:90});
  rendered.push({bytes:wav,startSec:chunk.startSec,limitSec:chunk.limitSec,coreStartSec:chunk.coreStartSec,coreEndSec:chunk.coreEndSec});
  onProgress(i+1,chunks.length);
 }
 if(signal?.aborted)throw Error('RVC 긴 곡 변환을 취소했습니다.');
 const combined=joinOverlappedRVCWavs(rendered,durationSec);
 return new File([combined],'MYVOCAL-RVC-긴곡.wav',{type:'audio/wav'});
}
