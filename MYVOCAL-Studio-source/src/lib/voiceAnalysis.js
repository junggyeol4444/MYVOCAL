// MYVOCAL v0.5 voice sample analyzer. Signal measurements only: no speaker identity,
// phoneme recognition, pitch correction, training or synthetic singing.
const MIN_HZ=75,MAX_HZ=900;
export function hzToNote(hz){
 if(!Number.isFinite(hz)||hz<=0)return '—';
 const midi=Math.round(69+12*Math.log2(hz/440));
 return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi%12)+12)%12]+(Math.floor(midi/12)-1);
}
export function findPitch(frame, rate){
 if(!frame||frame.length<256||!rate)return null;
 const n=frame.length;let mean=0,power=0;
 for(let i=0;i<n;i++)mean+=frame[i];mean/=n;
 const wave=new Float32Array(n);
 for(let i=0;i<n;i++){const x=(frame[i]-mean)*(0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));wave[i]=x;power+=x*x;}
 const rms=Math.sqrt(power/n);if(rms<0.006)return null;
 const minLag=Math.max(2,Math.floor(rate/MAX_HZ)),maxLag=Math.min(Math.floor(rate/MIN_HZ),Math.floor(n/3));
 const scores=[];let best=0;
 for(let lag=minLag;lag<=maxLag;lag++){
  let ab=0,aa=0,bb=0;
  // Use the same comparison window across lags to avoid biased high lags.
  for(let i=0;i<n-maxLag;i++) {const a=wave[i],b=wave[i+lag];ab+=a*b;aa+=a*a;bb+=b*b;}
  const val=ab/Math.sqrt(Math.max(aa*bb,1e-16));scores[lag]=val;
  if(val>best)best=val;
 }
 if(best<0.72)return null;
 // Prefer the earliest peak near the maximum rather than its octave harmonic.
 let selected=0;for(let lag=minLag+1;lag<maxLag;lag++){
  if(scores[lag]>=Math.max(0.72,best*0.93)&&scores[lag]>=scores[lag-1]&&scores[lag]>=scores[lag+1]){selected=lag;break;}
 }
 if(!selected){selected=minLag;for(let lag=minLag+1;lag<=maxLag;lag++)if(scores[lag]>scores[selected])selected=lag;}
 const a=scores[selected-1]||0,b=scores[selected]||0,c=scores[selected+1]||0;
 const delta=Math.abs(a-2*b+c)>1e-10?Math.max(-0.5,Math.min(0.5,0.5*(a-c)/(a-2*b+c))):0;
 return {hz:Math.round(rate/(selected+delta)*10)/10,confidence:Math.round(b*100)/100};
}
const round=(n,places=1)=>Number(n.toFixed(places));
const median=v=>{const a=[...v].sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):0;};
const pct=(v,p)=>v[Math.min(v.length-1,Math.max(0,Math.floor(v.length*p)))];
export async function analyzeSamples(input,rate,{maxSeconds=90,onProgress}={}){
 if(!input?.length||!rate)throw Error('분석할 오디오 데이터가 없습니다.');
 const duration=input.length/rate;const limited=Math.min(input.length,Math.round(Math.max(1,maxSeconds)*rate));
 const stride=Math.max(1,Math.round(rate/8000)),outRate=rate/stride,frameSize=2048,hop=Math.max(1,Math.round(outRate*0.15));
 const samples=new Float32Array(Math.ceil(limited/stride));
 let sumSq=0,peak=0,clipped=0;
 for(let i=0;i<limited;i++){
  const x=input[i]||0;sumSq+=x*x;peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=0.995)clipped++;
  if(i%stride===0)samples[i/stride]=x;
 }
 const totalFrames=Math.max(0,Math.floor((samples.length-frameSize)/hop)+1);const voiced=[];const snapshot=[];let activeFrames=0;
 for(let i=0;i<totalFrames;i++){
  const start=i*hop,window=samples.subarray(start,start+frameSize);let sq=0;
  for(let j=0;j<frameSize;j++)sq+=window[j]*window[j];
  const rms=Math.sqrt(sq/frameSize);if(rms>0.014)activeFrames++;
  if(rms>0.014){const p=findPitch(window,outRate);if(p&&p.hz>=MIN_HZ&&p.hz<=MAX_HZ&&p.confidence>=0.72){voiced.push(p.hz);snapshot.push({time:round(start/outRate,2),hz:p.hz,confidence:p.confidence});}}
  if(i%40===0){onProgress?.(Math.round(100*(i+1)/Math.max(totalFrames,1)));await new Promise(r=>setTimeout(r,0));}
 }
 const values=voiced.slice().sort((a,b)=>a-b),n=values.length,typical=n?median(values):0;
 const buckets=new Array(13).fill(0);for(const hz of voiced){const idx=Math.max(0,Math.min(12,Math.floor((69+12*Math.log2(hz/440)-36)/5)));buckets[idx]++;}
 onProgress?.(100);
 return {version:1,analyzedAt:new Date().toISOString(),duration:round(duration,2),analyzedSeconds:round(limited/rate,2),sampleRate:rate,meanRmsDb:round(20*Math.log10(Math.sqrt(sumSq/limited)+1e-12)),peakDb:round(20*Math.log10(peak+1e-12)),clippedPercent:round(100*clipped/limited,2),frames:totalFrames,voicedFrames:n,voicedPercent:totalFrames?Math.round(100*n/totalFrames):0,activePercent:totalFrames?Math.round(100*activeFrames/totalFrames):0,
   lowHz:n?round(pct(values,0.1)):0,highHz:n?round(pct(values,0.9)):0,medianHz:round(typical),lowNote:n?hzToNote(pct(values,0.1)):'—',highNote:n?hzToNote(pct(values,0.9)):'—',medianNote:n?hzToNote(typical):'—',distribution:buckets,points:snapshot.filter((_,i)=>i%Math.max(1,Math.ceil(snapshot.length/120))===0),quality:n<10?'insufficient':n/Math.max(totalFrames,1)<0.16?'limited':'measured'};
}
export async function analyzeAudioFile(file,opts={}){
 if(!file||!file.size)throw Error('오디오 파일이 비어 있습니다.');
 const AudioCtx=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!AudioCtx)throw Error('이 브라우저에는 오디오 분석 기능이 없습니다.');
 const ctx=new AudioCtx();
 try{
  const bytes=await file.arrayBuffer(),buffer=await ctx.decodeAudioData(bytes);
  const channel=buffer.getChannelData(0);let data=channel;
  if(buffer.numberOfChannels>1){data=new Float32Array(channel.length);for(let ch=0;ch<buffer.numberOfChannels;ch++){const c=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]+=c[i]/buffer.numberOfChannels;}}
  return await analyzeSamples(data,buffer.sampleRate,opts);
 }catch(e){throw Error('오디오 파일을 분석할 수 없습니다: '+e.message);}finally{await ctx.close().catch(()=>{});}
}
export function voiceAdvice(a){
 if(!a)return '샘플을 추가하면 오디오의 피치와 음량을 측정할 수 있습니다.';
 if(a.quality==='insufficient')return '측정 가능한 안정된 음정이 부족합니다. 반주와 잡음이 적은 단독 목소리로 20~30초를 녹음해 보세요.';
 if(a.clippedPercent>0.5)return '신호가 과도하게 커 일부 소리가 찌그러졌을 수 있습니다. 녹음 입력 볼륨을 낮춰 보세요.';
 if(a.voicedPercent<25)return '정확한 피치 추정에 사용할 구간이 적습니다. 잡음이 적은 환경에서 지속음과 다양한 음높이를 녹음해 보세요.';
 return '기초 피치 측정이 완료되었습니다. 추가로 저음·중음·고음을 각각 녹음하면 샘플 구성이 더 다양해집니다. 실제 성문/발음별 학습 데이터 부족 여부는 판단할 수 없습니다.';
}
