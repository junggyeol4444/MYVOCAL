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
 const stopVideos=()=>{for(const x of allAssets.values())if(x.kind==='video')x.element.pause();};
 const stopStream=()=>{if(stream)stream.getTracks().forEach(t=>t.stop());};
 try{
  const audioEnabled=!!includeAudio;
  let audioDestination=null;
  if(audioEnabled){
   const C=env.AudioContext||env.webkitAudioContext;
   if(!C)throw Error('오디오가 포함된 영상 저장을 지원하지 않습니다.');
   audioContext=new C();
   await audioContext.resume(); // initiated by the user's click, not background work
  }
  if(signal?.aborted)throw Error('영상 저장을 취소했습니다.');
  drawMvVideoFrame(canvas,plan,allAssets,0,{captions,showCaptions});
  if(audioEnabled){
   const wav=await renderAudio();
   if(!wav?.size)throw Error('노래 WAV를 생성하지 못했습니다.');
   const raw=await wav.arrayBuffer();
   const decoded=await audioContext.decodeAudioData(raw.slice(0));
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
   const abort=()=>{
    if(!recorder||recorder.state==='inactive'){finish(Error('영상 저장을 취소했습니다.'));return;}
    try{recorder.stop();}catch{}
    finish(Error('영상 저장을 취소했습니다.'));
   };
   signal?.addEventListener('abort',abort,{once:true});
   recorder.addEventListener('dataavailable',e=>{if(e.data?.size)chunks.push(e.data);});
   recorder.addEventListener('error',e=>finish(Error(e.error?.message||'WebM 영상 인코딩이 실패했습니다.')));
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
     const scene=findMvVideoScene(plan,elapsed);
     if(scene?.id!==lastSceneId){
      const previous=lastSceneId?plan.scenes.find(s=>s.id===lastSceneId):null;
      const old=previous?.assetId&&allAssets.get(previous.assetId);
      if(old?.kind==='video')old.element.pause();
      lastSceneId=scene?.id||'';
      const current=scene?.assetId&&allAssets.get(scene.assetId);
      if(current?.kind==='video'){
       activeVideoId=scene.id;
       try{current.element.currentTime=0;}catch{}
       const play=current.element.play();
       if(play?.catch)play.catch(()=>{if(!settled){try{recorder.stop();}catch{}finish(Error('저장된 장면 영상 재생이 차단됐습니다.'));}});
      }else activeVideoId='';
     }
     try{drawMvVideoFrame(canvas,plan,allAssets,elapsed,{captions,showCaptions});}catch(e){
      try{recorder.stop();}catch{}
      finish(e);return;
     }
     const percent=Math.min(100,Math.round(elapsed/plan.durationSec*100));
     if(percent!==lastProgress&&percent%2===0){lastProgress=percent;onProgress(percent);}
     if(elapsed>=plan.durationSec){
      completed=true;
      stopVideos();
      try{recorder.stop();}catch(e){finish(e);}
     }else frameId=env.requestAnimationFrame(frame);
    };
    frameId=env.requestAnimationFrame(frame);
   }catch(e){finish(e);}
  });
  const blob=await result;
  onProgress(100);
  return {blob,fileName:'MYVOCAL-MusicVideo.webm',seconds:plan.durationSec,mimeType:'video/webm',includesAudio:audioEnabled,includesCaptions:!!showCaptions&&captions.length>0};
 }finally{
  if(frameId)env.cancelAnimationFrame?.(frameId);
  stopVideos();
  try{audioSource?.stop();}catch{}
  stopStream();
  if(audioContext)await audioContext.close().catch(()=>{});
 }
}
