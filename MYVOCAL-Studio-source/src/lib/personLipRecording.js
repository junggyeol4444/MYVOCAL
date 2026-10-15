// STEP86 — offline browser WebM with real singing audio and video canvas stream.
// Abort/error never returns an incomplete recording. Media sources stay local.
import {supportedStageWebM} from './stage3dRecording.js';
export function supportedPersonLipRecording(env=globalThis){
 return !!(env.AudioContext||env.webkitAudioContext)&&supportedStageWebM(env.MediaRecorder)&&typeof env.MediaStream==='function';
}
export async function recordPersonLipWebM({canvas,video,audioUrl,duration,fps=30,draw,onProgress=()=>{},signal,env=globalThis}){
 if(!canvas||typeof canvas.captureStream!=='function'||!video||!audioUrl||typeof draw!=='function')throw Error('녹화할 영상·가창 오디오가 없습니다.');
 if(![24,30].includes(fps)||!Number.isFinite(duration)||duration<2||duration>30)throw Error('출력 길이는 2~30초, FPS는 24 또는 30만 허용합니다.');
 if(!supportedPersonLipRecording(env))throw Error('브라우저의 오디오 합성 또는 WebM 인코더가 지원되지 않습니다.');
 if(signal?.aborted)throw Error('사용자가 영상 생성을 취소했습니다.');
 const Context=env.AudioContext||env.webkitAudioContext,media=new env.Audio(audioUrl);media.preload='auto';
 const context=new Context(),destination=context.createMediaStreamDestination(),source=context.createMediaElementSource(media);
 source.connect(destination);
 let recorder,stream,visualStream,raf=0,settled=false,started=false,finished=false;
 const chunks=[];const mimeType=supportedStageWebM(env.MediaRecorder);
 const stopTracks=()=>{for(const s of [stream,visualStream,destination.stream])try{s?.getTracks().forEach(t=>t.stop());}catch{}};
 const cleanup=()=>{env.cancelAnimationFrame(raf);media.pause();video.pause();stopTracks();try{source.disconnect();}catch{}Promise.resolve(context.close()).catch(()=>{});};
 try{
  await context.resume();
  visualStream=canvas.captureStream(fps);
  stream=new env.MediaStream([...visualStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
  if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)throw Error('영상 또는 오디오 녹화 트랙이 없습니다.');
  recorder=new env.MediaRecorder(stream,{mimeType,videoBitsPerSecond:3500000});
  return await new Promise((resolve,reject)=>{
   const abort=()=>fail(Error('사용자가 영상 생성을 취소했습니다.'));
   const detach=()=>signal?.removeEventListener('abort',abort);
   const fail=e=>{if(settled)return;settled=true;detach();try{if(recorder.state!=='inactive')recorder.stop();}catch{}cleanup();reject(e);};
   recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   recorder.onerror=e=>fail(e.error||Error('WebM 녹화 실패'));
   recorder.onstop=()=>{if(settled)return;settled=true;detach();cleanup();const blob=new Blob(chunks,{type:'video/webm'});blob.size?resolve(blob):reject(Error('WebM 결과가 비어 있습니다.'));};
   signal?.addEventListener('abort',abort,{once:true});
   const tick=()=>{
    if(settled)return;
    const t=media.currentTime;
    try{
     if(video.readyState>=2){if(Math.abs(video.currentTime-t)>.25)video.currentTime=t;draw(t);}
     onProgress(Math.min(1,t/duration));
     if(t>=duration||media.ended){finished=true;recorder.stop();return;}
    }catch(e){fail(e);return;}
    raf=env.requestAnimationFrame(tick);
   };
   (async()=>{try{
    media.currentTime=0;video.currentTime=0;video.muted=true;
    recorder.start(250);started=true;
    await Promise.all([media.play(),video.play()]);
    if(!settled)raf=env.requestAnimationFrame(tick);
   }catch(e){fail(e);}})();
  });
 }catch(e){if(!settled)cleanup();throw e;}
}
