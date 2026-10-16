// Real-time browser/WebView2 WebM recording of the existing MV storyboard.
// Frames come from user-saved local stills/clips. Optional sound comes from
// MYVOCAL's existing WAV mixdown. AI video generation is NOT performed here.
import {drawMvVideoFrame,findMvVideoScene,MV_VIDEO_FPS,MV_VIDEO_WIDTH,MV_VIDEO_HEIGHT} from './mvVideoRender.js';

export function selectMvWebmType(withAudio,supports){
 const choices=withAudio?
  ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']:
  ['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
 return choices.find(s=>supports(s))||'';
}
export function assertMvExportEnvironment(env=globalThis){
 if(!env.MediaRecorder||typeof env.MediaRecorder.isTypeSupported!=='function')
  throw Error('이 Windows WebView2/브라우저에서 WebM 녹화를 지원하지 않습니다.');
 if(typeof env.requestAnimationFrame!=='function')
  throw Error('영상 녹화에 필요한 화면 프레임 기능이 없습니다.');
}
// Abort pending audio preparation without waiting for a delayed mixdown,
// decode or suspended AudioContext. This cannot interrupt synchronous work.
function awaitMvAudioPreparation(work,signal){
 if(signal?.aborted)return Promise.reject(Error('영상 저장을 취소했습니다.'));
 if(!signal)return Promise.resolve().then(work);
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const abort=()=>{cleanup();reject(Error('영상 저장을 취소했습니다.'));};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{
   if(signal.aborted)throw Error('영상 저장을 취소했습니다.');
   return work();
  }).then(
   value=>{cleanup();resolve(value);},
   error=>{cleanup();reject(error);}
  );
 });
}
export async function recordMvWebm(plan,prepared,{
 renderAudio=null,includeAudio=false,showCaptions=false,captions=[],signal,onProgress=()=>{},
 canvasFactory=()=>document.createElement('canvas'),env=globalThis
}={}){
 assertMvExportEnvironment(env);
 if(!plan?.scenes?.length||!Number.isFinite(plan.durationSec)||plan.durationSec<=0||plan.durationSec>300)
  throw Error('영상 길이나 장면 정보가 올바르지 않습니다.');
 if(includeAudio&&typeof renderAudio!=='function')
  throw Error('음악 오디오를 제공할 수 없습니다.');
 if(signal?.aborted)throw Error('영상 저장을 취소했습니다.');
 const canvas=canvasFactory();canvas.width=MV_VIDEO_WIDTH;canvas.height=MV_VIDEO_HEIGHT;
 if(typeof canvas.captureStream!=='function')throw Error('영상 캔버스 녹화를 지원하지 않습니다.');
 let audioContext=null,audioSource=null,stream=null,recorder=null,frameId=0;
 let activeVideoId='',lastSceneId='',lastProgress=-1;
 const allAssets=prepared?.assets||new Map();
 // Cleanup must be best-effort: a stale MP4 element or released track
 // must not keep the WebM recorder pending or leak remaining media resources.
 const stopVideos=()=>{
  for(const x of allAssets.values())if(x.kind==='video'){
   try{x.element.pause();}catch{}
  }
 };
 const stopStream=()=>{
  if(stream)for(const t of stream.getTracks()){
   try{t.stop();}catch{}
  }
 };
 try{
  const audioEnabled=!!includeAudio;
  let audioDestination=null;
  if(audioEnabled){
   const C=env.AudioContext||env.webkitAudioContext;
   if(!C)throw Error('오디오가 포함된 영상 저장을 지원하지 않습니다.');
   audioContext=new C();
   await awaitMvAudioPreparation(()=>audioContext.resume(),signal); // initiated by the user's click
  }
  if(signal?.aborted)throw Error('영상 저장을 취소했습니다.');
  drawMvVideoFrame(canvas,plan,allAssets,0,{captions,showCaptions});
  if(audioEnabled){
   const wav=await awaitMvAudioPreparation(renderAudio,signal);
   if(!wav?.size)throw Error('노래 WAV를 생성하지 못했습니다.');
   const raw=await awaitMvAudioPreparation(()=>wav.arrayBuffer(),signal);
   const decoded=await awaitMvAudioPreparation(()=>audioContext.decodeAudioData(raw.slice(0)),signal);
   if(!decoded?.duration)throw Error('생성한 음악을 읽지 못했습니다.');
   audioDestination=audioContext.createMediaStreamDestination();
   audioSource=audioContext.createBufferSource();
   audioSource.buffer=decoded;audioSource.connect(audioDestination);
  }
  if(signal?.aborted)throw Error('영상 저장을 취소했습니다.');
  const mimeType=selectMvWebmType(audioEnabled,type=>env.MediaRecorder.isTypeSupported(type));
  if(!mimeType)throw Error(audioEnabled?'음악 포함 WebM 녹화 코덱을 지원하지 않습니다.':'WebM 녹화 코덱을 지원하지 않습니다.');
  stream=canvas.captureStream(MV_VIDEO_FPS);
  if(!stream.getVideoTracks().length)throw Error('영상 프레임 트랙을 시작하지 못했습니다.');
  if(audioDestination)for(const t of audioDestination.stream.getAudioTracks())stream.addTrack(t);
  recorder=new env.MediaRecorder(stream,{mimeType,videoBitsPerSecond:1500000});
  const chunks=[];
  const result=new Promise((resolve,reject)=>{
   let settled=false,completed=false,startedAt=0;
   const finish=(err,blob)=>{
    if(settled)return;settled=true;
    signal?.removeEventListener('abort',abort);
    if(err)reject(err);else resolve(blob);
   };
   // Settle the actual failure before stopping. A recorder may emit 'stop'
   // synchronously; that event must not replace the original error.
   const fail=error=>{
    if(settled)return;
    finish(error);
    if(recorder&&recorder.state!=='inactive'){
     try{recorder.stop();}catch{}
    }
   };
   const abort=()=>fail(Error('영상 저장을 취소했습니다.'));
   signal?.addEventListener('abort',abort,{once:true});
   recorder.addEventListener('dataavailable',e=>{if(e.data?.size)chunks.push(e.data);});
   recorder.addEventListener('error',e=>fail(Error(e.error?.message||'WebM 영상 인코딩이 실패했습니다.')));
   recorder.addEventListener('stop',()=>{
    if(settled)return;
    const blob=new Blob(chunks,{type:mimeType.split(';')[0]});
    if(!completed||blob.size<100)finish(Error('영상 인코딩이 중단되거나 파일 내용이 없습니다.'));
    else finish(null,blob);
   });
   try{
    recorder.start(1000);
    if(audioSource)audioSource.start(audioContext.currentTime+0.03);
    startedAt=env.performance.now();
    const frame=()=>{
     if(settled||signal?.aborted)return;
     const elapsed=Math.min(plan.durationSec,(env.performance.now()-startedAt)/1000);
     // A scene at exactly durationSec does not exist; rendering it would
     // append an unintended 'empty scene' card as the last WebM frame.
     if(elapsed>=plan.durationSec){
      completed=true;
      stopVideos();
      try{recorder.stop();}catch(e){finish(e);}
      return;
     }
     const scene=findMvVideoScene(plan,elapsed);
     if(scene?.id!==lastSceneId){
      const previous=lastSceneId?plan.scenes.find(s=>s.id===lastSceneId):null;
      const old=previous?.assetId&&allAssets.get(previous.assetId);
      if(old?.kind==='video'){
       // A stale MP4 element must not strand an otherwise valid recording.
       try{old.element.pause();}catch{}
      }
      lastSceneId=scene?.id||'';
      const current=scene?.assetId&&allAssets.get(scene.assetId);
      if(current?.kind==='video'){
       activeVideoId=scene.id;
       try{current.element.currentTime=0;}catch{}
       try{
        const play=current.element.play();
        if(play?.catch)play.catch(()=>fail(Error('저장된 장면 영상 재생이 차단됐습니다.')));
       }catch{
        fail(Error('저장된 장면 영상 재생이 차단됐습니다.'));
        return;
       }
      }else activeVideoId='';
     }
     try{drawMvVideoFrame(canvas,plan,allAssets,elapsed,{captions,showCaptions});}catch(e){
      fail(e);return;
     }
     const percent=Math.min(100,Math.round(elapsed/plan.durationSec*100));
     if(percent!==lastProgress&&percent%2===0){
      lastProgress=percent;
      try{onProgress(percent);}catch(e){fail(e);return;}
     }
     try{frameId=env.requestAnimationFrame(frame);}catch(e){fail(e);}
    };
    frameId=env.requestAnimationFrame(frame);
   }catch(e){finish(e);}
  });
  const blob=await result;
  onProgress(100);
  return {blob,fileName:'MYVOCAL-MusicVideo.webm',seconds:plan.durationSec,mimeType:'video/webm',includesAudio:audioEnabled,includesCaptions:!!showCaptions&&captions.length>0};
 }finally{
  // Frame cancellation is best-effort: failure must not skip media cleanup.
  if(frameId){try{env.cancelAnimationFrame?.(frameId);}catch{}}
  stopVideos();
  // Recorder may already be running when audio startup or frame setup fails.
  // Always release the encoder as well as its media stream on failure.
  if(recorder&&recorder.state!=='inactive'){
   try{recorder.stop();}catch{}
  }
  try{audioSource?.stop();}catch{}
  stopStream();
  if(audioContext)await audioContext.close().catch(()=>{});
 }
}
