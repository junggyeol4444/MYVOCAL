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
 let max=0,sum=0,sumSq=0;
 for(let i=0;i<count;i++){
  const frame=Math.floor(i*frames/count);
  for(let ch=0;ch<fmt.channels;ch++){
   const value=view.getInt16(dataOffset+frame*fmt.align+ch*2,true);
   samples[i*fmt.channels+ch]=value;
   const abs=Math.abs(value);max=Math.max(max,abs);sum+=value;sumSq+=value*value;
  }
 }
 const n=samples.length,mean=sum/n,variance=Math.max(0,sumSq/n-mean*mean);
 if(max<64||Math.sqrt(variance)<32)
  throw Error('신경망 악기 WAV가 무음이거나 유효한 악기 파형이 아닙니다.');
 return {rate:fmt.rate,channels:fmt.channels,frames,samples,mean,variance};
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
