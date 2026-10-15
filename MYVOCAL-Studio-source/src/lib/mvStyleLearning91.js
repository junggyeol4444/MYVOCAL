// STEP91. Local consented-video feature analysis; no neural training or remote calls.
export const MV_STYLE91_VERSION=1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const good=n=>typeof n==='number'&&Number.isFinite(n);
export function sampleStyleFrame91(pixels,width,height,time){
 if(!pixels||!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width*height>4096||pixels.length!==width*height*4||!good(time)||time<0||time>7200)throw Error('분석 프레임·시간·크기 오류');
 let r=0,g=0,b=0,l=0,contrast=0;const count=width*height,gray=[];
 for(let i=0;i<count;i++){const j=i*4;const red=pixels[j],green=pixels[j+1],blue=pixels[j+2];r+=red;g+=green;b+=blue;const v=(.2126*red+.7152*green+.0722*blue);gray.push(v);l+=v;}
 const mean=l/count;for(const v of gray)contrast+=(v-mean)**2;
 return {time:Math.round(time*1000)/1000,r:Math.round(r/count),g:Math.round(g/count),b:Math.round(b/count),brightness:Math.round(mean),contrast:Math.round(Math.sqrt(contrast/count)),signature:Array.from({length:16},(_,i)=>{const x=Math.floor((i%4+.5)*width/4),y=Math.floor((Math.floor(i/4)+.5)*height/4);return Math.round(gray[y*width+x]);})};
}
export function analyzeMvStyle91(frames,durationSec,cutThreshold=45){
 if(!Array.isArray(frames)||frames.length<2||frames.length>300||!good(durationSec)||durationSec<=0||durationSec>7200||!good(cutThreshold)||cutThreshold<10||cutThreshold>120)throw Error('분석 길이·샘플 수 오류');
 const shots=[],motion=[],colors={r:0,g:0,b:0},count=frames.length;let last=-1;
 for(let i=0;i<count;i++){const f=frames[i];if(!good(f?.time)||f.time<=last||f.time>durationSec+.05||![f.r,f.g,f.b,f.brightness,f.contrast].every(v=>good(v)&&v>=0&&v<=255)||!Array.isArray(f.signature)||f.signature.length!==16||!f.signature.every(v=>good(v)&&v>=0&&v<=255))throw Error('영상 프레임이 잘못되었거나 시간이 역전되었습니다.');last=f.time;colors.r+=f.r;colors.g+=f.g;colors.b+=f.b;
  if(i){const prev=frames[i-1],difference=f.signature.reduce((sum,x,j)=>sum+Math.abs(x-prev.signature[j]),0)/16;motion.push(difference);if(difference>=cutThreshold)shots.push(f.time);}
 }
 const average=(x)=>Math.round(x.reduce((a,b)=>a+b,0)/Math.max(x.length,1)*100)/100;
 const changes=[0,...shots,durationSec].slice(1).map((x,i)=>x-[0,...shots][i]);
 return {version:MV_STYLE91_VERSION,method:'offline-sampled-frame-analysis',durationSec,frameSamples:count,samplesPerSecond:Math.round((count/durationSec)*100)/100,averageColor:[Math.round(colors.r/count),Math.round(colors.g/count),Math.round(colors.b/count)],averageBrightness:average(frames.map(f=>f.brightness)),averageContrast:average(frames.map(f=>f.contrast)),averageFrameDifference:average(motion),estimatedCutsSec:shots,estimatedShotSeconds:average(changes),cutThreshold,limits:'화면 샘플 간 색·명암 변화 추정. 카메라 종류, 조명 의도, 타이포그래피, 장면 의미를 AI로 인식하지 않습니다.'};
}
export function saveMvStyle91(entry,analysis,{name='',notes=''}={}){
 if(!entry||entry.kind!=='MV Style Learning'||!['owned','self','licensed'].includes(entry.rights)||(entry.rights==='licensed'&&!entry.rightsNote?.trim()))throw Error('직접 제작하거나 사용 허가받은 MV만 스타일 프로필로 등록할 수 있습니다.');
 if(!entry.assetId||entry.mvStyle91?.version>1||analysis?.version!==1||analysis.frameSamples<2||typeof name!=='string'||name.length>120||typeof notes!=='string'||notes.length>1000)throw Error('분석 자료·프로필 형식 오류');
 return {...entry,mvStyle91:{...structuredClone(analysis),name:name.trim()||entry.name,notes,sourceAssetId:entry.assetId,createdAt:new Date().toISOString()},status:'로컬 MV 스타일 분석됨'};
}
export function style91Summary(entry){return entry?.mvStyle91?.version===1?`평균 장면 ${entry.mvStyle91.estimatedShotSeconds}s · 컷 추정 ${entry.mvStyle91.estimatedCutsSec.length}건`:'MV 스타일 분석 대기';}
