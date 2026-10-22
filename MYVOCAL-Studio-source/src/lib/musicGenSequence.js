// Local MusicGen sequence assembler. Each source is a REAL MusicGen inference
// WAV; this is PCM overlap/crossfade, NOT neural continuation or full-song AI.
import {generateMusicGenAudio,musicGenSettingsValid} from './musicGenClient.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {smoothMusicGenCrossfade} from './musicGenTransitionEnvelope.js';
import {assertFreshMusicGenPcm} from './musicGenChunkIntegrity.js';
export const MAX_SEQUENCE_SEGMENTS=20;
export function musicGenContinuationPrompt(previous,{seconds=6}={}){
 const bytes=previous instanceof Uint8Array?previous:new Uint8Array(previous);
 const p=parsePcm16(bytes);
 if(!Number.isFinite(seconds)||seconds<3||seconds>8)throw Error('연속 생성 문맥은 3~8초여야 합니다.');
 const kept=Math.round(p.rate*seconds);
 if(p.frames<kept)throw Error('이전 MusicGen WAV가 문맥 구간보다 짧습니다.');
 const end=p.pcm.subarray((p.frames-kept)*p.channels*2);
 const out=new Uint8Array(44+end.length),v=new DataView(out.buffer);
 for(const [i,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let n=0;n<4;n++)out[i+n]=text.charCodeAt(n);
 v.setUint32(4,out.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,p.channels,true);
 v.setUint32(24,p.rate,true);v.setUint32(28,p.rate*p.channels*2,true);v.setUint16(32,p.channels*2,true);v.setUint16(34,16,true);
 v.setUint32(40,end.length,true);out.set(end,44);
 // Bounded: 8s * 96kHz * stereo PCM; no off-device API or media storage.
 let binary='';for(let i=0;i<out.length;i+=32768)binary+=String.fromCharCode(...out.subarray(i,i+32768));
 return btoa(binary);
}
export const MAX_SEQUENCE_BYTES=160*1024*1024;
function parsePcm16(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<44||String.fromCharCode(...b.slice(0,4))!=='RIFF'||String.fromCharCode(...b.slice(8,12))!=='WAVE'||view.getUint32(4,true)+8!==b.length)throw Error('MusicGen WAV 컨테이너가 손상됐습니다.');
 let offset=12,format=null,pcm=null;
 while(offset+8<=b.length){
  const tag=String.fromCharCode(...b.subarray(offset,offset+4));
  const size=view.getUint32(offset+4,true),begin=offset+8;
  if(size>b.length-begin)throw Error('MusicGen WAV 청크가 손상됐습니다.');
  if(tag==='fmt '){
   if(format||size<16)throw Error('MusicGen WAV 포맷이 올바르지 않습니다.');
   format={codec:view.getUint16(begin,true),channels:view.getUint16(begin+2,true),rate:view.getUint32(begin+4,true),bits:view.getUint16(begin+14,true)};
  }else if(tag==='data'){
   if(pcm)throw Error('MusicGen WAV 오디오 데이터가 중복됐습니다.');
   pcm=b.subarray(begin,begin+size);
  }
  offset=begin+size+(size&1);
 }
 if(!format||!pcm||format.codec!==1||format.bits!==16||![1,2].includes(format.channels)||format.rate<8000||format.rate>96000||pcm.length%(format.channels*2)!==0)throw Error('16비트 PCM WAV(모노/스테레오)만 이어 붙일 수 있습니다.');
 if(!pcm.length)throw Error('MusicGen WAV에 오디오가 없습니다.');
 return {...format,pcm,frames:pcm.length/(2*format.channels)};
}
export function joinMusicGenWaves(waves,{crossfadeSec=.5}={}){
 if(!Array.isArray(waves)||waves.length<2||waves.length>MAX_SEQUENCE_SEGMENTS||!Number.isFinite(crossfadeSec)||crossfadeSec<.1||crossfadeSec>1.5)
  throw Error('긴 반주 결합 조건(구간 2~20개, 크로스페이드 0.1~1.5초)이 올바르지 않습니다.');
 const sources=waves.map(input=>{
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  assertUsableSingingWav(bytes,{maxDurationSec:30});
  return parsePcm16(bytes);
 });
 const {rate,channels}=sources[0],fade=Math.round(rate*crossfadeSec);
 if(sources.some(s=>s.rate!==rate||s.channels!==channels||s.frames<=fade))throw Error('MusicGen 구간들의 샘플레이트·채널이 다르거나 연결에 너무 짧습니다.');
 const frames=sources.reduce((a,s)=>a+s.frames,0)-fade*(sources.length-1);
 const size=44+frames*channels*2;
 if(size>MAX_SEQUENCE_BYTES||!Number.isSafeInteger(size)||frames/rate>360)throw Error('완성 반주 길이 또는 WAV 용량이 360초/160MiB를 초과합니다.');
 const out=new Uint8Array(size),v=new DataView(out.buffer);
 let used=0;
 for(const [idx,part] of sources.entries()){
  if(idx===0){out.set(part.pcm,44);used=part.frames;continue;}
  const base=44+(used-fade)*channels*2;
  const p=new DataView(part.pcm.buffer,part.pcm.byteOffset,part.pcm.byteLength);
  for(let i=0;i<fade;i++){
   const ratio=smoothMusicGenCrossfade((i+1)/(fade+1));
   for(let ch=0;ch<channels;ch++){
    const dst=base+(i*channels+ch)*2,src=(i*channels+ch)*2;
    const before=v.getInt16(dst,true),after=p.getInt16(src,true);
    v.setInt16(dst,Math.max(-32768,Math.min(32767,Math.round(before*(1-ratio)+after*ratio))),true);
   }
  }
  out.set(part.pcm.subarray(fade*channels*2),44+used*channels*2);
  used+=part.frames-fade;
 }
 if(used!==frames)throw Error('MusicGen 완성 길이 계산 오류');
 for(const [at,word] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)out[at+i]=word.charCodeAt(i);
 v.setUint32(4,size-8,true);v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);
 v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);
 v.setUint32(40,size-44,true);
 assertUsableSingingWav(out,{maxDurationSec:360});
 return new File([out],'MYVOCAL-MusicGen-긴반주.wav',{type:'audio/wav'});
}
export async function generateMusicGenSequence(settings,{segments=4,crossfadeSec=.5,prompts=[],continuation=false,signal,onProgress=()=>{},generate=generateMusicGenAudio,session}={}){
 if(!Number.isInteger(segments)||segments<2||segments>MAX_SEQUENCE_SEGMENTS)throw Error('긴 반주는 2~20구간이어야 합니다.');
 musicGenSettingsValid(settings);
 if(typeof continuation!=='boolean')throw Error('MusicGen 연결 모드가 올바르지 않습니다.');
 if(continuation&&settings.seconds>20)throw Error('이전 음원 기반 연속 생성은 구간당 20초까지입니다.');
 if(!Number.isFinite(crossfadeSec)||crossfadeSec<.1||crossfadeSec>1.5||crossfadeSec>=settings.seconds/2)throw Error('크로스페이드는 0.1~1.5초, 구간 길이보다 충분히 짧아야 합니다.');
 if(!Number.isInteger(settings.seed)||settings.seed+segments-1>2147483647)throw Error('랜덤 시드 범위가 초과됐습니다.');
 const projectedSeconds=segments*settings.seconds-(segments-1)*crossfadeSec;
 if(projectedSeconds>360+1e-9)throw Error('긴 반주 예상 길이가 360초를 초과합니다. 구간 수나 길이를 줄이세요.');
 if(!Array.isArray(prompts)||prompts.length>MAX_SEQUENCE_SEGMENTS||prompts.some(x=>typeof x!=='string'||[...x].length>600))throw Error('구간별 음악 설명이 올바르지 않습니다.');
 const parts=[];let baseline=null;
 for(let i=0;i<segments;i++){
  if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다. 기존 프로젝트는 그대로 유지됩니다.');
  const prompt=prompts[i]?.trim()||settings.prompt;
  const next={...settings,prompt,seed:settings.seed+i};
  if(continuation&&i>0)next.audioPrompt=musicGenContinuationPrompt(parts[i-1],{seconds:Math.min(6,settings.seconds)});
  const segment=await generate(next,{session,signal});
  if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다. 기존 프로젝트는 그대로 유지됩니다.');
  if(!(segment instanceof Blob))throw Error('MusicGen이 실제 WAV를 반환하지 않았습니다.');
  const bytes=new Uint8Array(await segment.arrayBuffer());
  if(bytes.length>12*1024*1024)throw Error('MusicGen 구간 파일 용량 초과');
  assertUsableSingingWav(bytes,{maxDurationSec:30});
  const part=parsePcm16(bytes);
  if(part.frames/part.rate<=crossfadeSec)throw Error('MusicGen 구간이 연결에 너무 짧습니다.');
  if(baseline&&(part.channels!==baseline.channels||part.rate!==baseline.rate))
   throw Error('MusicGen 모델이 구간마다 다른 샘플레이트·채널 WAV를 생성했습니다. 모델 설정을 확인하세요.');
  baseline||={channels:part.channels,rate:part.rate};
  for(const previous of parts)assertFreshMusicGenPcm(part,parsePcm16(previous));
  parts.push(bytes);
  onProgress(i+1,segments);
 }
 if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다.');
 return joinMusicGenWaves(parts,{crossfadeSec});
}
