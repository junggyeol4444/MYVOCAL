// 실제 독립 악기 MusicGen WAV의 PCM을 해당 회차 MIDI와 직접 대조한다.
// 다성·배음·드럼에서 음높이 판단이 어려우므로 품질 인증이 아닌 진단 참고값이다.
const tag=(b,at)=>String.fromCharCode(...b.subarray(at,at+4));
function pcm(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 if(b.length<44||tag(b,0)!=='RIFF'||tag(b,8)!=='WAVE')throw Error('MIDI 대조에 실제 PCM WAV가 필요합니다.');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(view.getUint32(4,true)+8!==b.length)throw Error('WAV 길이가 손상됐습니다.');
 let fmt=null,data=null,p=12;
 while(p+8<=b.length){
  const len=view.getUint32(p+4,true),at=p+8;
  if(len>b.length-at)throw Error('WAV 청크 범위 오류');
  if(tag(b,p)==='fmt '){
   if(fmt||len<16)throw Error('WAV 포맷 오류');
   fmt={format:view.getUint16(at,true),channels:view.getUint16(at+2,true),
    rate:view.getUint32(at+4,true),align:view.getUint16(at+12,true),bits:view.getUint16(at+14,true)};
  }
  if(tag(b,p)==='data'){if(data)throw Error('WAV PCM 데이터 중복');data={at,len};}
  p=at+len+(len&1);
 }
 if(p!==b.length||!fmt||!data||fmt.format!==1||fmt.bits!==16||
 ![1,2].includes(fmt.channels)||fmt.rate<8000||fmt.rate>96000||
 fmt.align!==fmt.channels*2||data.len%fmt.align)throw Error('실제 16비트 PCM WAV만 대조할 수 있습니다.');
 const frames=data.len/fmt.align;
 const sample=i=>{
  const at=data.at+Math.max(0,Math.min(frames-1,i))*fmt.align;
  return (view.getInt16(at,true)+(fmt.channels===2?view.getInt16(at+2,true):0))/
   (32768*fmt.channels);
 };
 return {rate:fmt.rate,frames,sample,duration:frames/fmt.rate};
}
function rms(w,a,z){
 const start=Math.max(0,Math.floor(a*w.rate)),stop=Math.min(w.frames,Math.ceil(z*w.rate));
 if(stop<=start)return 0;
 const step=Math.max(1,Math.floor((stop-start)/4800));
 let sum=0,n=0;
 for(let i=start;i<stop;i+=step){const x=w.sample(i);sum+=x*x;n++;}
 return Math.sqrt(sum/Math.max(1,n));
}
function tone(w,mid,duration,hz){
 const n=Math.max(128,Math.min(24000,Math.floor(duration*w.rate)));
 if(w.frames<n||hz<=0||hz>=w.rate/2)return 0;
 const start=Math.max(0,Math.min(w.frames-n,Math.floor(mid*w.rate-n/2)));
 const coeff=2*Math.cos(2*Math.PI*hz/w.rate);
 let prev=0,prev2=0;
 for(let i=0;i<n;i++){
  const hann=.5-.5*Math.cos(2*Math.PI*i/Math.max(1,n-1));
  const value=w.sample(start+i)*hann+coeff*prev-prev2;
  prev2=prev;prev=value;
 }
 return Math.sqrt(Math.max(0,prev*prev+prev2*prev2-coeff*prev*prev2))/n;
}
export function analyzeNeuralMidiWavAlignment(input,midiNotes,bpm,{signal,maxNotes=96}={}){
 const w=pcm(input);
 if(!Array.isArray(midiNotes)||!Number.isFinite(bpm)||bpm<40||bpm>240||
 !Number.isInteger(maxNotes)||maxNotes<1||maxNotes>192)
  throw Error('실제 MIDI와 WAV 대조 설정이 올바르지 않습니다.');
 const valid=midiNotes.filter(n=>Number.isInteger(n?.pitch)&&n.pitch>=0&&n.pitch<=127&&
 Number.isFinite(n.startBeat)&&n.startBeat>=0&&Number.isFinite(n.length)&&n.length>0)
 .sort((a,b)=>a.startBeat-b.startBeat);
 if(!valid.length)throw Error('대조할 MIDI 음표가 없습니다.');
 const picked=valid.length<=maxNotes?valid:Array.from({length:maxNotes},
  (_,i)=>valid[Math.floor(i*(valid.length-1)/Math.max(1,maxNotes-1))]);
 const notes=[];let audibleCount=0,onsetCount=0,pitchCount=0;
 for(const n of picked){
  if(signal?.aborted)throw Error('실제 WAV 대조를 취소했습니다. 원본은 유지됩니다.');
  const sec=n.startBeat*60/bpm,length=n.length*60/bpm;
  if(sec>=w.duration||length<.08)continue;
  const center=Math.min(w.duration-.01,sec+Math.min(length*.45,.4));
  const power=rms(w,center-.07,center+.07);
  const before=rms(w,sec-.1,sec-.015),after=rms(w,sec+.015,sec+.1);
  const onset=after>.002&&after>before*1.35;
  const hz=440*Math.pow(2,(n.pitch-69)/12);
  let contrast=null;
  if(hz>=45&&hz<w.rate/4&&power>.002&&w.duration>.15){
   const span=Math.min(.3,Math.max(.1,length*.7));
   const hit=tone(w,center,span,hz);
   const left=tone(w,center,span,hz*Math.pow(2,-1/12));
   const right=tone(w,center,span,hz*Math.pow(2,1/12));
   contrast=+((hit+1e-10)/(Math.max(left,right)+1e-10)).toFixed(3);
  }
  if(power>.002)audibleCount++;
  if(onset)onsetCount++;
  if(contrast!==null&&contrast>=1.15)pitchCount++;
  notes.push({pitch:n.pitch,startBeat:n.startBeat,startSec:+sec.toFixed(3),
   rmsDbfs:power>0?+(20*Math.log10(power)).toFixed(2):-120,
   onsetEnergyRise:onset,pitchVsNeighborSemitone:contrast});
 }
 return {method:'실제 WAV PCM 시간창 RMS 및 Goertzel MIDI 주파수 대조',
  durationSec:+w.duration.toFixed(3),sampleRate:w.rate,totalMidiNotes:valid.length,
  notesInspected:notes.length,audibleCount,onsetCount,pitchCount,
  limitations:'표본 분석이며 음정·악기 격리의 합격 판정이 아닙니다. 다성음·드럼·배음에서는 주파수 근거가 부정확할 수 있습니다.',
  notes};
}
