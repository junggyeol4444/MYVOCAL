// MYVOCAL 0.8: small local *sample-based* vocal preview, NOT neural training,
// speaker cloning, speech synthesis, phoneme alignment, or a production singer.
import {getFile} from './assetDb.js';
import {sampleEntries} from './voiceTraining.js';
import {genId,now} from './schema.js';

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const DEMO_NOTES=[60,62,64,67,69,67,64,60].map((pitch,i)=>({pitch,startBeat:i,length:.84,velocity:95}));

export function selectSamplerSource(voice,sampleId){
 const item=sampleEntries(voice).find(s=>s.id===sampleId);
 if(!item)throw Error('현재 목소리의 샘플을 선택해 주세요.');
 const hz=Number(item.analysis?.medianHz);
 if(!Number.isFinite(hz)||hz<75||hz>900)throw Error('음정이 측정된 샘플이 필요합니다. Voice Studio에서 다시 분석해 주세요.');
 if((item.analysis?.voicedFrames||0)<10)throw Error('유성음 구간이 부족합니다. 길게 모음을 발성한 샘플을 사용해 주세요.');
 return {item,hz};
}

// Extract an audible vowel fragment and put short fades at its boundaries.
// This is a copied sample fragment; it is not a learned voice embedding.
export function extractVoicedSegment(samples,rate,analysis){
 if(!samples?.length||!Number.isFinite(rate)||rate<8000)throw Error('유효한 원본 PCM이 아닙니다.');
 const duration=samples.length/rate;
 if(duration<.3)throw Error('음성 샘플이 너무 짧습니다.');
 const length=Math.min(duration,.52),count=Math.max(1,Math.round(length*rate));
 const points=(analysis?.points||[]).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.hz)&&p.confidence>=.72);
 const target=Number(analysis?.medianHz)||440;
 const selected=points.sort((a,b)=>Math.abs(a.hz-target)-Math.abs(b.hz-target))[0];
 const ideal=selected?selected.time:duration/2;
 const start=clamp(Math.round((ideal-.11)*rate),0,samples.length-count);
 const result=new Float32Array(count);let peak=0;
 for(let i=0;i<count;i++){let x=samples[start+i]||0;const fade=Math.min(1,i/Math.max(1,Math.round(rate*.012)),(count-i-1)/Math.max(1,Math.round(rate*.012)));x*=Math.max(0,fade);result[i]=x;peak=Math.max(peak,Math.abs(x));}
 if(peak<.012)throw Error('선택된 구간의 신호가 너무 작습니다. 긴 모음을 다시 녹음해 주세요.');
 const boost=Math.min(2,.75/peak);for(let i=0;i<count;i++)result[i]*=boost;
 return {samples:result,sampleRate:rate,duration:count/rate,sourceTime:start/rate};
}

