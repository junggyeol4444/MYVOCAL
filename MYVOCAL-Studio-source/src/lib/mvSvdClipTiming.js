// 기존 Windows EXE의 ComfyUI/SVD 실제 출력 WebP·MP4 재생시간.
// 신규 자동 MV 장면에만 적용하며 원본/기존 장면은 수정하지 않는다.
const ascii=(bytes,pos,n)=>String.fromCharCode(...bytes.subarray(pos,pos+n));
const le24=(bytes,pos)=>bytes[pos]|bytes[pos+1]<<8|bytes[pos+2]<<16;
export function inspectAnimatedSvdWebp(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<30||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP')
  throw Error('실제 SVD WebP 영상 컨테이너가 올바르지 않습니다.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(4,true)+8!==bytes.length)throw Error('SVD WebP 영상 크기가 올바르지 않습니다.');
 let at=12,animated=false,frames=0,milliseconds=0;
 while(at+8<=bytes.length){
  const tag=ascii(bytes,at,4),length=v.getUint32(at+4,true),start=at+8;
  if(length>bytes.length-start)throw Error('SVD WebP 프레임 청크가 손상됐습니다.');
  if(tag==='VP8X'){
   if(length<10)throw Error('SVD WebP 확장 헤더가 손상됐습니다.');
   animated=!!(bytes[start]&2);
  }else if(tag==='ANMF'){
   if(length<16)throw Error('SVD WebP 애니메이션 프레임이 손상됐습니다.');
   const ms=le24(bytes,start+12);
   if(ms<1||ms>10000)throw Error('SVD WebP 프레임 시간이 올바르지 않습니다.');
   milliseconds+=ms;frames++;
  }
  at=start+length+(length&1);
 }
 if(at!==bytes.length||!animated||frames<2||!milliseconds)
  throw Error('SVD가 실제 움직이는 WebP 영상 프레임을 생성하지 않았습니다.');
 return {format:'animated-webp',frames,durationSec:milliseconds/1000};
}
export async function readSvdMp4Duration(blob,{signal,timeoutMs=15000}={}){
 if(typeof document==='undefined'||typeof URL.createObjectURL!=='function')
  throw Error('Windows EXE 영상 메타데이터를 읽을 수 없습니다.');
 return await new Promise((resolve,reject)=>{
  const video=document.createElement('video'),url=URL.createObjectURL(blob);
  let complete=false,timeout;
  const finish=(error,value)=>{
   if(complete)return;complete=true;clearTimeout(timeout);
   signal?.removeEventListener?.('abort',cancel);
   video.onloadedmetadata=null;video.onerror=null;
   video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
   if(error)reject(error);else resolve(value);
  };
  const cancel=()=>finish(Error('SVD 영상 길이 확인이 취소됐습니다.'));
  video.preload='metadata';video.muted=true;
  video.onloadedmetadata=()=>{
   const duration=Number(video.duration);
   if(!Number.isFinite(duration)||duration<=0||duration>360)
    finish(Error('SVD MP4 실제 재생시간이 올바르지 않습니다.'));
   else finish(null,{format:'mp4',frames:null,durationSec:duration});
  };
  video.onerror=()=>finish(Error('SVD MP4 영상 메타데이터를 읽지 못했습니다.'));
  timeout=setTimeout(()=>finish(Error('SVD MP4 영상 길이 확인 시간 초과')),timeoutMs);
  signal?.addEventListener?.('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  video.src=url;
 });
}
export async function inspectSvdClipDuration(blob,{signal,readMp4Duration=readSvdMp4Duration}={}){
 if(!(blob instanceof Blob)||blob.size<32||blob.size>40*1024*1024)
  throw Error('실제 SVD 영상 파일이 없거나 40MiB를 초과합니다.');
 if(signal?.aborted)throw Error('SVD 영상 길이 확인이 취소됐습니다.');
 if(blob.type==='image/webp')return inspectAnimatedSvdWebp(new Uint8Array(await blob.arrayBuffer()));
 if(blob.type==='video/mp4')return readMp4Duration(blob,{signal});
 throw Error('실제 SVD WebP 애니메이션 또는 MP4 영상이 필요합니다.');
}
export async function assertSvdAutoSceneClipDuration(blob,sceneSeconds,{signal,readMp4Duration}={}){
 if(!Number.isFinite(sceneSeconds)||sceneSeconds<=0||sceneSeconds>25/8+.001)
  throw Error('자동 SVD 장면이 25프레임·8fps의 실제 영상 길이를 초과합니다.');
 const info=await inspectSvdClipDuration(blob,{signal,readMp4Duration});
 if(!Number.isFinite(info.durationSec)||info.durationSec+.06<sceneSeconds)
  throw Error('실제 SVD 영상이 전체 MV 장면 시간보다 짧습니다.');
 if(info.format==='animated-webp'&&info.frames!==25)
  throw Error('자동 MV의 25프레임 SVD 영상이 전부 생성되지 않았습니다.');
 if(Math.abs(info.durationSec-25/8)>.2||info.durationSec>25/8+.25)
  throw Error('실제 SVD 출력이 25프레임·8fps 길이와 다릅니다.');
 return info;
}
