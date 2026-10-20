// Project MV timeline -> actual canvas frames. Sources are read-only local
// assets; scenes without media become explicitly labeled storyboard cards.
// Not a generative video, lip-sync, or neural inference engine.
import {auditMvStoryboard} from './mvStoryboard.js';
import {captionAtTime} from './mvLyricCaptions.js';
import {drawMvLipSyncOverlay} from './mvLipSyncOverlay.js';

export const MV_VIDEO_WIDTH=640;
export const MV_VIDEO_HEIGHT=360;
export const MV_VIDEO_FPS=12;
export const MV_VIDEO_MAX_SEC=300;
const roundMs=n=>Math.round(n*1000)/1000;

export function planMvVideoRender(project,characters=[]){
 const audit=auditMvStoryboard(project,characters);
 if(audit.errors)throw Error(`장면 시간/형식 오류 ${audit.errors}개를 수정해야 영상을 만들 수 있습니다.`);
 if(!audit.rows.length)throw Error('내보낼 영상 장면이 없습니다.');
 if(audit.durationSec>MV_VIDEO_MAX_SEC)throw Error('현재 영상 저장은 최대 5분까지 지원합니다.');
 const scenes=audit.rows.map(row=>{
  const original=project.scenes[row.index];
  const clip=original.videoClipAssetId;
  const clipMime=original.videoGeneration?.mime;
  const kind=clip&&(clipMime==='video/mp4'||clipMime==='image/webp')
   ?clipMime==='video/mp4'?'video':'image':'image';
  const assetId=kind==='video'?clip:kind==='image'&&clipMime==='image/webp'?clip:original.imageAssetId||'';
  // A missing media reference must never be mistaken for a new AI-created clip.
  if(clip&&!assetId)throw Error(`${row.title||row.id}: 저장된 영상 형식을 확인해 주세요.`);
  return {id:row.id,start:row.start,end:row.end,title:row.title||'장면',
   description:String(original.description||''),assetId,
   kind:assetId?kind:'card',mime:kind==='video'?'video/mp4':clipMime==='image/webp'&&assetId===clip?'image/webp':'image/*'};
 });
 return {format:'MYVOCAL_WEBM_STORYBOARD',version:1,projectId:project.id,
  durationSec:audit.durationSec,gapSec:audit.gapSeconds,scenes,
  width:MV_VIDEO_WIDTH,height:MV_VIDEO_HEIGHT,fps:MV_VIDEO_FPS,
  mediaScenes:scenes.filter(s=>s.kind!=='card').length,
  cardScenes:scenes.filter(s=>s.kind==='card').length};
}
export function findMvVideoScene(plan,seconds){
 if(!plan||!Array.isArray(plan.scenes)||!Number.isFinite(seconds))throw Error('영상 위치가 올바르지 않습니다.');
 const time=Math.max(0,Math.min(plan.durationSec,roundMs(seconds)));
 return plan.scenes.find(s=>s.start<=time&&time<s.end)||null;
}
export function selectMvSceneVisual(scene){
 return {assetId:scene?.assetId||'',kind:scene?.kind||'card'};
}
const cancelledLoad=()=>Error('영상 저장을 취소했습니다.');
const assertNotAborted=signal=>{if(signal?.aborted)throw cancelledLoad();};
function waitForMedia(el,event,signal){
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{
   el.removeEventListener(event,done);
   el.removeEventListener('error',bad);
   signal?.removeEventListener('abort',abort);
  };
  const done=()=>{cleanup();resolve(el);};
  const bad=()=>{cleanup();reject(Error('영상 또는 이미지 파일을 열지 못했습니다.'));};
  const abort=()=>{cleanup();reject(cancelledLoad());};
  if(signal?.aborted){reject(cancelledLoad());return;}
  el.addEventListener(event,done,{once:true});
  el.addEventListener('error',bad,{once:true});
  signal?.addEventListener('abort',abort,{once:true});
 });
}
function readAssetWithAbort(loadFile,assetId,signal){
 assertNotAborted(signal);
 if(!signal)return loadFile(assetId);
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(cancelledLoad());};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{
   assertNotAborted(signal);
   return loadFile(assetId);
  }).then(
   file=>{signal.removeEventListener('abort',abort);resolve(file);},
   error=>{signal.removeEventListener('abort',abort);reject(error);}
  );
 });
}
// The returned dispose() must be called after preview/export. Original
// IndexedDB records and user files are never changed.
export async function loadMvVideoAssets(plan,{loadFile,signal,createUrl=URL.createObjectURL,revokeUrl=URL.revokeObjectURL,
 createImage=()=>new Image(),createVideo=()=>document.createElement('video')}={}){
 if(typeof loadFile!=='function')throw Error('로컬 미디어 읽기 기능이 없습니다.');
 const assets=new Map(),urls=[];
 let pending=null,disposed=false;
 const dispose=()=>{
  if(disposed)return;
  disposed=true;
  for(const record of [...assets.values(),...(pending?[pending]:[])]){
   if(record.kind==='video'){
    try{record.element.pause();}catch{}
    try{record.element.removeAttribute('src');}catch{}
    try{record.element.load?.();}catch{}
   }else{
    try{record.element.removeAttribute?.('src');}catch{}
   }
  }
  for(const url of urls){try{revokeUrl(url);}catch{}}
 };
 try{
  for(const scene of plan.scenes){
   assertNotAborted(signal);
   if(!scene.assetId)continue;
   if(assets.has(scene.assetId))continue;
   const file=await readAssetWithAbort(loadFile,scene.assetId,signal);
   assertNotAborted(signal);
   if(!file?.size)throw Error(`'${scene.title}' 장면의 저장된 이미지/영상 파일이 없습니다.`);
   const isVideo=scene.kind==='video',type=String(file.type||'');
   if(isVideo && type!=='video/mp4')throw Error(`'${scene.title}' 장면의 MP4 영상 형식이 올바르지 않습니다.`);
   if(!isVideo && !type.startsWith('image/'))throw Error(`'${scene.title}' 장면의 이미지 형식이 올바르지 않습니다.`);
   const url=createUrl(file);urls.push(url);
   const element=isVideo?createVideo():createImage();
   pending={kind:scene.kind,element,url};
   if(isVideo){
    element.muted=true;element.loop=true;element.playsInline=true;element.preload='auto';
    const ready=waitForMedia(element,'loadeddata',signal);
    element.src=url;await ready;
    if(!(element.videoWidth>0&&element.videoHeight>0))throw Error('영상 화면을 읽을 수 없습니다.');
   }else{
    const ready=waitForMedia(element,'load',signal);
    element.src=url;await ready;
    if(!(element.naturalWidth>0&&element.naturalHeight>0))throw Error('이미지 크기를 읽을 수 없습니다.');
   }
   assertNotAborted(signal);
   assets.set(scene.assetId,{kind:scene.kind,element,url});
   pending=null;
  }
  assertNotAborted(signal);
  return {assets,dispose};
 }catch(error){dispose();throw error;}
}
// Preview elements may become stale while scenes change; one failed media
// action must not interrupt playback/cleanup of the other saved clips.
export function pauseMvPreviewClip(video){
 try{video?.pause?.();}catch{}
}
export function playMvPreviewClip(video){
 try{
  const playback=video?.play?.();
  if(playback?.catch)playback.catch(()=>{});
 }catch{}
}
// A saved MP4 can be used in more than one scene. Sync each media element
// once, otherwise a later inactive scene pauses the currently active clip.
export function syncMvPreviewClips(scenes,assets,activeScene,playing,positionSeconds){
 const handled=new Set();
 for(const scene of scenes){
  if(scene.kind!=='video'||!scene.assetId||handled.has(scene.assetId))continue;
  handled.add(scene.assetId);
  const video=assets.get(scene.assetId)?.element;
  if(!video)continue;
  if(activeScene?.kind==='video'&&activeScene.assetId===scene.assetId){
   if(!playing){
    pauseMvPreviewClip(video);
    const sec=Math.max(0,(Number(positionSeconds)||0)-activeScene.start);
    if(Number.isFinite(video.duration)&&video.duration>0&&Math.abs(video.currentTime-(sec%video.duration))>.2){
     try{video.currentTime=sec%video.duration;}catch{}
    }
   }else if(video.paused)playMvPreviewClip(video);
  }else pauseMvPreviewClip(video);
 }
}
const frameTitle=(s)=>String(s||'장면').replace(/[\u0000-\u001f\u007f]+/g,' ').slice(0,75);
function cover(ctx,source,width,height){
 const sw=source.videoWidth||source.naturalWidth||0,sh=source.videoHeight||source.naturalHeight||0;
 if(!(sw>0&&sh>0))return false;
 const ratio=Math.max(width/sw,height/sh),outW=sw*ratio,outH=sh*ratio;
 ctx.drawImage(source,(width-outW)/2,(height-outH)/2,outW,outH);
 return true;
}
export function drawMvVideoFrame(canvas,plan,assets,seconds,{captions=[],showCaptions=false,lipSyncOverlays=null}={}){
 const ctx=canvas?.getContext?.('2d'),width=canvas?.width,height=canvas?.height;
 if(!ctx||!(width>0&&height>0))throw Error('영상을 그릴 화면이 없습니다.');
 const scene=findMvVideoScene(plan,seconds);
 ctx.fillStyle='#111623';ctx.fillRect(0,0,width,height);
 const record=scene?.assetId?assets?.get(scene.assetId):null;
 let imageReady=false;
 if(record){
  if(record.kind==='video')imageReady=record.element.readyState>=2&&cover(ctx,record.element,width,height);
  else imageReady=cover(ctx,record.element,width,height);
 }
 if(!imageReady){
  ctx.fillStyle='#202c40';ctx.fillRect(0,0,width,height);
  ctx.textAlign='center';ctx.fillStyle='#afbacb';
  ctx.font='20px sans-serif';
  ctx.fillText(scene?'스토리보드 장면 · 이미지 없음':'장면 공백',width/2,height/2-7);
  ctx.textAlign='left';
 }
 // A timed mouth shape is burned into the actual image/video frame only
 // when the character's source media is visible and manual placement is enabled.
 if(imageReady&&scene&&lipSyncOverlays)
  drawMvLipSyncOverlay(ctx,lipSyncOverlays,scene.id,seconds,width,height);
 if(scene){
  const overlay=ctx.createLinearGradient(0,height-88,0,height);
  overlay.addColorStop(0,'rgba(0,0,0,0)');overlay.addColorStop(1,'rgba(0,0,0,.88)');
  ctx.fillStyle=overlay;ctx.fillRect(0,height-88,width,88);
  ctx.fillStyle='#ffffff';ctx.font='bold 20px sans-serif';
  ctx.textAlign='left';ctx.fillText(frameTitle(scene.title),22,height-40,width-44);
  ctx.font='13px sans-serif';ctx.fillStyle='#dee4ee';
  ctx.fillText(`${scene.start.toFixed(2)}s — ${scene.end.toFixed(2)}s`,22,height-17,width-44);
 }
 const caption=showCaptions?captionAtTime(captions,seconds):null;
 if(caption?.text){
  // Burn the exact saved lyric phrase, including long user-edited text.
  // Canvas and WebM use identical cue timing; this is not phoneme alignment.
  const chars=Array.from(String(caption.text));
  const lines=[];
  for(let i=0;i<chars.length;i+=28)lines.push(chars.slice(i,i+28).join(''));
  const fontSize=lines.length>1?18:25,step=lines.length>1?23:30;
  const bandHeight=lines.length*step+14,top=Math.max(12,height-108-bandHeight);
  ctx.fillStyle='rgba(5,9,18,.84)';
  ctx.fillRect(15,top,width-30,bandHeight);
  ctx.textAlign='center';ctx.font=`bold ${fontSize}px sans-serif`;ctx.fillStyle='#ffffff';
  lines.forEach((line,index)=>ctx.fillText(line,width/2,top+step*(index+1),width-46));
  ctx.textAlign='left';
 }
 return scene?.id||null;
}
