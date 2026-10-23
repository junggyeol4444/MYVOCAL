// 기존 Windows WebView2 EXE의 실제 SVD 애니메이션 WebP 프레임을
// 완성 곡의 절대 재생시간에 맞춰 그린다. 동영상 원본/IndexedDB는 읽기 전용.
// 한 번에 현재/다음 장면만 디코딩해 3~6분·120장면 전체를 메모리에 유지하지 않는다.
import {inspectAnimatedSvdWebp} from './mvSvdClipTiming.js';

function frameMilliseconds(data){
 const b=data instanceof Uint8Array?data:new Uint8Array(data);
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),durations=[];
 for(let p=12;p+8<=b.length;){
  const name=String.fromCharCode(...b.subarray(p,p+4));
  const length=v.getUint32(p+4,true),start=p+8;
  if(length>b.length-start)throw Error('SVD 애니메이션 원본의 프레임 청크가 손상됐습니다.');
  if(name==='ANMF'){
   if(length<16)throw Error('SVD 애니메이션 프레임 헤더가 손상됐습니다.');
   const ms=b[start+12]|b[start+13]<<8|b[start+14]<<16;
   if(ms<1||ms>10000)throw Error('SVD 프레임의 실제 재생시간이 잘못됐습니다.');
   durations.push(ms);
  }
  p=start+length+(length&1);
 }
 return durations;
}
export function createMvWebpTimeline(plan,originalAssets,{signal,ImageDecoderClass=globalThis.ImageDecoder,maxCached=2}={}){
 if(!plan?.scenes||!(originalAssets instanceof Map)||!Number.isInteger(maxCached)||maxCached<1||maxCached>3)
  throw Error('완성 MV WebP 시간축을 만들 수 없습니다.');
 const clips=plan.scenes.filter(s=>s.assetId&&s.mime==='image/webp');
 const unique=new Set(clips.map(s=>s.assetId));
 if(unique.size&&!ImageDecoderClass)
  throw Error('이 Windows WebView2에서 실제 SVD WebP 프레임 디코딩을 지원하지 않습니다. 최신 WebView2 런타임이 필요합니다.');
 const cache=new Map(),pending=new Map(),renderAssets=new Map(originalAssets);
 let disposed=false;
 const close=entry=>{for(const frame of entry.frames||[])try{frame?.close?.();}catch{}};
 for(const id of unique){
  const original=originalAssets.get(id);
  if(!(original?.animatedWebpFile instanceof Blob))
   throw Error('실제 생성된 SVD WebP 원본 파일을 찾을 수 없습니다.');
  renderAssets.set(id,{kind:'frame-sequence',frameAt:(scene,time)=>{
   const entry=cache.get(id);
   if(!entry||disposed)throw Error('SVD 프레임 준비가 끝나지 않았습니다. 정지 이미지로 대신 출력하지 않습니다.');
   const local=Math.max(0,Number(time)-Number(scene.start));
   const wanted=(local%entry.durationSec)*1000;
   let idx=0,at=0;
   for(;idx<entry.ms.length-1;idx++){
    at+=entry.ms[idx];
    if(at>wanted)break;
   }
   return entry.frames[Math.min(idx,entry.frames.length-1)];
  }});
 }
 async function prepare(scene){
  if(!scene?.assetId||scene.mime!=='image/webp'||cache.has(scene.assetId)||pending.has(scene.assetId))
   return pending.get(scene?.assetId);
  if(disposed||signal?.aborted)throw Error('SVD 동영상 프레임 준비가 취소됐습니다.');
  const id=scene.assetId,file=originalAssets.get(id).animatedWebpFile;
  const task=(async()=>{
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(disposed||signal?.aborted)throw Error('SVD 애니메이션 디코딩이 취소됐습니다.');
   const info=inspectAnimatedSvdWebp(bytes),ms=frameMilliseconds(bytes);
   if(info.frames!==ms.length||info.frames<2||info.frames>25)
    throw Error('저장된 SVD 동영상이 실제 2~25개 프레임을 갖고 있지 않습니다.');
   let decoder=null,frames=[];
   try{
    decoder=new ImageDecoderClass({data:bytes,type:'image/webp'});
    await decoder.tracks.ready;
    const reported=decoder.tracks.selectedTrack?.frameCount;
    if(Number.isInteger(reported)&&reported!==info.frames)
     throw Error('WebView2가 읽은 SVD 프레임 수와 실제 WebP 프레임 수가 다릅니다.');
    for(let i=0;i<info.frames;i++){
     if(disposed||signal?.aborted)throw Error('SVD 동영상 프레임 준비가 취소됐습니다.');
     const result=await decoder.decode({frameIndex:i});
     if(!result?.image)throw Error('SVD WebP 영상 프레임 디코딩이 실패했습니다.');
     frames.push(result.image);
    }
    if(disposed){for(const frame of frames)try{frame.close();}catch{};return;}
    // 사용 중인 장면에 손대지 않고 제일 오래된 장면 프레임을 해제.
    while(cache.size>=maxCached){
     const first=cache.keys().next().value;
     close(cache.get(first));cache.delete(first);
    }
    cache.set(id,{frames,ms,durationSec:info.durationSec});
    frames=[];
   }finally{
    for(const frame of frames)try{frame.close();}catch{}
    try{decoder?.close?.();}catch{}
   }
  })();
  pending.set(id,task);
  try{return await task;}finally{pending.delete(id);}
 }
 const scenes=plan.scenes.slice().sort((a,b)=>a.start-b.start);
 async function prewarm(seconds=0){
  const ix=scenes.findIndex(s=>s.start<=seconds&&seconds<s.end);
  const index=ix<0?0:ix;
  if(scenes[index])await prepare(scenes[index]);
  if(scenes[index+1])await prepare(scenes[index+1]);
 }
 function lookAhead(seconds){
  if(disposed||signal?.aborted)return Promise.reject(Error('SVD 프레임 준비가 취소됐습니다.'));
  const ix=scenes.findIndex(s=>s.start<=seconds&&seconds<s.end);
  if(ix<0)return Promise.resolve();
  const curr=scenes[ix],next=scenes[ix+1];
  // Current first in LRU; decoding next evicts only previously used scenes.
  if(curr?.assetId&&cache.has(curr.assetId)){const x=cache.get(curr.assetId);cache.delete(curr.assetId);cache.set(curr.assetId,x);}
  return next?prepare(next):Promise.resolve();
 }
 function dispose(){
  if(disposed)return;
  disposed=true;
  for(const entry of cache.values())close(entry);
  cache.clear();
 }
 return {renderAssets,prewarm,lookAhead,dispose,hasAnimated:unique.size>0};
}
