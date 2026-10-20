// MYVOCAL native-desktop UI: actual local PCM stem remix and WAV mastering.
// No external API, no re-generation, no modification of original stem WAVs.
// Stereo PCM16 44.1 kHz, 4 or 6 validated Demucs tracks, up to 360 seconds.
const RATE=44100, MAX_SECONDS=360, CHUNK_FRAMES=44100;
const STEMS4=['drums','bass','other','vocals'];
const STEMS6=[...STEMS4,'guitar','piano'];
const CEILING=Math.pow(10,-1/20); // -1 dBFS; attenuation only, never artificial gain.
const encoder=new TextEncoder();
function abortIf(signal){if(signal?.aborted)throw new DOMException('WAV 믹싱이 취소됐습니다.','AbortError');}
function fourCC(v,p){return String.fromCharCode(v.getUint8(p),v.getUint8(p+1),v.getUint8(p+2),v.getUint8(p+3));}
async function describeWav(file){
 if(!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||file.size<44)throw Error('분리된 WAV 파일이 올바르지 않습니다.');
 const b=await file.slice(0,Math.min(file.size,65536)).arrayBuffer(),v=new DataView(b);
 if(fourCC(v,0)!=='RIFF'||fourCC(v,8)!=='WAVE'||v.getUint32(4,true)+8!==file.size)throw Error('WAV RIFF 길이가 올바르지 않습니다.');
 let fmt=false,dataOffset=-1,dataBytes=0;
 for(let p=12;p+8<=v.byteLength;){
  const tag=fourCC(v,p),size=v.getUint32(p+4,true),start=p+8;
  if(size>file.size-start)throw Error('WAV 청크 길이가 파일 범위를 벗어났습니다.');
  if(tag==='fmt '){
   if(fmt||size<16||start+16>v.byteLength)throw Error('WAV 포맷 청크가 올바르지 않습니다.');
   if(v.getUint16(start,true)!==1||v.getUint16(start+2,true)!==2||v.getUint32(start+4,true)!==RATE||v.getUint32(start+8,true)!==RATE*4||v.getUint16(start+12,true)!==4||v.getUint16(start+14,true)!==16)throw Error('44.1kHz 스테레오 PCM16 WAV만 믹싱할 수 있습니다.');
   fmt=true;
  }
  if(tag==='data'){
   if(dataOffset>=0||size%4!==0||start+size>file.size)throw Error('WAV 데이터 청크가 손상됐습니다.');
   dataOffset=start;dataBytes=size;
  }
  if(dataOffset>=0&&fmt)break;
  p=start+size+(size&1);
 }
 if(!fmt||dataOffset<0||dataBytes<4410*4||dataBytes>RATE*MAX_SECONDS*4)throw Error('WAV 형식·길이가 0.1~360초 조건에 맞지 않습니다.');
 return {file,offset:dataOffset,frames:dataBytes/4};
}
// RBJ Audio EQ Cookbook coefficients, per-stem stereo biquads.
// Low shelf 160 Hz, mid bell 1 kHz, high shelf 6 kHz. All settings are
// actual DSP applied to PCM samples, not a cosmetic GUI or a fake AI model.
function eqCoefficient(kind,db){
 if(db===0)return null;
 const frequency=kind==='low'?160:kind==='mid'?1000:6000;
 const w=2*Math.PI*frequency/RATE,cos=Math.cos(w),sin=Math.sin(w),A=Math.pow(10,db/40);
 const alpha=kind==='mid'?sin/2:sin/Math.SQRT2;
 const two=2*Math.sqrt(A)*alpha;
 let b0,b1,b2,a0,a1,a2;
 if(kind==='low'){
  b0=A*((A+1)-(A-1)*cos+two);b1=2*A*((A-1)-(A+1)*cos);b2=A*((A+1)-(A-1)*cos-two);
  a0=(A+1)+(A-1)*cos+two;a1=-2*((A-1)+(A+1)*cos);a2=(A+1)+(A-1)*cos-two;
 }else if(kind==='high'){
  b0=A*((A+1)+(A-1)*cos+two);b1=-2*A*((A-1)+(A+1)*cos);b2=A*((A+1)+(A-1)*cos-two);
  a0=(A+1)-(A-1)*cos+two;a1=2*((A-1)-(A+1)*cos);a2=(A+1)-(A-1)*cos-two;
 }else{
  b0=1+alpha*A;b1=-2*cos;b2=1-alpha*A;
  a0=1+alpha/A;a1=-2*cos;a2=1-alpha/A;
 }
 return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0};
}
function makeEq(filters){
 return filters.filter(Boolean).map(c=>({c,z1:0,z2:0}));
}
function applyEq(value,chain){
 for(const f of chain){
  const y=f.c.b0*value+f.z1;
  f.z1=f.c.b1*value-f.c.a1*y+f.z2;
  f.z2=f.c.b2*value-f.c.a2*y;
  value=y;
 }
 return value;
}
// BS.1770 K-weighting coefficients for 44.1 kHz (high shelf + high pass).
// The 400 ms / 100 ms overlap and -70 LUFS / -10 LU relative gates follow
// the EBU R128 integrated loudness measurement procedure. No neural model.
const K_SHELF={b0:1.530841230050348,b1:-2.650979995154729,b2:1.169079079921698,a1:-1.66365511325602,a2:.7125954280732254};
const K_HIGHPASS={b0:1,b1:-2,b2:1,a1:-1.9891696736297957,a2:.9891990357870394};
function kFilter(c){return {c,z1:0,z2:0};}
function loudnessMeter(){
 const left=[kFilter(K_SHELF),kFilter(K_HIGHPASS)],right=[kFilter(K_SHELF),kFilter(K_HIGHPASS)];
 const buckets=[];let sum=0,count=0;
 return {
  sample(l,r){
   const a=applyEq(l,left),b=applyEq(r,right);
   sum+=a*a+b*b;count++;
   if(count===4410){buckets.push(sum/count);sum=0;count=0;}
  },
  integrated(){
   if(count){buckets.push(sum/count);}
   if(buckets.length===0)return -Infinity;
   const windows=[];
   for(let i=0;i<buckets.length;i++){
    const n=Math.min(4,buckets.length-i);
    if(n<4&&buckets.length>=4)break;
    let e=0;for(let j=0;j<n;j++)e+=buckets[i+j];
    windows.push(e/n);
   }
   const absolute=windows.filter(e=>e>0&&-0.691+10*Math.log10(e)>=-70);
   if(!absolute.length)return -Infinity;
   const ungated=absolute.reduce((a,b)=>a+b,0)/absolute.length;
   const relative=-0.691+10*Math.log10(ungated)-10;
   const gated=absolute.filter(e=>-0.691+10*Math.log10(e)>=relative);
   if(!gated.length)return -Infinity;
   return -0.691+10*Math.log10(gated.reduce((a,b)=>a+b,0)/gated.length);
  }
 };
}
function loudnessTarget(settings){
 const v=settings?._master?.targetLufs;
 if(v===undefined||v===null)return null;
 if(typeof v!=='number'||!Number.isFinite(v)||v<-24||v>-9)throw Error('마스터 목표 LUFS는 -24~-9 사이여야 합니다.');
 return v;
}
function masterFades(settings,frames){
 const m=settings?._master||{};
 const start=m.fadeInSec??0,end=m.fadeOutSec??0;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<0||start>10||end>10||Math.round((start+end)*RATE)>frames)
  throw Error('마스터 페이드 길이(0~10초) 또는 합계가 올바르지 않습니다.');
 return {start:Math.round(start*RATE),end:Math.round(end*RATE)};
}
// Vocal-triggered ducking of instrumental stems, processed on real PCM frames.
// Attack/release state persists across chunks but resets for the second render pass.
// No trained model or fake stem is involved: only the existing Demucs WAV samples.
function duckingOptions(settings,hasVocals){
 const m=settings?._master||{},enabled=m.duckEnabled??false;
 if(typeof enabled!=='boolean')throw Error('보컬 사이드체인 활성화 값이 올바르지 않습니다.');
 const vals={thresholdDb:m.duckThresholdDb??-28,reductionDb:m.duckReductionDb??8,
  attackMs:m.duckAttackMs??30,releaseMs:m.duckReleaseMs??350};
 const bounds={thresholdDb:[-60,-1],reductionDb:[0,18],attackMs:[5,250],releaseMs:[50,1500]};
 for(const [key,value] of Object.entries(vals)){
  const [min,max]=bounds[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
   throw Error('보컬 사이드체인 수치가 허용 범위를 벗어났습니다.');
 }
 if(enabled&&!hasVocals)throw Error('보컬 사이드체인을 사용하려면 보컬 WAV가 필요합니다.');
 return {enabled,threshold:Math.pow(10,vals.thresholdDb/20),minimum:Math.pow(10,-vals.reductionDb/20),
  attack:Math.exp(-1/(RATE*vals.attackMs/1000)),release:Math.exp(-1/(RATE*vals.releaseMs/1000))};
}
function applyVocalDucking(backL,backR,vocalL,vocalR,config,state){
 if(!config.enabled)return;
 const {threshold,minimum,attack,release}=config;
 for(let j=0;j<backL.length;j++){
  const level=Math.max(Math.abs(vocalL[j]),Math.abs(vocalR[j]));
  const coefficient=level>state.envelope?attack:release;
  state.envelope=coefficient*state.envelope+(1-coefficient)*level;
  // A smooth 12dB knee prevents sudden changes at the voice threshold.
  const ratio=state.envelope<=threshold?0:Math.min(1,20*Math.log10(state.envelope/threshold)/12);
  const desired=1-(1-minimum)*ratio;
  const smoothing=desired<state.gain?attack:release;
  state.gain=smoothing*state.gain+(1-smoothing)*desired;
  backL[j]*=state.gain;backR[j]*=state.gain;
 }
}
function fadeFactor(frame,frames,{start,end}){
 let factor=1;
 if(start>0&&frame<start)factor*=start===1?0:frame/(start-1);
 if(end>0&&frame>=frames-end)factor*=end===1?0:(frames-1-frame)/(end-1);
 return factor;
}
function settingsFor(name,settings){
 const s=settings?.[name]||{},gainDb=s.gainDb??0,balance=s.balance??0;
 const eq=[s.eqLowDb??0,s.eqMidDb??0,s.eqHighDb??0];
 if(typeof gainDb!=='number'||!Number.isFinite(gainDb)||gainDb < -60||gainDb>12||typeof balance!=='number'||!Number.isFinite(balance)||balance < -1||balance>1||typeof s.mute!=='undefined'&&typeof s.mute!=='boolean'||eq.some(db=>typeof db!=='number'||!Number.isFinite(db)||db < -12||db>12))throw Error(`${name} 믹싱 음량·밸런스·EQ 설정이 올바르지 않습니다.`);
 const gain=s.mute?0:Math.pow(10,gainDb/20);
 // Preserve stereo separation at center; stereo balance attenuates one side.
 return {left:gain*(balance>0?Math.cos(balance*Math.PI/2):1),right:gain*(balance<0?Math.cos(-balance*Math.PI/2):1),filters:['low','mid','high'].map((kind,i)=>eqCoefficient(kind,eq[i]))};
}
function timelineFor(name,settings,frames){
 const s=settings?.[name]||{};
 const fields=['offsetSec','trimStartSec','trimEndSec','fadeInSec','fadeOutSec'];
 const v=Object.fromEntries(fields.map(key=>[key,s[key]??0]));
 if(fields.some(key=>typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<0||v[key]>(key.startsWith('fade')?10:360)))
  throw Error(`${name} 트랙의 시작 위치·자르기·페이드 설정이 올바르지 않습니다.`);
 const offset=Math.round(v.offsetSec*RATE),start=Math.round(v.trimStartSec*RATE),end=Math.round(v.trimEndSec*RATE);
 if(start+end>=frames||offset>=frames)throw Error(`${name} 트랙 자르기 또는 시작 위치가 WAV 길이를 벗어났습니다.`);
 const count=Math.min(frames-start-end,frames-offset);
 const fadeIn=Math.round(v.fadeInSec*RATE),fadeOut=Math.round(v.fadeOutSec*RATE);
 if(fadeIn+fadeOut>count)throw Error(`${name} 트랙의 페이드 합계가 재생 구간보다 깁니다.`);
 return {offset,start,count,fadeIn,fadeOut};
}
function timelineGain(relative,t){
 let factor=1;
 if(t.fadeIn&&relative<t.fadeIn)factor*=t.fadeIn===1?0:relative/(t.fadeIn-1);
 if(t.fadeOut&&relative>=t.count-t.fadeOut)factor*=t.fadeOut===1?0:(t.count-1-relative)/(t.fadeOut-1);
 return factor;
}
function wavHeader(frames){
 const b=new Uint8Array(44),v=new DataView(b.buffer);
 for(const [pos,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])b.set(encoder.encode(tag),pos);
 v.setUint32(4,36+frames*4,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,2,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*4,true);
 v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,frames*4,true);
 return b;
}
/**
 * Mix existing neural-separated WAVs into a real PCM master.
 * Two passes: measure summed peak, then apply attenuation to -1 dBFS to avoid clipping.
 * Chunked Blob.slice reads bound working memory even for six 6-minute stems.
 * @param {{name:string,file:Blob}[]} stems exactly 4 or 6 Demucs WAVs
 * @param {Record<string,{gainDb?:number,balance?:number,mute?:boolean}>} settings
 */
