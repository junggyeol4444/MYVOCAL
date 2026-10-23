// 기존 EXE의 허가 인물 Wav2Lip 결과 MP4를 실제 영상/오디오 트랙까지 읽는다.
// 브라우저 확장 프로그램·외부 서비스·가짜 인코더는 사용하지 않는다.
const textAt=(b,p)=>String.fromCharCode(...b.subarray(p,p+4));
function atoms(b,start,end,depth=0){
 if(depth>6)throw Error('Wav2Lip MP4 메타데이터의 깊이가 올바르지 않습니다.');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),out=[];
 let p=start;
 while(p<end){
  if(p+8>end)throw Error('Wav2Lip MP4 박스 헤더가 손상됐습니다.');
  let size=view.getUint32(p,false),head=8;
  const type=textAt(b,p+4);
  if(size===1){
   if(p+16>end)throw Error('Wav2Lip MP4 확장 크기가 손상됐습니다.');
   const big=view.getBigUint64(p+8,false);
   if(big>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MP4 박스 크기가 너무 큽니다.');
   size=Number(big);head=16;
  }else if(size===0){size=end-p;}
  if(size<head||p+size>end)throw Error('Wav2Lip MP4 박스 범위가 손상됐습니다.');
  out.push({type,start:p+head,end:p+size});
  p+=size;
 }
 return out;
}
function movieDuration(b,box){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),p=box.start,version=b[p];
 const time=version===0?p+12:version===1?p+20:-1;
 if(time<0||time+12>box.end)throw Error('Wav2Lip MP4 동영상 시간 메타데이터가 잘못됐습니다.');
 const scale=v.getUint32(time,false);
 let duration=version===0?v.getUint32(time+4,false):Number(v.getBigUint64(time+4,false));
 if(!scale||!Number.isSafeInteger(duration))throw Error('Wav2Lip MP4 재생시간을 읽을 수 없습니다.');
 duration/=scale;
 if(!Number.isFinite(duration)||duration<.1||duration>360.5)
  throw Error('Wav2Lip MP4 재생시간이 음악 범위를 벗어났습니다.');
 return duration;
}
export async function inspectRealPersonMp4(blob,{signal}={}){
 if(!(blob instanceof Blob)||blob.type!=='video/mp4'||blob.size<128||blob.size>220*1024*1024)
  throw Error('실제 Wav2Lip MP4 영상 크기·형식을 확인하세요.');
 if(signal?.aborted)throw Error('실제 사람 립싱크 영상 검사가 취소됐습니다.');
 const prefix=new Uint8Array(await blob.slice(0,Math.min(32,blob.size)).arrayBuffer());
 if(prefix.length<12||textAt(prefix,4)!=='ftyp')
  throw Error('Wav2Lip 출력이 올바른 MP4 컨테이너가 아닙니다.');
 let position=0,found=null;
 while(position+8<=blob.size){
  if(signal?.aborted)throw Error('실제 사람 립싱크 영상 검사가 취소됐습니다.');
  const head=new Uint8Array(await blob.slice(position,Math.min(position+16,blob.size)).arrayBuffer());
  if(head.length<8)throw Error('Wav2Lip 출력 MP4 박스가 손상됐습니다.');
  const v=new DataView(head.buffer,head.byteOffset,head.byteLength),type=textAt(head,4);
  let size=v.getUint32(0,false),length=8;
  if(size===1){if(head.length<16)throw Error('MP4 확장 박스 헤더가 손상됐습니다.');const n=v.getBigUint64(8,false);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MP4 박스 크기가 너무 큽니다.');size=Number(n);length=16;}
  else if(size===0)size=blob.size-position;
  if(size<length||size>blob.size-position)throw Error('MP4 박스 크기가 실제 파일과 다릅니다.');
  if(type==='moov'){
   if(size>16*1024*1024)throw Error('Wav2Lip MP4 동영상 메타데이터가 16MiB를 초과합니다.');
   found=new Uint8Array(await blob.slice(position,position+size).arrayBuffer());
   break;
  }
  position+=size;
 }
 if(!found)throw Error('실제 Wav2Lip MP4 동영상 메타데이터가 없습니다.');
 const headSize=new DataView(found.buffer).getUint32(0,false)===1?16:8;
 const children=atoms(found,headSize,found.length);
 const mvhd=children.find(b=>b.type==='mvhd');
 if(!mvhd)throw Error('Wav2Lip MP4의 실제 재생시간이 없습니다.');
 const durationSec=movieDuration(found,mvhd),tracks=new Set();
 for(const track of children.filter(b=>b.type==='trak')){
  const mdia=atoms(found,track.start,track.end).find(b=>b.type==='mdia');
  if(!mdia)continue;
  const handler=atoms(found,mdia.start,mdia.end).find(b=>b.type==='hdlr');
  if(!handler||handler.end<handler.start+12)continue;
  tracks.add(textAt(found,handler.start+8));
 }
 if(!tracks.has('vide')||!tracks.has('soun'))
  throw Error('Wav2Lip MP4에 실제 영상과 가창 오디오 트랙이 모두 있어야 합니다.');
 return {durationSec,videoTrack:true,audioTrack:true};
}
export async function assertRealPersonLipAudioSync(movie,audioInfo,{signal}={}){
 if(!audioInfo?.durationSec||!Number.isFinite(audioInfo.durationSec))
  throw Error('실제 가창 WAV 재생시간이 없습니다.');
 const mp4=await inspectRealPersonMp4(movie,{signal});
 if(Math.abs(mp4.durationSec-audioInfo.durationSec)>.35)
  throw Error('Wav2Lip MP4와 실제 가창 WAV 재생시간이 일치하지 않습니다.');
 return mp4;
}
