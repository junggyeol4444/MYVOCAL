// A compatible user-run singing engine still renders each <=80 second chunk.
// The received PCM WAV chunks are joined at their REAL absolute score times.
// Nothing here trains a model or converts a demo engine into neural singing.
import {buildSingingRequest} from './singingBridge.js';
import {phonemeSourceKey,validatePhonemePlan} from './phonemePlan.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {smoothSingingPcm16ChunkEdges} from './singingChunkSeam.js';

const MAX_SECONDS=360;
const MAX_CUES=2048;
// 48kHz 16bit stereo, 360 seconds requires 69,120,044 bytes.
const MAX_WAV_BYTES=90*1024*1024;
const rd=(value)=>Math.round(value*1000)/1000;
export function planLongSingingChunks(alignment,{maxSeconds=80,maxCues=128}={}){
 const cues=alignment?.cues;
 if(!Array.isArray(cues)||!cues.length||cues.length>MAX_CUES)throw Error('긴 곡 가창 음표는 최대 2048개입니다.');
 if(!Number.isFinite(alignment.bpm)||alignment.bpm<40||alignment.bpm>240||
 !Number.isFinite(maxSeconds)||maxSeconds<1||maxSeconds>85||!Number.isInteger(maxCues)||maxCues<1||maxCues>128)
   throw Error('가창 분할 설정이 올바르지 않습니다.');
 const chunks=[];
 let lastEnd=0,current=null;
 for(let i=0;i<cues.length;i++){
  const cue=cues[i];
  if(!cue||typeof cue.lyric!=='string'||!Number.isFinite(cue.startSec)||!Number.isFinite(cue.endSec)||
  cue.startSec<0||cue.endSec<=cue.startSec||cue.endSec>MAX_SECONDS||cue.startSec<lastEnd-.001||
  !Number.isFinite(cue.pitch)||cue.pitch<36||cue.pitch>96||
  !Number.isFinite(cue.velocity)||cue.velocity<0||cue.velocity>127)throw Error('긴 곡 MIDI의 시간·음표·가사 데이터가 올바르지 않습니다.');
  // Each individual score note must fit in the legacy V1 85 second window.
  if(cue.endSec-cue.startSec>maxSeconds)throw Error('80초보다 긴 단일 음표는 분리할 수 없습니다.');
  if(!current||current.cues.length>=maxCues||cue.endSec-current.startSec>maxSeconds){
   // First request keeps its initial leading silence, later requests rebase.
   const startSec=chunks.length===0?0:cue.startSec;
   current={startSec,cues:[],firstCueIndex:i};
   chunks.push(current);
  }
  current.cues.push({...cue,startSec:rd(cue.startSec-current.startSec),endSec:rd(cue.endSec-current.startSec)});
  lastEnd=cue.endSec;
 }
 return {durationSec:lastEnd,chunks,notes:cues.length};
}
function extractPCM(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let offset=12,format=null,data=null;
 while(offset+8<=bytes.length){
  const name=String.fromCharCode(...bytes.subarray(offset,offset+4)),size=d.getUint32(offset+4,true);
  const at=offset+8;
  if(size>bytes.length-at)throw Error('보컬 WAV가 손상됐습니다.');
  if(name==='fmt '){if(format)throw Error('중복 WAV 포맷');
   format={codec:d.getUint16(at,true),channels:d.getUint16(at+2,true),rate:d.getUint32(at+4,true),byteRate:d.getUint32(at+8,true),align:d.getUint16(at+12,true),bits:d.getUint16(at+14,true)};
  }
  if(name==='data'){if(data)throw Error('중복 WAV 데이터');data=bytes.subarray(at,at+size);}
  offset=at+size+(size&1);
 }
 if(!format||!data||offset!==bytes.length)throw Error('WAV 포맷 또는 데이터가 없습니다.');
 return {format,data};
}
export function combineSingingWavChunks(parts,durationSec){
 if(!Array.isArray(parts)||!parts.length||!Number.isFinite(durationSec)||durationSec<=0||durationSec>MAX_SECONDS)
  throw Error('가창 합치기 정보가 잘못됐습니다.');
 let format=null,output=null,frames=0,lastLimit=0;
 for(const [partIndex,part] of parts.entries()){
  const info=assertUsableSingingWav(part.bytes);
  const decoded=extractPCM(part.bytes);
  if(!format){format=decoded.format;
   frames=Math.ceil(durationSec*format.rate);
   const size=44+frames*format.align;
   if(!Number.isSafeInteger(size)||size>MAX_WAV_BYTES)throw Error('완성 보컬 WAV가 90MiB를 초과했습니다.');
   output=new Uint8Array(size);
  }else if(Object.keys(format).some(k=>format[k]!==decoded.format[k]))throw Error('엔진이 분할 요청마다 서로 다른 WAV 포맷을 반환했습니다.');
  if(!Number.isFinite(part.startSec)||part.startSec<0||part.startSec>=durationSec)throw Error('분할 WAV의 시작 시간이 올바르지 않습니다.');
  const from=Math.round(part.startSec*format.rate);
  const next=part.limitSec==null?frames:Math.round(part.limitSec*format.rate);
  if(from<lastLimit)throw Error('가창 분할 WAV 구간이 겹치거나 순서가 바뀌었습니다.');
  if(next<=from||next>frames)throw Error('분할 WAV의 구간이 겹치거나 잘못됐습니다.');
  const maxFrames=Math.min(info.frames,next-from,frames-from);
  const required=part.requiredDurationSec??0;
  if(info.durationSec+0.025<required)throw Error('엔진 WAV가 입력 MIDI 음표보다 짧게 생성됐습니다.');
  output.set(decoded.data.subarray(0,maxFrames*format.align),44+from*format.align);
  if(format.codec===1&&format.bits===16)
   smoothSingingPcm16ChunkEdges(output,{startFrame:from,frames:maxFrames,
    sampleRate:format.rate,channels:format.channels,
    fadeIn:partIndex>0,fadeOut:partIndex<parts.length-1});
  lastLimit=next;
 }
 const view=new DataView(output.buffer);
 for(const [at,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let j=0;j<4;j++)output[at+j]=s.charCodeAt(j);
 view.setUint32(4,output.byteLength-8,true);view.setUint32(16,16,true);
 view.setUint16(20,format.codec,true);view.setUint16(22,format.channels,true);
 view.setUint32(24,format.rate,true);view.setUint32(28,format.byteRate,true);
 view.setUint16(32,format.align,true);view.setUint16(34,format.bits,true);
 view.setUint32(40,output.byteLength-44,true);
 assertUsableSingingWav(output,{maxDurationSec:MAX_SECONDS});
 return new Blob([output],{type:'audio/wav'});
}
export async function renderLongSinging(alignment,{port,project,voice,model,request,signal,phonemePlan=null,onProgress=()=>{}}={}){
 if(typeof request!=='function')throw Error('실제 로컬 가창 엔진 호출 기능이 필요합니다.');
 const plan=planLongSingingChunks(alignment);
 // 원본 3~6분 신경망 MIDI 전체 곡 길이를 유지한다. 마지막 음표 이후는 무음이며 가짜 보컬을 생성하지 않는다.
 const scoreDuration=Number(project?.neuralAutoScore?.durationSec);
 if(Number.isFinite(scoreDuration)&&scoreDuration>0&&scoreDuration+0.02<plan.durationSec)
  throw Error('현재 한국어 MIDI 음표가 신경망 원곡 길이를 벗어났습니다.');
 const totalDuration=Number.isFinite(scoreDuration)&&scoreDuration>=plan.durationSec&&scoreDuration<=MAX_SECONDS?
  scoreDuration:plan.durationSec;
 if(phonemePlan)validatePhonemePlan(phonemePlan,alignment);
 const parts=[];
 for(let i=0;i<plan.chunks.length;i++){
  if(signal?.aborted)throw Error('보컬 생성이 취소됐습니다. 기존 자료는 보존합니다.');
  const chunk=plan.chunks[i];
  const chunkAlignment={...alignment,longForm:false,cues:chunk.cues};
  let chunkPhonemes=null;
  if(phonemePlan){
   const selected=phonemePlan.segments.filter(s=>s.cueIndex>=chunk.firstCueIndex+1&&s.cueIndex<=chunk.firstCueIndex+chunk.cues.length)
    .map(s=>({...s,cueIndex:s.cueIndex-chunk.firstCueIndex,startSec:Math.round((s.startSec-chunk.startSec)*10000)/10000,endSec:Math.round((s.endSec-chunk.startSec)*10000)/10000}));
   if(selected.length>512)throw Error('분할 요청의 한국어 음소 힌트는 512개를 초과할 수 없습니다.');
   if(selected.length)chunkPhonemes={...phonemePlan,sourceKey:phonemeSourceKey(chunkAlignment),segments:selected};
  }
  const req=buildSingingRequest(port,project,chunkAlignment,voice,model,chunkPhonemes);
  const blob=await request(req);
  if(!(blob instanceof Blob))throw Error('외부 엔진이 WAV 파일을 반환하지 않았습니다.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const requiredDurationSec=Math.max(...chunk.cues.map(c=>c.endSec));
  parts.push({startSec:chunk.startSec,limitSec:plan.chunks[i+1]?.startSec??totalDuration,
   requiredDurationSec,bytes});
  onProgress(i+1,plan.chunks.length);
 }
 if(signal?.aborted)throw Error('보컬 생성이 취소됐습니다. 기존 자료는 보존합니다.');
 const wav=combineSingingWavChunks(parts,totalDuration);
 return {wav,notes:plan.notes,parts:parts.length,durationSec:totalDuration,kind:'external-singing-chunks'};
}