export function pcmToWav(samples,rate){
 const count=samples.length,arr=new ArrayBuffer(44+count*2),dv=new DataView(arr);let p=0;
 const ascii=s=>{for(let i=0;i<s.length;i++)dv.setUint8(p++,s.charCodeAt(i));};
 ascii('RIFF');dv.setUint32(p,36+count*2,true);p+=4;ascii('WAVEfmt ');dv.setUint32(p,16,true);p+=4;dv.setUint16(p,1,true);p+=2;dv.setUint16(p,1,true);p+=2;dv.setUint32(p,rate,true);p+=4;dv.setUint32(p,rate*2,true);p+=4;dv.setUint16(p,2,true);p+=2;dv.setUint16(p,16,true);p+=2;ascii('data');dv.setUint32(p,count*2,true);p+=4;
 for(const v of samples){const x=clamp(v,-1,1);dv.setInt16(p,x<0?Math.round(x*32768):Math.round(x*32767),true);p+=2;}
 return new Blob([arr],{type:'audio/wav'});
}
export async function createSamplerModel(voice,sampleId,{loadFile=getFile,decode}={}){
 if(!voice||!['self','owned','licensed'].includes(voice.rights))throw Error('권한이 있는 목소리만 사용할 수 있습니다.');
 const {item,hz}=selectSamplerSource(voice,sampleId);
 const file=await loadFile(sampleId);if(!file?.size)throw Error('원본 녹음이 로컬에 없습니다.');
 let buffer;
 if(decode)buffer=await decode(file);
 else {
  const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw Error('오디오 디코더를 사용할 수 없습니다.');
  const ctx=new C();try{buffer=await ctx.decodeAudioData(await file.arrayBuffer());}finally{await ctx.close().catch(()=>{});}
 }
 const channel=buffer.getChannelData(0),mono=new Float32Array(channel.length);
 for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<mono.length;i++)mono[i]+=data[i]/buffer.numberOfChannels;}
 const fragment=extractVoicedSegment(mono,buffer.sampleRate,item.analysis);
 const wav=pcmToWav(fragment.samples,fragment.sampleRate);
 const assetId=genId('sampler_asset');
 const record={id:genId('model'),voiceId:voice.id,name:`${voice.name} · 로컬 샘플 ${new Date().toLocaleDateString('ko-KR')}.wav`,engineId:'sampler',assetId,bytes:wav.size,sourceSampleId:sampleId,sourcePromptId:item.capturePromptId||'',sourceHz:hz,segmentSec:+fragment.duration.toFixed(2),createdAt:now(),status:'sample-preview-ready',singingCompatible:false,notice:'로컬 녹음 조각으로 음높이를 변경하는 샘플 기반 합성입니다. AI 보컬 학습이나 가사 발음 합성이 아닙니다.'};
 return {record,file:wav};
}
export function normalizeSingingNotes(notes){
 if(!Array.isArray(notes))throw Error('음표 배열이 없습니다.');
 return notes.filter(n=>n&&Number.isFinite(+n.pitch)&&Number.isFinite(+n.startBeat)&&Number.isFinite(+n.length)&&+n.length>0)
  .slice(0,128).map(n=>({pitch:clamp(Math.round(+n.pitch),36,96),startBeat:clamp(+n.startBeat,0,256),length:clamp(+n.length,.12,8),velocity:clamp(+n.velocity||92,1,127)}));
}
export function projectPreviewNotes(project){
 if(!project)return [];
 const vocal=(project.tracks||[]).find(t=>/vocal/i.test(t.type||'')||(t.name||'').toLowerCase().includes('vocal'));
 const primary=(vocal?.midiNotes||[]).length?vocal:(project.tracks||[]).find(t=>t.instrument!=='drums'&&t.midiNotes?.length);
 return normalizeSingingNotes(primary?.midiNotes||[]);
}
export async function renderSamplerPreview(model,notes,bpm=120,{loadFile=getFile,contextFactory}={}){
 if(model?.engineId!=='sampler'||model?.status!=='sample-preview-ready'||!model.assetId)throw Error('로컬 샘플러 모델을 선택해야 합니다.');
 if(!Number.isFinite(+model.sourceHz)||+model.sourceHz<75||+model.sourceHz>900)throw Error('원본 기준 피치가 잘못되었습니다.');
 const melodic=normalizeSingingNotes(notes);if(!melodic.length)throw Error('미리보기 음표가 없습니다.');
 if(!Number.isFinite(+bpm)||+bpm<40||+bpm>240)throw Error('BPM은 40~240만 지원합니다.');
 const secondsPerBeat=60/+bpm;
 const end=Math.max(...melodic.map(n=>(n.startBeat+n.length)*secondsPerBeat))+.2;
 if(end>90)throw Error('샘플 보컬 미리보기는 최대 90초입니다.');
 const wav=await loadFile(model.assetId);if(!wav?.size)throw Error('보컬 샘플 원본을 찾을 수 없습니다.');
 const C=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!C&&!contextFactory)throw Error('오디오 합성을 지원하지 않습니다.');
 let decoded;
 if(contextFactory){const helper=await contextFactory('decode');decoded=await helper.decodeAudioData(await wav.arrayBuffer());await helper.close?.();}
 else {const ctx=new C();try{decoded=await ctx.decodeAudioData(await wav.arrayBuffer());}finally{await ctx.close().catch(()=>{});}}
 const O=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!O&&!contextFactory)throw Error('오프라인 WAV 출력이 지원되지 않습니다.');
 const rate=44100,offline=contextFactory?await contextFactory('offline',1,Math.ceil(end*rate),rate):new O(1,Math.ceil(end*rate),rate);
 for(const note of melodic){
  const start=note.startBeat*secondsPerBeat,duration=note.length*secondsPerBeat;
  const src=offline.createBufferSource(),gain=offline.createGain();src.buffer=decoded;src.loop=true;
  // Playback-rate pitch shifting also changes vowel formants, so this is a rough sketch only.
  src.playbackRate.value=clamp((440*Math.pow(2,(note.pitch-69)/12))/model.sourceHz,.28,4);
  const amp=.44*(note.velocity/127),attack=Math.min(.035,duration*.3),release=Math.min(.085,duration*.28);
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(amp,start+attack);
  gain.gain.setValueAtTime(amp,Math.max(start+attack,start+duration-release));
  gain.gain.linearRampToValueAtTime(0,start+duration);
  src.connect(gain);gain.connect(offline.destination);src.start(start);src.stop(start+duration+.002);
 }
 const output=await offline.startRendering();return pcmToWav(output.getChannelData(0),rate);
}
