// Convert an existing local WebM recording into genuine MP4 via local FFmpeg.
export const MAX_MP4_WEBM_BYTES=96*1024*1024;
export const MAX_MP4_RESULT_BYTES=160*1024*1024;
export async function queryLocalMp4Status({session,request=fetch,signal}={}){
 if(typeof session!=='string'||!session)return {ready:false,message:'Windows EXE에서만 MP4 변환을 사용할 수 있습니다.'};
 try {
  const response=await request('/api/video/mp4/status',{method:'GET',headers:{'X-MYVOCAL-Session':session},signal,cache:'no-store'});
  if(!response.ok)throw Error('MP4 엔진 확인 실패: HTTP '+response.status);
  const info=await response.json();
  if(typeof info?.ready!=='boolean'||typeof info?.message!=='string')throw Error('MP4 엔진 상태 형식이 올바르지 않습니다.');
  return {ready:info.ready,message:info.message};
 }catch(err){if(signal?.aborted)throw err;return {ready:false,message:err.message};}
}
export async function convertRecordedWebMToMP4(webm,{session,request=fetch,signal}={}){
 if(typeof session!=='string'||!session)throw Error('Windows EXE 세션을 확인할 수 없습니다.');
 if(!(webm instanceof Blob)||!webm.size||webm.size>MAX_MP4_WEBM_BYTES||webm.type!=='video/webm')throw Error('실제 WebM 영상만 MP4로 변환할 수 있습니다 (최대 96MiB).');
 const response=await request('/api/video/mp4',{method:'POST',headers:{'X-MYVOCAL-Session':session,'Content-Type':'video/webm'},body:webm,cache:'no-store',signal});
 if(!response.ok){
  const problem=await response.json().catch(()=>({error:'HTTP '+response.status}));
  throw Error(problem.error||'MP4 변환 실패: HTTP '+response.status);
 }
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='video/mp4')throw Error('MP4 형식 응답이 아닙니다.');
 const output=await response.blob();
 if(output.size<32||output.size>MAX_MP4_RESULT_BYTES)throw Error('MP4 파일 크기가 올바르지 않습니다.');
 const first=new Uint8Array(await output.slice(0,12).arrayBuffer());
 if(String.fromCharCode(...first.slice(4,8))!=='ftyp')throw Error('MP4 컨테이너가 아닙니다. WebM 파일 이름만 변경하지 않습니다.');
 return output;
}
