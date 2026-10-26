// MYVOCAL original item #8: real local PCM beat and rough tonal-center
// estimation from owner-authorized music. This is bounded DSP, NOT model
// training, score/transcription, genre detection, or copyable melody.
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fixed=(n,d=3)=>Number(n.toFixed(d));
const stdCorrelation=(a,b)=>{
 const n=a.length,ma=a.reduce((s,v)=>s+v,0)/n,
  mb=b.reduce((s,v)=>s+v,0)/n;
 let xy=0,xx=0,yy=0;
 for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y;}
 return xx>1e-12&&yy>1e-12?xy/Math.sqrt(xx*yy):0;
};
const abortCheck=signal=>{
 if(signal?.aborted)throw Error('본인 음악 BPM·Key 신호 분석 취소 · 원곡 PCM 보존');
};
export function estimateOwnedMusicTempo8(pcm,rate,{signal}={}){
 if(!(pcm instanceof Float32Array)||!Number.isInteger(rate)||rate<8000||rate>48000||
  pcm.length<rate*8||pcm.length>rate*360)
  throw Error('8~360초 실제 원곡 PCM과 8~48kHz 단일 채널이 필요합니다.');
 const hop=Math.round(rate*.02),count=Math.floor(pcm.length/hop);
 const rms=new Float32Array(count),novelty=new Float64Array(count);
 for(let i=0;i<count;i++){
  let power=0;
  const from=i*hop,to=Math.min(pcm.length,from+hop);
  for(let j=from;j<to;j++){const v=pcm[j];if(!Number.isFinite(v))throw Error('오디오 PCM NaN/Inf');power+=v*v;}
  rms[i]=Math.sqrt(power/(to-from));
  if(i%300===0)abortCheck(signal);
 }
 // Positive RMS attacks remove stationary sustained sound and silence.
 let running=0,mean=0,onsets=0;
 for(let i=0;i<count;i++){
  running=.93*running+.07*rms[i];
  const attack=Math.max(0,rms[i]-running);
  novelty[i]=attack;
  mean+=attack;
 }
 mean/=count;
 for(let i=0;i<count;i++){
  if(novelty[i]>mean*2.25&&novelty[i]>.003)onsets++;
  novelty[i]=Math.max(0,novelty[i]-mean*.55);
 }
 if(onsets<Math.max(12,pcm.length/rate/7)||mean<.0002)
  return {estimatedBpm:null,confidence:0,beatsPerSecond:null,source:'actual-pcm-onset-autocorrelation',note:'뚜렷한 비트가 부족해 템포 판단 보류'};
 let best=null,second=0;
 const lags=[];
 for(let lag=13;lag<=75;lag++){
  let corr=0,p1=0,p2=0;
  for(let i=lag;i<count;i++){
   const x=novelty[i],y=novelty[i-lag];
   corr+=x*y;p1+=x*x;p2+=y*y;
  }
  const v=p1>0&&p2>0?corr/Math.sqrt(p1*p2):0;
  lags.push({lag,v});
  if(!best||v>best.v)best={lag,v};
 }
 for(const x of lags)if(Math.abs(x.lag-best.lag)>2)second=Math.max(second,x.v);
 const tempo=60/(best.lag*.02);
 // Half/double-time are inherently ambiguous; do not pretend confidence.
 const confidence=clamp((best.v-.08)/.35,0,1);
 if(best.v<.18||confidence<.2)
  return {estimatedBpm:null,confidence:fixed(confidence),beatsPerSecond:null,
   source:'actual-pcm-onset-autocorrelation',note:'박자 규칙성이 약해 자동 추정 보류'};
 return {estimatedBpm:Math.round(tempo),confidence:fixed(confidence),
  beatsPerSecond:fixed(tempo/60),secondBestCorrelation:fixed(second),
  source:'actual-pcm-onset-autocorrelation',
  note:'오디오 리듬 반복에서 추정. 하프타임/더블타임 가능성이 있으며 원본 실제 BPM 확정 아님'};
}
// Coarse chroma energy from windowed Goertzel magnitudes. Save only twelve
// averaged pitch classes and a weak tonal hypothesis; NO melody/onsets/MIDI.
export function estimateOwnedMusicTonal8(pcm,rate,{signal}={}){
 if(!(pcm instanceof Float32Array)||rate!==16000||
    pcm.length<rate*8||pcm.length>rate*360)
  throw Error('8~360초 실제 16kHz 본인 음악 PCM이 필요합니다.');
 const size=4096,hop=rate*2,window=new Float64Array(size);
 for(let i=0;i<size;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(size-1));
 const pairs=[];
 // C3..B5: actual frequency bins. Skip bass subharmonic ambiguity.
 for(let midi=48;midi<=83;midi++){
  const freq=440*Math.pow(2,(midi-69)/12),omega=2*Math.PI*freq/rate;
  pairs.push({pitch:midi%12,coef:2*Math.cos(omega),freq});
 }
 const chroma=new Float64Array(12),sampleCount=Math.floor((pcm.length-size)/hop)+1;
 let used=0;
 for(let k=0;k<sampleCount;k++){
  abortCheck(signal);
  const offset=k*hop;
  let energy=0;
  for(let n=0;n<size;n++){const x=pcm[offset+n];if(!Number.isFinite(x))throw Error('오디오 PCM 비정상 샘플');energy+=x*x;}
  if(energy/size<.00002)continue;
  const pitches=new Float64Array(12);
  for(const item of pairs){
   let q1=0,q2=0;
   for(let n=0;n<size;n++){
    const q0=pcm[offset+n]*window[n]+item.coef*q1-q2;
    q2=q1;q1=q0;
   }
   const raw=Math.max(0,q1*q1+q2*q2-item.coef*q1*q2);
   const weight=Math.sqrt(raw)/(1+item.freq/1300);
   pitches[item.pitch]+=weight;
  }
  const total=pitches.reduce((a,b)=>a+b,0);
  if(total<1e-9)continue;
  // Per-window normalize so mastering loudness doesn't bias one section.
  for(let i=0;i<12;i++)chroma[i]+=pitches[i]/total;
  used++;
 }
 if(used<4)return {estimatedKey:null,confidence:0,chroma12:null,
  source:'actual-pcm-goertzel-chroma',note:'조성 판별에 유효한 유음 구간 부족'};
 const values=Array.from(chroma,n=>n/used);
 const min=Math.min(...values),max=Math.max(...values),flatness=(max-min);
 const ranked=[];
 for(let root=0;root<12;root++)for(const [mode,template]of [['Major',MAJOR],['Minor',MINOR]]){
  const rotated=Array.from({length:12},(_,i)=>template[(i-root+12)%12]);
  ranked.push({root,mode,fit:stdCorrelation(values,rotated)});
 }
 ranked.sort((a,b)=>b.fit-a.fit);
 const best=ranked[0],runner=ranked[1];
 // Threshold conservatively: complex mixes and chromatic songs are ambiguous.
 const margin=best.fit-runner.fit;
 const confident=flatness>.008&&best.fit>.56&&margin>.045;
 const score=clamp((best.fit-.48)/.35,0,1)*clamp(margin/.12,0,1);
 return {estimatedKey:confident?NOTES[best.root]+' '+best.mode:null,
  confidence:fixed(score),
  chroma12:values.map(v=>fixed(v,5)),frequencyRange:'C3..B5',
  source:'actual-pcm-goertzel-chroma',
  note:confident?'실제 주파수 에너지로 추정한 조성 후보 · 전조/악기 배음/화성 때문에 틀릴 수 있음':
   '조성 후보 간 점수가 비슷하여 확정하지 않음 · 화성/멜로디 복제 없음'};
}
export function analyzeOwnedMusicTempoTonal8(pcm,rate,options={}){
 const tempo=estimateOwnedMusicTempo8(pcm,rate,options);
 options.onProgress?.('실제 PCM의 비트 반복·템포 추정 완료 · 주파수별 조성 후보 분석 중');
 const tonal=estimateOwnedMusicTonal8(pcm,rate,options);
 return {version:1,source:'actual-owner-authorized-pcm-dsp',
  rhythm:tempo,tonality:tonal,
  inferredChordProgression:false,inferredGenre:false,
  copiedMelody:false,neuralTraining:false};
}
export function suggestOwnedMusicTempoKey8(profile){
 const features=profile?.audioFeatures8;
 if(features?.version!==1||features.source!=='actual-owner-authorized-pcm-dsp')
  return null;
 const bpm=features.rhythm?.estimatedBpm,key=features.tonality?.estimatedKey;
 return {bpm:Number.isInteger(bpm)&&bpm>=40&&bpm<=240&&features.rhythm.confidence>=.28?bpm:null,
  key:NOTES.some(n=>key===n+' Major'||key===n+' Minor')&&features.tonality.confidence>=.28?key:null,
  source:'actual-owned-music-pcm-estimate-not-ground-truth'};
}
