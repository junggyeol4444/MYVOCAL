// STEP84 — real-time offline MediaRecorder from the rendered WebGL canvas.
// Caller owns the original model/asset. Audio is deliberately not synthesized.
export function supportedStageWebM(MediaRecorderClass=globalThis.MediaRecorder){
 if(!MediaRecorderClass||typeof MediaRecorderClass.isTypeSupported!=='function')return '';
 return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorderClass.isTypeSupported(t))||'';
}
export async function recordStageWebM({canvas,duration,fps,draw,onProgress=()=>{},signal,audioBlob=null,AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext,MediaRecorderClass=globalThis.MediaRecorder}){
 if(!canvas||typeof canvas.captureStream!=='function')throw Error('현재 WebGL 캔버스는 영상 녹화를 지원하지 않습니다.');
 if(![24,30].includes(fps)||!Number.isFinite(duration)||duration<2||duration>30)throw Error('영상 길이 또는 FPS 설정 오류');
 const mimeType=supportedStageWebM(MediaRecorderClass);if(!mimeType)throw Error('이 Windows 브라우저에는 WebM MediaRecorder 인코더가 없습니다.');
 if(signal?.aborted)throw Error('영상 제작이 취소됐습니다.');
 let audioContext=null,audioSource=null;
 draw(0);const stream=canvas.captureStream(fps);let recorder,raf=0,done=false,started=0,previous=-Infinity;const chunks=[];
 if(audioBlob!==null){
  if(!(audioBlob instanceof Blob)||audioBlob.size<44||audioBlob.size>24*1024*1024)throw Error('실제 보컬 WAV는 24MiB 이하로 선택하세요.');
  if(typeof AudioContextClass!=='function')throw Error('Windows 오디오 캡처 기능을 사용할 수 없습니다.');
  audioContext=new AudioContextClass();
  try{
   const decoded=await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
   if(decoded.duration+0.08<duration)throw Error('음악 WAV가 3D 공연 영상 길이보다 짧습니다.');
   const destination=audioContext.createMediaStreamDestination();
   audioSource=audioContext.createBufferSource();audioSource.buffer=decoded;
   audioSource.connect(destination);
   const track=destination.stream.getAudioTracks()[0];
   if(!track)throw Error('오디오 캡처 트랙 생성에 실패했습니다.');
   stream.addTrack(track);await audioContext.resume();
  }catch(e){stream.getTracks().forEach(track=>track.stop());await audioContext.close().catch(()=>{});throw e;}
 }
 try{
  recorder=new MediaRecorderClass(stream,{mimeType,videoBitsPerSecond:3000000});
  return await new Promise((resolve,reject)=>{
   const cleanup=()=>{cancelAnimationFrame(raf);signal?.removeEventListener('abort',abort);stream.getTracks().forEach(track=>track.stop());if(audioSource)try{audioSource.stop()}catch{};if(audioContext)void audioContext.close().catch(()=>{});};
   const fail=(e)=>{if(done)return;done=true;try{if(recorder.state!=='inactive')recorder.stop();}catch{}cleanup();reject(e instanceof Error?e:Error('영상 인코딩에 실패했습니다.'));};
   const abort=()=>fail(Error('영상 제작이 취소됐습니다.'));
   recorder.ondataavailable=e=>{if(e.data?.size>0)chunks.push(e.data);};
   recorder.onerror=e=>fail(e.error||Error('WebM 인코더 오류'));
   recorder.onstop=()=>{if(done)return;done=true;cleanup();const blob=new Blob(chunks,{type:'video/webm'});blob.size?resolve(blob):reject(Error('WebM 결과가 비어 있습니다.'));};
   signal?.addEventListener('abort',abort,{once:true});
   try{recorder.start(250);if(audioSource)audioSource.start(0);}catch(e){fail(e);return;}
   const frame=now=>{if(done)return;if(!started)started=now;const t=Math.min(duration,(now-started)/1000);
    try{draw(t);if(t-previous>=.2||t===duration){onProgress(t/duration);previous=t;}}catch(e){fail(e);return;}
    if(t>=duration){try{recorder.stop();}catch(e){fail(e);}return;}
    raf=requestAnimationFrame(frame);
   };
   raf=requestAnimationFrame(frame);
  });
 }catch(e){stream.getTracks().forEach(track=>track.stop());if(audioSource)try{audioSource.stop()}catch{};if(audioContext)void audioContext.close().catch(()=>{});throw e;}
}
