// 원본 46·47항: 실제 독립 MusicGen 악기 WAV의 PCM 에너지로 2D/VRM 연주를 구동.
// 기존 음원, MIDI, 프로젝트, 사용자 모델을 변경하지 않는다.
export const STEM_TO_BAND=Object.freeze({melody:'synth',chords:'piano',bass:'bass',drums:'drums',guitar:'guitar',pad:'strings'});
const fail=message=>{throw Error(message);};
const tag=(bytes,i)=>String.fromCharCode(...bytes.subarray(i,i+4));
export function analyzeStemPerformanceWav(input,{hopMs=100}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(!Number.isInteger(hopMs)||hopMs<40||hopMs>200)fail('PCM 동작 분석 간격은 40~200ms여야 합니다.');
 if(bytes.length<44||bytes.length>90*1024*1024||tag(bytes,0)!=='RIFF'||tag(bytes,8)!=='WAVE')
  fail('90MB 이하의 실제 악기 WAV가 필요합니다.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(4,true)+8!==bytes.length)fail('악기 WAV 컨테이너 길이가 다릅니다.');
 let off=12,fmt=null,data=null;
 while(off+8<=bytes.length){
  const name=tag(bytes,off),size=v.getUint32(off+4,true),at=off+8;
  if(size>bytes.length-at)fail('악기 WAV 청크 손상');
  if(name==='fmt '){
   if(fmt||size<16)fail('악기 WAV 형식 청크 오류');
   fmt={codec:v.getUint16(at,true),channels:v.getUint16(at+2,true),
    rate:v.getUint32(at+4,true),block:v.getUint16(at+12,true),bits:v.getUint16(at+14,true)};
  }
  if(name==='data'){
   if(data)fail('악기 WAV 데이터 청크 중복');
   data={at,size};
  }
  off=at+size+(size&1);
 }
 if(!fmt||!data||off!==bytes.length||fmt.codec!==1||fmt.bits!==16||
  ![1,2].includes(fmt.channels)||fmt.block!==fmt.channels*2||
  fmt.rate<8000||fmt.rate>96000||!data.size||data.size%fmt.block)
  fail('실제 16비트 PCM WAV(모노/스테레오)만 지원합니다.');
 const frames=data.size/fmt.block,durationMs=Math.round(frames*1000/fmt.rate);
 if(durationMs<1000||durationMs>360200)fail('악기 WAV 길이가 6분을 초과합니다.');
 const hop=Math.max(1,Math.round(fmt.rate*hopMs/1000));
 const step=Math.max(1,Math.floor(fmt.rate/800)),rms=[];
 for(let start=0;start<frames;start+=hop){
  let sum=0,count=0;
  for(let i=start;i<Math.min(frames,start+hop);i+=step){
   let power=0;
   for(let ch=0;ch<fmt.channels;ch++){
    const sample=v.getInt16(data.at+i*fmt.block+ch*2,true)/32768;
    power+=sample*sample;
   }
   sum+=power/fmt.channels;count++;
  }
  rms.push(count?Math.sqrt(sum/count):0);
 }
 const ordered=[...rms].sort((a,b)=>a-b);
 const reference=ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))]||0;
 const gate=Math.max(.0007,reference*.035);
 const levels=rms.map(value=>value<gate?0:Math.min(1,value/Math.max(.001,reference)));
 return {version:1,hopMs,durationMs,levels,referenceRms:reference,source:'real-neural-stem-pcm'};
}
export function stemPerformanceLevel(envelope,ms){
 if(envelope?.version!==1||!Array.isArray(envelope.levels)||!Number.isInteger(envelope.hopMs)||
  envelope.hopMs<40||envelope.hopMs>200||!Number.isFinite(ms)||ms<0||ms>=envelope.durationMs)return 0;
 const pos=ms/envelope.hopMs,i=Math.floor(pos),weight=pos-i;
 const a=Number(envelope.levels[i]||0),b=Number(envelope.levels[Math.min(i+1,envelope.levels.length-1)]||0);
 return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.min(1,a*(1-weight)+b*weight)):0;
}
export async function loadNeuralStemPerformance(project,{
 loadFile,current=()=>project,signal,onProgress=()=>{},durationSec=0
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||typeof loadFile!=='function'||
  !Number.isFinite(durationSec)||durationSec<150||durationSec>360)
  fail('3~6분 음악 프로젝트와 로컬 독립 악기 WAV가 필요합니다.');
 const tracks=new Map();
 for(const track of project.tracks)if(track?.generatedBy==='musicgen-independent-audio'&&
  Object.hasOwn(STEM_TO_BAND,track.sourceRole))tracks.set(track.sourceRole,track);
 if(!tracks.size)fail('독립 신경망 악기 WAV를 먼저 생성해 주세요.');
 const fresh=()=>{if(signal?.aborted||current()!==project)
  fail('프로젝트가 변경되거나 PCM 분석이 취소됐습니다. 원본은 유지됩니다.');};
 const result=new Map();
 for(const [sourceRole,role] of Object.entries(STEM_TO_BAND)){
  const track=tracks.get(sourceRole);if(!track)continue;fresh();
  const clip=track.clips?.[0];
  if(track.clips?.length!==1||!clip?.assetId||clip.startBar!==1||
   Number(clip.sourceOffsetSec||0)!==0)fail(sourceRole+' 원곡 시작 WAV 클립 오류');
  const file=await loadFile(clip.assetId);fresh();
  if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)
   fail(sourceRole+' 원본 WAV 자산이 없습니다.');
  const envelope=analyzeStemPerformanceWav(await file.arrayBuffer());fresh();
  if(envelope.durationMs+200<durationSec*1000)fail(sourceRole+' WAV가 전곡 공연보다 짧습니다.');
  result.set(role,{...envelope,role,sourceRole,sourceAssetId:clip.assetId,trackId:track.id});
  onProgress('실제 '+sourceRole+' PCM 연주 분석 완료 ('+result.size+'/'+tracks.size+')');
 }
 fresh();return result;
}
export function attachNeuralStemPerformance(base,project,envelope,{durationSec,startSec=0}={}){
 const durationMs=Math.round(durationSec*1000);
 if(!project?.id||!envelope||!Number.isFinite(startSec)||startSec<0||
  !Number.isFinite(durationSec)||durationSec<150||durationSec>360||
  envelope.durationMs+200<durationMs)fail('악기 PCM 공연 시간축 오류');
 const plan=base||{version:1,projectId:project.id,durationMs,source:'manual',
  referenceAssetId:'',frames:[],instruments:[]};
 if(plan.projectId!==project.id||plan.durationMs!==durationMs)
  fail('PCM 악기와 기존 MIDI 공연이 서로 다른 프로젝트입니다.');
 return {...plan,pcmEnergy:envelope,pcmOffsetMs:Math.round(startSec*1000)};
}
