// 원본 32항: 사용자 버튼과 카메라 권한 승인 후 녹화하는 로컬 WebM.
// 웹 서버·업로드 없음. 새 파일을 저장할 때만 기존 IndexedDB add API를 사용한다.
export async function recordWebcamMotion32({
 durationSec=10,signal,onProgress=()=>{},
 env=globalThis
}={}){
 if(!Number.isInteger(durationSec)||durationSec<2||durationSec>30)
  throw Error('동작 녹화 길이는 2~30초로 지정해 주세요.');
 if(!env.navigator?.mediaDevices?.getUserMedia||!env.MediaRecorder)
  throw Error('Windows EXE에서 카메라 권한·WebM 녹화를 지원하지 않습니다.');
 if(signal?.aborted)throw Error('카메라 녹화가 취소됐습니다.');
 const format=['video/webm;codecs=vp8','video/webm'].find(x=>env.MediaRecorder.isTypeSupported(x));
 if(!format)throw Error('현재 Windows WebView2에서 WebM 동작 녹화를 지원하지 않습니다.');
 const stream=await env.navigator.mediaDevices.getUserMedia({
  video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:25,max:30}},audio:false
 });
 let recorder=null,timeout=null,settled=false;
 const cleanup=()=>{
  if(timeout!==null)env.clearTimeout(timeout);
  signal?.removeEventListener('abort',onAbort);
  for(const track of stream.getTracks())track.stop();
 };
 const stop=()=>{if(recorder?.state==='recording')recorder.stop();};
 const onAbort=()=>{if(!settled)stop();};
 try{
  if(signal?.aborted)throw Error('녹화를 시작하기 전에 취소했습니다.');
  recorder=new env.MediaRecorder(stream,{mimeType:format,videoBitsPerSecond:2500000});
  const chunks=[];
  const result=await new Promise((resolve,reject)=>{
   const fail=error=>{if(settled)return;settled=true;cleanup();reject(error);};
   recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
   recorder.onerror=event=>fail(event.error||Error('카메라 WebM 녹화가 실패했습니다.'));
   recorder.onstop=()=>{
    if(settled)return;
    settled=true;cleanup();
    if(signal?.aborted){reject(Error('카메라 녹화를 취소했습니다.'));return;}
    const movie=new Blob(chunks,{type:'video/webm'});
    if(movie.size<1024||movie.size>60*1024*1024){reject(Error('녹화된 동작 영상 용량이 잘못됐습니다.'));return;}
    onProgress('실제 카메라 WebM '+Math.ceil(movie.size/1024)+'KB 생성 완료');
    resolve(movie);
   };
   signal?.addEventListener('abort',onAbort,{once:true});
   recorder.start(1000);
   onProgress('실제 카메라 동작 녹화 중 ('+durationSec+'초)');
   timeout=env.setTimeout(stop,durationSec*1000);
  });
  return new File([result],'MYVOCAL-본인동작-'+Date.now()+'.webm',{type:'video/webm'});
 }finally{
  if(recorder?.state==='recording'){try{recorder.stop()}catch{}}
  cleanup();
 }
}