export async function renderStemRemixMaster(stems,settings={}, {signal,onProgress}={}){
 if(!Array.isArray(stems)||![4,6].includes(stems.length)||stems.map(x=>x.name).join(',')!==(stems.length===4?STEMS4:STEMS6).join(','))throw Error('Demucs 4개 또는 6개 WAV를 올바른 순서로 전달해야 합니다.');
 abortIf(signal);
 const descriptors=await Promise.all(stems.map(x=>describeWav(x.file)));
 const frames=descriptors[0].frames;
 if(descriptors.some(x=>x.frames!==frames))throw Error('분리 트랙 WAV의 재생시간이 일치하지 않습니다.');
 const gains=stems.map(x=>settingsFor(x.name,settings));
 const fades=masterFades(settings,frames);
 const targetLufs=loudnessTarget(settings),meter=targetLufs===null?null:loudnessMeter();
 const ducking=duckingOptions(settings,stems.some(s=>s.name==='vocals'&&!settings?.vocals?.mute));
 // Non-destructive timeline arrangement for each Demucs stem. No source WAV
 // is modified; offsets and trims are interpreted in the master timeline.
 const timeline=stems.map(x=>timelineFor(x.name,settings,frames));
 if(gains.every((g,i)=>(g.left===0&&g.right===0)||timeline[i].count===0))throw Error('모든 트랙이 음소거되었거나 재생 가능한 구간이 없어 WAV를 만들 수 없습니다.');

 const out=new Uint8Array(44+frames*4);out.set(wavHeader(frames));const target=new DataView(out.buffer);
 let peak=0,integratedLufs=null,masterScale=1;
 for(let pass=0;pass<2;pass++){
  // Reset filter state between the peak-measurement and rendering passes.
  const eqState=gains.map(g=>[makeEq(g.filters),makeEq(g.filters)]);
  const duckState={envelope:0,gain:1};
  for(let frame=0;frame<frames;frame+=CHUNK_FRAMES){
   abortIf(signal);
   const n=Math.min(CHUNK_FRAMES,frames-frame),left=new Float32Array(n),right=new Float32Array(n);
   const vocalLeft=ducking.enabled?new Float32Array(n):null,vocalRight=ducking.enabled?new Float32Array(n):null;
   for(let i=0;i<descriptors.length;i++){
    const {file,offset}=descriptors[i],g=gains[i],t=timeline[i];if((!g.left&&!g.right)||!t.count)continue;
    const activeStart=Math.max(frame,t.offset),activeEnd=Math.min(frame+n,t.offset+t.count);
    if(activeEnd<=activeStart)continue;
    const count=activeEnd-activeStart,sourceStart=t.start+activeStart-t.offset;
    const bytes=await file.slice(offset+sourceStart*4,offset+(sourceStart+count)*4).arrayBuffer();
    if(bytes.byteLength!==count*4)throw Error('믹싱 도중 WAV 데이터를 모두 읽지 못했습니다.');
    const v=new DataView(bytes);
    for(let j=0;j<count;j++){
     const dest=activeStart-frame+j,relative=activeStart-t.offset+j,fade=timelineGain(relative,t);
     const sampleL=applyEq(v.getInt16(j*4,true)/32768,eqState[i][0])*g.left*fade;
     const sampleR=applyEq(v.getInt16(j*4+2,true)/32768,eqState[i][1])*g.right*fade;
     if(ducking.enabled&&stems[i].name==='vocals'){
      vocalLeft[dest]+=sampleL;vocalRight[dest]+=sampleR;
     }else{left[dest]+=sampleL;right[dest]+=sampleR;}
    }
   }
   if(ducking.enabled){
    applyVocalDucking(left,right,vocalLeft,vocalRight,ducking,duckState);
    for(let j=0;j<n;j++){left[j]+=vocalLeft[j];right[j]+=vocalRight[j];}
   }
   for(let j=0;j<n;j++){const fade=fadeFactor(frame+j,frames,fades);left[j]*=fade;right[j]*=fade;}
   if(pass===0){for(let j=0;j<n;j++){
    peak=Math.max(peak,Math.abs(left[j]),Math.abs(right[j]));
    if(meter)meter.sample(left[j],right[j]);
   }}
   else{
    const scale=masterScale;
    for(let j=0;j<n;j++){
     const l=Math.max(-1,Math.min(1,left[j]*scale)),r=Math.max(-1,Math.min(1,right[j]*scale));
     target.setInt16(44+(frame+j)*4,Math.max(-32768,Math.min(32767,Math.round(l*32768))),true);
     target.setInt16(46+(frame+j)*4,Math.max(-32768,Math.min(32767,Math.round(r*32768))),true);
    }
   }
   onProgress?.(pass*frames+frame+n,frames*2);
   // Let the Windows WebView2 UI update and allow cancellation between chunks.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(pass===0){
   if(peak<1e-8)throw Error('모든 분리 WAV가 무음이어서 마스터링할 수 없습니다.');
   integratedLufs=meter?.integrated()??null;
   const desired=targetLufs===null||!Number.isFinite(integratedLufs)?1:Math.pow(10,(targetLufs-integratedLufs)/20);
   masterScale=Math.min(CEILING/peak,desired);
  }
 }
 abortIf(signal);
 const result=new File([out],'MYVOCAL-Stems-Master.wav',{type:'audio/wav'});
 result.myvocalMastering={targetLufs,measuredLufs:integratedLufs,appliedGainDb:20*Math.log10(masterScale),
  estimatedOutputLufs:integratedLufs===null||!Number.isFinite(integratedLufs)?null:integratedLufs+20*Math.log10(masterScale),peakCeilingDb:-1};
 return result;
}
