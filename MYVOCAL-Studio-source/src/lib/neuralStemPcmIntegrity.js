// 로컬 6악기 MusicGen 원본 WAV 검사. 사용자 녹음·모델·프로젝트는 수정하지 않는다.
// PCM 패턴 중복은 확인하지만 실제 악기 분리 품질을 보증하지 않는다.
const SAMPLE_COUNT=32768;
const ascii=(b,at,n)=>String.fromCharCode(...b.subarray(at,at+n));
export function analyzeNeuralStemPcm(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<44||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WAVE')
  throw Error('신경망 악기 WAV 컨테이너가 올바르지 않습니다.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(4,true)+8!==bytes.length)throw Error('신경망 악기 WAV 크기가 일치하지 않습니다.');
 let fmt=null,offset=12,dataOffset=-1,dataSize=0;
 while(offset+8<=bytes.length){
  const tag=ascii(bytes,offset,4),size=view.getUint32(offset+4,true),begin=offset+8;
  if(size>bytes.length-begin)throw Error('신경망 악기 WAV 청크가 손상됐습니다.');
  if(tag==='fmt '){
   if(fmt||size<16)throw Error('신경망 악기 WAV 형식이 중복되거나 짧습니다.');
   fmt={codec:view.getUint16(begin,true),channels:view.getUint16(begin+2,true),
    rate:view.getUint32(begin+4,true),align:view.getUint16(begin+12,true),
    bits:view.getUint16(begin+14,true)};
  }else if(tag==='data'){
   if(dataOffset!==-1)throw Error('신경망 악기 WAV 데이터 청크가 중복됐습니다.');
   dataOffset=begin;dataSize=size;
  }
  offset=begin+size+(size&1);
 }
 if(!fmt||dataOffset<0||fmt.codec!==1||fmt.bits!==16||![1,2].includes(fmt.channels)||
    fmt.align!==fmt.channels*2||fmt.rate<8000||fmt.rate>96000||
    !dataSize||dataSize%fmt.align||offset!==bytes.length)
  throw Error('신경망 악기는 실제 16비트 PCM WAV(모노/스테레오)여야 합니다.');
 const frames=dataSize/fmt.align,count=Math.min(frames,SAMPLE_COUNT);
 const samples=new Int16Array(count*fmt.channels);
 let max=0,sum=0,sumSq=0,clipped=0;
 // 전곡의 서로 다른 위치를 균등 샘플링해 실제 생성 WAV의 레벨을 분석한다.
 // 이는 음질/악기 분리 정확도의 신경망 판정이 아니라 PCM 수치 진단이다.
 const windows=16,windowSq=new Float64Array(windows),windowCount=new Uint32Array(windows);
 const channelSq=new Float64Array(fmt.channels);
 for(let i=0;i<count;i++){
  const frame=Math.floor(i*frames/count);
  for(let ch=0;ch<fmt.channels;ch++){
   const value=view.getInt16(dataOffset+frame*fmt.align+ch*2,true);
   samples[i*fmt.channels+ch]=value;
   const abs=Math.abs(value);max=Math.max(max,abs);sum+=value;sumSq+=value*value;
   if(abs>=32760)clipped++;
   const bucket=Math.min(windows-1,Math.floor(i*windows/count));
   windowSq[bucket]+=value*value;windowCount[bucket]++;
   channelSq[ch]+=value*value;
  }
 }
 const n=samples.length,mean=sum/n,variance=Math.max(0,sumSq/n-mean*mean);
 if(max<64||Math.sqrt(variance)<32)
  throw Error('신경망 악기 WAV가 무음이거나 유효한 악기 파형이 아닙니다.');
 const rms=Math.sqrt(sumSq/n)/32768,peak=max/32768;
 const db=value=>Math.round(100*20*Math.log10(Math.max(1e-10,value)))/100;
 const windowRmsDbfs=Array.from(windowSq,(power,i)=>
  windowCount[i]?db(Math.sqrt(power/windowCount[i])/32768):-200);
 const left=Math.sqrt(channelSq[0]/count)/32768;
 const right=fmt.channels===2?Math.sqrt(channelSq[1]/count)/32768:left;
 const quality={
  method:'전곡 균등 PCM16 샘플링 · 음질 보증 아님',
  sampledFrames:count,fullFrames:frames,
  rmsDbfs:db(rms),peakDbfs:db(peak),
  crestDb:Math.round(100*20*Math.log10(Math.max(1e-10,peak)/Math.max(1e-10,rms)))/100,
  clippedSampleRatio:Math.round(clipped/n*1000000)/1000000,
  dcOffset:Math.round(mean/32768*1000000)/1000000,
  stereoBalanceDb:fmt.channels===2?db(left)-db(right):0,
  windowRmsDbfs
 };
 return {rate:fmt.rate,channels:fmt.channels,frames,samples,mean,variance,quality};
}
export function assertDistinctNeuralStems(a,b,roleA='현재',roleB='이전'){
 if(a.rate!==b.rate||a.channels!==b.channels||a.frames!==b.frames)
  throw Error('6개 신경망 악기의 샘플레이트·채널·길이가 일치하지 않습니다.');
 if(a.samples.length!==b.samples.length)throw Error('신경망 악기 비교 데이터가 일치하지 않습니다.');
 let cov=0;
 for(let i=0;i<a.samples.length;i++)cov+=(a.samples[i]-a.mean)*(b.samples[i]-b.mean);
 const corr=cov/a.samples.length/Math.sqrt(a.variance*b.variance);
 if(Math.abs(corr)>0.999999)
  throw Error('신경망 악기 '+roleA+'와 '+roleB+'의 오디오가 사실상 동일합니다. 원본은 보존하고 저장을 중단합니다.');
 return {correlation:corr};
}
