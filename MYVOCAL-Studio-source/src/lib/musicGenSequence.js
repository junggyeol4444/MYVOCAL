// Local MusicGen sequence assembler. Each source is a REAL MusicGen inference
// WAV; this is PCM overlap/crossfade, NOT neural continuation or full-song AI.
import {generateMusicGenAudio,musicGenSettingsValid} from './musicGenClient.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
export const MAX_SEQUENCE_SEGMENTS=8;
export const MAX_SEQUENCE_BYTES=64*1024*1024;
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
  throw Error('긴 반주 결합 조건(구간 2~8개, 크로스페이드 0.1~1.5초)이 올바르지 않습니다.');
 const sources=waves.map(input=>{
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  assertUsableSingingWav(bytes,{maxDurationSec:30});
  return parsePcm16(bytes);
 });
 const {rate,channels}=sources[0],fade=Math.round(rate*crossfadeSec);
 if(sources.some(s=>s.rate!==rate||s.channels!==channels||s.frames<=fade))throw Error('MusicGen 구간들의 샘플레이트·채널이 다르거나 연결에 너무 짧습니다.');
 const frames=sources.reduce((a,s)=>a+s.frames,0)-fade*(sources.length-1);
 const size=44+frames*channels*2;
 if(size>MAX_SEQUENCE_BYTES||!Number.isSafeInteger(size)||frames/rate>240)throw Error('완성 반주 길이 또는 WAV 용량이 240초/64MiB를 초과합니다.');
 const out=new Uint8Array(size),v=new DataView(out.buffer);
 let used=0;
 for(const [idx,part] of sources.entries()){
  if(idx===0){out.set(part.pcm,44);used=part.frames;continue;}
  const base=44+(used-fade)*channels*2;
  const p=new DataView(part.pcm.buffer,part.pcm.byteOffset,part.pcm.byteLength);
  for(let i=0;i<fade;i++){
   const ratio=(i+1)/(fade+1);
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
 assertUsableSingingWav(out,{maxDurationSec:240});
 return new File([out],'MYVOCAL-MusicGen-긴반주.wav',{type:'audio/wav'});
}
export async function generateMusicGenSequence(settings,{segments=4,crossfadeSec=.5,prompts=[],signal,onProgress=()=>{},generate=generateMusicGenAudio,session}={}){
 if(!Number.isInteger(segments)||segments<2||segments>MAX_SEQUENCE_SEGMENTS)throw Error('긴 반주는 2~8구간이어야 합니다.');
 musicGenSettingsValid(settings);
 if(!Number.isInteger(settings.seed)||settings.seed+segments-1>2147483647)throw Error('랜덤 시드 범위가 초과됐습니다.');
 if(!Array.isArray(prompts)||prompts.length>MAX_SEQUENCE_SEGMENTS||prompts.some(x=>typeof x!=='string'||[...x].length>600))throw Error('구간별 음악 설명이 올바르지 않습니다.');
 const parts=[];
 for(let i=0;i<segments;i++){
  if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다. 기존 프로젝트는 그대로 유지됩니다.');
  const prompt=prompts[i]?.trim()||settings.prompt;
  const segment=await generate({...settings,prompt,seed:settings.seed+i},{session,signal});
  if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다. 기존 프로젝트는 그대로 유지됩니다.');
  if(!(segment instanceof Blob))throw Error('MusicGen이 실제 WAV를 반환하지 않았습니다.');
  const bytes=new Uint8Array(await segment.arrayBuffer());
  if(bytes.length>12*1024*1024)throw Error('MusicGen 구간 파일 용량 초과');
  parts.push(bytes);
  onProgress(i+1,segments);
 }
 if(signal?.aborted)throw Error('긴 반주 생성이 취소됐습니다.');
 return joinMusicGenWaves(parts,{crossfadeSec});
}
