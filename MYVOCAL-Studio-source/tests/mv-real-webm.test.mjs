import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newProject} from '../src/lib/schema.js';
import {planMvVideoRender,findMvVideoScene,drawMvVideoFrame,loadMvVideoAssets,pauseMvPreviewClip,playMvPreviewClip,syncMvPreviewClips,MV_VIDEO_WIDTH,MV_VIDEO_HEIGHT,MV_VIDEO_FPS} from '../src/lib/mvVideoRender.js';
import {selectMvWebmType,assertMvExportEnvironment,recordMvWebm} from '../src/lib/mvWebmRecorder.js';

function project(){
 const p=newProject({title:'MV 노래'});
 p.scenes=[
  {id:'intro',start:0,end:4,title:'Intro',description:'intro',characterId:'',imageAssetId:'intro-image'},
  {id:'chorus',start:4,end:9,title:'Chorus',description:'chorus',characterId:'',videoClipAssetId:'clip-mp4',videoGeneration:{mime:'video/mp4'}},
  {id:'outro',start:9,end:12,title:'Outro',description:'outro',characterId:''}
 ];
 return p;
}
test('whole MV plan uses stored image, actual MP4 clip and honest card where media is missing',()=>{
 const p=project(),plan=planMvVideoRender(p);
 assert.equal(plan.durationSec,12);
 assert.equal(plan.scenes.length,3);
 assert.equal(plan.mediaScenes,2);assert.equal(plan.cardScenes,1);
 assert.deepEqual(plan.scenes.map(s=>s.kind),['image','video','card']);
 assert.deepEqual(plan.scenes.map(s=>s.assetId),['intro-image','clip-mp4','']);
 assert.deepEqual([plan.width,plan.height,plan.fps],[640,360,12]);
 assert.equal(JSON.stringify(plan).includes('original_audio'),false);
 assert.ok(MV_VIDEO_WIDTH>0&&MV_VIDEO_HEIGHT>0&&MV_VIDEO_FPS>0);
});
test('song timing is respected on every scene boundary and after end',()=>{
 const plan=planMvVideoRender(project());
 assert.equal(findMvVideoScene(plan,0).id,'intro');
 assert.equal(findMvVideoScene(plan,3.999).id,'intro');
 assert.equal(findMvVideoScene(plan,4).id,'chorus');
 assert.equal(findMvVideoScene(plan,8.999).id,'chorus');
 assert.equal(findMvVideoScene(plan,9).id,'outro');
 assert.equal(findMvVideoScene(plan,12),null);
});
test('editing scene timing changes the render without mutating the original project',()=>{
 const p=project(),before=structuredClone(p);
 const plan=planMvVideoRender({...p,scenes:p.scenes.map((s,i)=>i===1?{...s,end:9.5}:i===2?{...s,start:9.5}:s)});
 assert.equal(plan.scenes[1].end,9.5);
 assert.equal(findMvVideoScene(plan,9.2)?.id,'chorus');
 assert.deepEqual(p,before);
});
test('no fake video claimed; invalid overlaps and unsupported duration are blocked',()=>{
 assert.throws(()=>planMvVideoRender({...project(),scenes:[{id:'a',start:0,end:5,title:'a'},{id:'b',start:4,end:6,title:'b'}]}),/오류/);
 assert.throws(()=>planMvVideoRender({...project(),scenes:[{id:'long',start:0,end:301,title:'long'}]}),/5분/);
 assert.throws(()=>planMvVideoRender({...project(),scenes:[]}),/장면/);
});
test('animated webp clip uses real saved asset, not an invented video',()=>{
 const p=project();
 p.scenes[1].videoGeneration.mime='image/webp';
 const plan=planMvVideoRender(p);
 assert.equal(plan.scenes[1].assetId,'clip-mp4');
 assert.equal(plan.scenes[1].kind,'image');
 assert.equal(plan.scenes[1].mime,'image/webp');
});
test('canvas paints scene image, video and empty card with a visible label',()=>{
 const plan=planMvVideoRender(project());
 const calls=[];
 const g={fillStyle:'',font:'',textAlign:'',
  fillRect:(...args)=>calls.push(['fillRect',...args]),
  drawImage:(...args)=>calls.push(['drawImage',...args]),
  fillText:(...args)=>calls.push(['fillText',...args]),
  createLinearGradient:()=>({addColorStop(){}})
 };
 const canvas={width:640,height:360,getContext:()=>g};
 const map=new Map([['intro-image',{kind:'image',element:{naturalWidth:400,naturalHeight:200}}],
 ['clip-mp4',{kind:'video',element:{readyState:4,videoWidth:1920,videoHeight:1080}}]]);
 assert.equal(drawMvVideoFrame(canvas,plan,map,1),'intro');
 assert.equal(drawMvVideoFrame(canvas,plan,map,5),'chorus');
 assert.equal(drawMvVideoFrame(canvas,plan,map,10),'outro');
 assert.ok(calls.some(c=>c[0]==='drawImage'));
 assert.ok(calls.some(c=>c[0]==='fillText'&&c[1].includes('이미지 없음')));
});
test('WebM encoder MIME negotiation never labels MP4 as WebM',()=>{
 const supported=new Set(['video/webm;codecs=vp8,opus','video/webm;codecs=vp8']);
 assert.equal(selectMvWebmType(true,t=>supported.has(t)),'video/webm;codecs=vp8,opus');
 assert.equal(selectMvWebmType(false,t=>supported.has(t)),'video/webm;codecs=vp8');
 assert.equal(selectMvWebmType(true,()=>false),'');
 assert.throws(()=>assertMvExportEnvironment({}),/WebM/);
});
test('recording cannot falsely succeed without a WebM encoder',async()=>{
 const p=planMvVideoRender(project());
 await assert.rejects(recordMvWebm(p,{assets:new Map()},{env:{MediaRecorder:{isTypeSupported:()=>false},requestAnimationFrame:()=>{}},canvasFactory:()=>({width:0,height:0,captureStream:()=>({})})}),/영상을 그릴 화면|WebM/);
});
test('Video page wires real canvas renderer and WebM music mixer into existing studio',()=>{
 const page=readFileSync(new URL('../src/pages/Video.jsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/components/MvVideoExporter.jsx',import.meta.url),'utf8');
 for(const text of ['MvVideoExporter','positionSeconds={animaticPosition}','playing={animaticPlaying}'])assert.ok(page.includes(text),text);
 for(const text of ['recordMvWebm','loadMvVideoAssets','drawMvVideoFrame','mixdownWav','전체 MV WebM 저장','저장 취소'])assert.ok(component.includes(text),text);
});

test('WebM recorder actually captures a whole video timeline and returns recorded bytes',async()=>{
 let ms=0,stops=0,frames=0,videoStarted=0;
 const events=[];
 class Recorder {
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(stream,options){this.stream=stream;this.options=options;this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,e={}){for(const fn of this.listeners[name]||[])fn(e);}
  start(){this.state='recording';}
  stop(){this.state='inactive';stops++;this.emit('dataavailable',{data:new Blob(['real-recorded-webm-data-not-just-json'.repeat(12)])});this.emit('stop');}
 }
 const context={fillRect(){},drawImage(){frames++;},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const tracks=[{stop(){}}];
 const canvas={width:0,height:0,getContext:()=>context,captureStream:()=>({getVideoTracks:()=>tracks,getTracks:()=>tracks})};
 const media=new Map([['intro-image',{kind:'image',element:{naturalWidth:400,naturalHeight:200}}],
 ['clip-mp4',{kind:'video',element:{readyState:4,videoWidth:1280,videoHeight:720,paused:true,play(){videoStarted++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},currentTime:0}}]]);
 const env={
  MediaRecorder:Recorder,performance:{now:()=>ms},
  requestAnimationFrame:fn=>{ms+=500;queueMicrotask(fn);return ms;},
  cancelAnimationFrame(){}
 };
 const plan=planMvVideoRender(project());
 const result=await recordMvWebm(plan,{assets:media},{env,canvasFactory:()=>canvas,onProgress:n=>events.push(n)});
 assert.equal(result.seconds,12);
 assert.equal(result.mimeType,'video/webm');
 assert.equal(result.includesAudio,false);
 assert.ok(result.blob.size>20);
 assert.equal(stops,1);
 assert.ok(videoStarted>0);
 assert.ok(frames>0);
 assert.ok(events.includes(100));
});
test('cancelled WebM export never produces a fake successful file',async()=>{
 const controller=new AbortController();controller.abort();
 const plan=planMvVideoRender(project());
 await assert.rejects(recordMvWebm(plan,{assets:new Map()},{signal:controller.signal,env:{MediaRecorder:{isTypeSupported:()=>true},requestAnimationFrame(){}},canvasFactory:()=>({captureStream(){}})}),/취소/);
});

test('recorded WebM includes the real existing music mix as an audio stream',async()=>{
 let ms=0,addedAudio=0,startedAudio=0;
 const mediaStream={tracks:[{kind:'video',stop(){}}],getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');},getTracks(){return this.tracks;},addTrack(t){this.tracks.push(t);addedAudio++;}};
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8,opus';}
  constructor(stream){this.stream=stream;this.state='inactive';this.listeners={};}
  addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}
  emit(n,e={}){(this.listeners[n]||[]).forEach(fn=>fn(e));}
  start(){this.state='recording';assert.equal(this.stream.getTracks().length,2);}
  stop(){this.state='inactive';this.emit('dataavailable',{data:new Blob(['recorded-webm-video-audio-data'.repeat(12)])});this.emit('stop');}
 }
 class AudioContext{
  currentTime=0;
  async resume(){}
  async decodeAudioData(data){assert.ok(data.byteLength>0);return {duration:12};}
  createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[{kind:'audio',stop(){}}]}};}
  createBufferSource(){return {buffer:null,connect(){},start(){startedAudio++;},stop(){}};}
  async close(){}
 }
 const context={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const canvas={width:0,height:0,getContext:()=>context,captureStream:()=>mediaStream};
 const env={MediaRecorder:Recorder,AudioContext,performance:{now:()=>ms},requestAnimationFrame:fn=>{ms+=500;queueMicrotask(fn);return ms;},cancelAnimationFrame(){}};
 const plan=planMvVideoRender(project()),assets=new Map();
 const result=await recordMvWebm(plan,{assets},{
  includeAudio:true,renderAudio:async()=>new Blob([new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69])]),
  env,canvasFactory:()=>canvas
 });
 assert.equal(addedAudio,1);
 assert.equal(startedAudio,1);
 assert.equal(result.includesAudio,true);
 assert.equal(result.mimeType,'video/webm');
 assert.ok(result.blob.size>10);
});

test('WebM recording releases the active encoder and all tracks when audio startup fails',async()=>{
 let encoderStops=0,trackStops=0,contextCloses=0;
 const stream={
  tracks:[{kind:'video',stop(){trackStops++;}}],
  getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');},
  getTracks(){return this.tracks;},
  addTrack(track){this.tracks.push(track);}
 };
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8,opus';}
  constructor(){this.state='inactive';}
  addEventListener(){}
  start(){this.state='recording';}
  stop(){this.state='inactive';encoderStops++;}
 }
 class AudioContext{
  currentTime=0;
  async resume(){}
  async decodeAudioData(){return {duration:12};}
  createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[{kind:'audio',stop(){trackStops++;}}]}};}
  createBufferSource(){return {connect(){},start(){throw Error('audio-start-test-failure');},stop(){}};}
  async close(){contextCloses++;}
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const canvas={getContext:()=>ctx,captureStream:()=>stream};
 const env={MediaRecorder:Recorder,AudioContext,performance:{now:()=>0},
  requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 await assert.rejects(recordMvWebm(planMvVideoRender(project()),{assets:new Map()},{
  includeAudio:true,renderAudio:async()=>new Blob([new Uint8Array([1,2,3])]),
  env,canvasFactory:()=>canvas
 }),/audio-start-test-failure/);
 assert.equal(encoderStops,1,'a started MediaRecorder must be stopped on failure');
 assert.equal(trackStops,2,'both captured video and audio tracks must be released');
 assert.equal(contextCloses,1,'the audio context must also be closed');
});

test('cancelled MV export stops waiting for a pending IndexedDB media read',async()=>{
 const p=project(),before=structuredClone(p),plan=planMvVideoRender(p);
 const controller=new AbortController();
 const pending=loadMvVideoAssets(plan,{
  signal:controller.signal,
  loadFile:()=>new Promise(()=>{})
 });
 controller.abort();
 await assert.rejects(pending,/취소/);
 assert.deepEqual(p,before,'cancellation must not mutate the source project');
});
test('cancelling while a scene clip loads releases the pending player and object URL',async()=>{
 const plan=planMvVideoRender(project());
 const videoScene=plan.scenes.find(s=>s.kind==='video');
 const controller=new AbortController();
 let started;
 const playerReady=new Promise(resolve=>{started=resolve;});
 let paused=0,removed=0,reloaded=0,revoked=0;
 const video=new EventTarget();
 video.pause=()=>{paused++;};
 video.removeAttribute=name=>{if(name==='src')removed++;};
 video.load=()=>{reloaded++;};
 const pending=loadMvVideoAssets({...plan,scenes:[videoScene]},{
  signal:controller.signal,
  loadFile:async()=>new Blob(['clip'],{type:'video/mp4'}),
  createUrl:()=> 'blob:test-scene-video',
  revokeUrl:url=>{assert.equal(url,'blob:test-scene-video');revoked++;},
  createVideo:()=>{started();return video;}
 });
 await playerReady;
 controller.abort();
 await assert.rejects(pending,/취소/);
 assert.equal(paused,1);
 assert.equal(removed,1);
 assert.equal(reloaded,1);
 assert.equal(revoked,1);
});
test('MV export and preview both pass cancellation signals to scene media loader',()=>{
 const ui=readFileSync(new URL('../src/components/MvVideoExporter.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes('loadMvVideoAssets(plan,{loadFile:getFile,signal:controller.signal})'));
 assert.ok(ui.includes('controller.abort();resources?.dispose()'));
});

test('cancelling while existing WAV mixdown is pending releases audio resources immediately',async()=>{
 const controller=new AbortController();
 let started;
 const mixing=new Promise(resolve=>{started=resolve;});
 let audioCloses=0,mediaStarted=0,sourceProject=project();
 const original=structuredClone(sourceProject);
 class AudioContext{
  async resume(){}
  async close(){audioCloses++;}
 }
 const env={MediaRecorder:{isTypeSupported:()=>true},AudioContext,requestAnimationFrame(){}};
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const canvas={getContext:()=>ctx,captureStream(){mediaStarted++;throw Error('recording should not start');}};
 const pending=recordMvWebm(planMvVideoRender(sourceProject),{assets:new Map()},{
  includeAudio:true,renderAudio:()=>{started();return new Promise(()=>{});},
  signal:controller.signal,env,canvasFactory:()=>canvas
 });
 await mixing;
 controller.abort();
 await assert.rejects(pending,/영상 저장을 취소했습니다/);
 assert.equal(audioCloses,1,'AudioContext closes after cancelling pending sound preparation');
 assert.equal(mediaStarted,0,'WebM recording must not start after cancellation');
 assert.deepEqual(sourceProject,original,'original project is not mutated');
});

test('cancelling while AudioContext decode is pending does not wait for decoder',async()=>{
 const controller=new AbortController();
 let decoding;
 const started=new Promise(resolve=>{decoding=resolve;});
 let closes=0,recorderStarted=0;
 class AudioContext{
  async resume(){}
  decodeAudioData(){decoding();return new Promise(()=>{});}
  async close(){closes++;}
 }
 const env={MediaRecorder:{isTypeSupported:()=>true},AudioContext,requestAnimationFrame(){}};
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const pending=recordMvWebm(planMvVideoRender(project()),{assets:new Map()},{
  includeAudio:true,renderAudio:async()=>new Blob([new Uint8Array([1,2,3])]),
  signal:controller.signal,env,canvasFactory:()=>({
   getContext:()=>ctx,captureStream(){recorderStarted++;throw Error('unexpected recording');}
  })
 });
 await started;
 controller.abort();
 await assert.rejects(pending,/영상 저장을 취소했습니다/);
 assert.equal(closes,1);
 assert.equal(recorderStarted,0);
});

test('synchronous MP4 play failure rejects WebM export and stops encoder and tracks',async()=>{
 let elapsed=0,encoderStops=0,trackStops=0,videoPauses=0;
 const listeners={};
 class Recorder{
  static isTypeSupported(t){return t==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';}
  addEventListener(name,cb){(listeners[name]??=[]).push(cb);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   for(const callback of listeners.stop||[])callback();
  }
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const stream={getVideoTracks:()=>[{kind:'video'}],getTracks:()=>[{stop(){trackStops++;}}]};
 const canvas={getContext:()=>ctx,captureStream:()=>stream};
 const media=new Map([
  ['intro-image',{kind:'image',element:{naturalWidth:400,naturalHeight:200}}],
  ['clip-mp4',{kind:'video',element:{
   readyState:4,videoWidth:640,videoHeight:360,
   currentTime:0,play(){throw Error('MP4 playback blocked');},
   pause(){videoPauses++;}
  }}]
 ]);
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:cb=>{elapsed+=500;queueMicrotask(cb);return elapsed;},
  cancelAnimationFrame(){}};
 await assert.rejects(recordMvWebm(planMvVideoRender(project()),{assets:media},{
  env,canvasFactory:()=>canvas
 }),/저장된 장면 영상 재생이 차단됐습니다/);
 assert.equal(encoderStops,1,'encoder must be stopped once');
 assert.equal(trackStops,1,'captured video track must be released');
 assert.ok(videoPauses>0,'scene video must be stopped');
});

test('export progress handler failure stops recording rather than leaving it running',async()=>{
 let elapsed=0,encoderStops=0,trackStops=0;
 const listeners={};
 class Recorder{
  static isTypeSupported(t){return t==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';}
  addEventListener(name,cb){(listeners[name]??=[]).push(cb);}
  start(){this.state='recording';}
  stop(){this.state='inactive';encoderStops++;for(const cb of listeners.stop||[])cb();}
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:cb=>{elapsed+=500;queueMicrotask(cb);return elapsed;},
  cancelAnimationFrame(){}};
 await assert.rejects(recordMvWebm(planMvVideoRender(project()),{assets:new Map()},{
  env,canvasFactory:()=>({getContext:()=>ctx,captureStream:()=>({
   getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]
  })}),
  onProgress(){throw Error('progress-callback-failed');}
 }),/progress-callback-failed/);
 assert.equal(encoderStops,1);
 assert.equal(trackStops,1);
});

test('a failing video pause cannot strand the WebM recorder at a scene change',async()=>{
 let elapsed=0,stops=0,trackStops=0,plays=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';stops++;
   this.emit('dataavailable',{data:new Blob(['webm-encoded-frames'.repeat(20)])});
   this.emit('stop');
  }
 }
 const video={readyState:4,videoWidth:640,videoHeight:360,currentTime:0,
  play(){plays++;return Promise.resolve();},
  pause(){throw Error('stale video element cannot pause');}
 };
 const context={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=500;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}};
 const result=await recordMvWebm(planMvVideoRender(project()),{
  assets:new Map([['clip-mp4',{kind:'video',element:video}]])
 },{
  env,canvasFactory:()=>({
   getContext:()=>context,
   captureStream:()=>({getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]})
  })
 });
 assert.ok(result.blob.size>100);
 assert.ok(plays>0,'video scene was played');
 assert.equal(stops,1,'encoder completed despite rejected pause');
 assert.equal(trackStops,1,'video track was released');
});

test('one failing media track stop does not hide saved WebM or leak remaining tracks',async()=>{
 let elapsed=0,stops=0,otherStops=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';stops++;
   this.emit('dataavailable',{data:new Blob(['encoded-video'.repeat(30)])});
   this.emit('stop');
  }
 }
 const context={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}};
 const result=await recordMvWebm(planMvVideoRender(project()),{assets:new Map()},{
  env,canvasFactory:()=>({
   getContext:()=>context,
   captureStream:()=>({
    getVideoTracks:()=>[{}],
    getTracks:()=>[
     {stop(){throw Error('track already closed');}},
     {stop(){otherStops++;}}
    ]
   })
  })
 });
 assert.ok(result.blob.size>100);
 assert.equal(stops,1);
 assert.equal(otherStops,1,'later tracks must still be closed');
});

test('WebM completion never paints an unintended empty scene card at the exact end time',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,trackStops=0;
 const labels=[];
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['recorded-frame-data'.repeat(20)])});
   this.emit('stop');
  }
 }
 const ctx={
  fillRect(){},drawImage(){},createLinearGradient:()=>({addColorStop(){}}),
  fillText(value){labels.push(String(value));}
 };
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:callback=>{elapsed+=1000;queueMicrotask(callback);return elapsed;},
  cancelAnimationFrame(){}};
 const result=await recordMvWebm(plan,{assets:new Map()},{
  env,canvasFactory:()=>({
   getContext:()=>ctx,
   captureStream:()=>({getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]})
  })
 });
 assert.equal(result.seconds,12);
 assert.equal(encoderStops,1);
 assert.equal(trackStops,1);
 assert.ok(labels.includes('Outro'),'final actual scene is rendered');
 assert.ok(!labels.includes('장면 공백'),'no extra blank title is burned in after last scene');
 assert.deepEqual(p,original,'project remains unchanged');
});

test('MV asset disposal cleans every source and URL after a failed player pause',async()=>{
 const p=project(),before=structuredClone(p),plan=planMvVideoRender(p);
 const removed=[],revoked=[],reloaded=[];
 const image=new EventTarget();
 image.naturalWidth=400;image.naturalHeight=200;
 image.removeAttribute=()=>{throw Error('image already detached');};
 const video=new EventTarget();
 video.videoWidth=640;video.videoHeight=360;
 video.pause=()=>{throw Error('video player already stopped');};
 video.removeAttribute=name=>removed.push(name);
 video.load=()=>reloaded.push('video');
 const prepared=await loadMvVideoAssets(plan,{
  loadFile:async id=>new Blob(['saved-media'],{type:id==='clip-mp4'?'video/mp4':'image/png'}),
  createUrl:file=>file.type==='video/mp4'?'blob:clip':'blob:still',
  revokeUrl:url=>{revoked.push(url);if(url==='blob:still')throw Error('already revoked');},
  createImage:()=>{queueMicrotask(()=>image.dispatchEvent(new Event('load')));return image;},
  createVideo:()=>{queueMicrotask(()=>video.dispatchEvent(new Event('loadeddata')));return video;}
 });
 assert.equal(prepared.assets.size,2);
 assert.doesNotThrow(()=>prepared.dispose());
 assert.deepEqual(removed,['src']);
 assert.deepEqual(reloaded,['video']);
 assert.deepEqual(revoked,['blob:still','blob:clip']);
 prepared.dispose();
 assert.equal(revoked.length,2);
 assert.deepEqual(p,before);
});
test('cancelled pending MP4 detaches source even if pause throws',async()=>{
 const scene=planMvVideoRender(project()).scenes.find(x=>x.kind==='video');
 const controller=new AbortController();
 let created;
 const playerCreated=new Promise(resolve=>{created=resolve;});
 const removed=[],revoked=[];
 const video=new EventTarget();
 video.pause=()=>{throw Error('cannot pause unready video');};
 video.removeAttribute=name=>removed.push(name);
 video.load=()=>{};
 const pending=loadMvVideoAssets({scenes:[scene]},{
  signal:controller.signal,
  loadFile:async()=>new Blob(['saved-video'],{type:'video/mp4'}),
  createUrl:()=> 'blob:pending',
  revokeUrl:url=>revoked.push(url),
  createVideo:()=>{created();return video;}
 });
 await playerCreated;
 controller.abort();
 await assert.rejects(pending,/취소/);
 assert.deepEqual(removed,['src']);
 assert.deepEqual(revoked,['blob:pending']);
});


test('failed animation frame scheduling rejects export and releases encoder tracks',async()=>{
 let schedules=0,encoderStops=0,trackStops=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  start(){this.state='recording';}
  stop(){this.state='inactive';encoderStops++;for(const fn of this.listeners.stop||[])fn();}
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,performance:{now:()=>500},
  requestAnimationFrame:fn=>{
   schedules++;
   if(schedules===2)throw Error('animation frame scheduler unavailable');
   queueMicrotask(fn);return schedules;
  },cancelAnimationFrame(){}
 };
 await assert.rejects(recordMvWebm(planMvVideoRender(project()),{assets:new Map()},{
  env,canvasFactory:()=>({getContext:()=>ctx,captureStream:()=>({
   getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]
  })})
 }),/animation frame scheduler unavailable/);
 assert.equal(schedules,2);
 assert.equal(encoderStops,1,'active recorder must stop after frame scheduling failure');
 assert.equal(trackStops,1,'captured stream must be released');
});

test('failed animation frame cancellation does not lose completed WebM or skip track cleanup',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,trackStops=0,cancelAttempts=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['recorded-webm-data'.repeat(25)])});
   this.emit('stop');
  }
 }
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){cancelAttempts++;throw Error('frame already released');}
 };
 const result=await recordMvWebm(plan,{assets:new Map()},{
  env,canvasFactory:()=>({
   getContext:()=>({fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})}),
   captureStream:()=>({getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]})
  })
 });
 assert.ok(result.blob.size>100,'recorded WebM must remain available');
 assert.equal(encoderStops,1);
 assert.equal(cancelAttempts,1);
 assert.equal(trackStops,1,'video track must be stopped even if frame cancellation throws');
 assert.deepEqual(p,original,'original project must remain unchanged');
});

test('a synchronous AudioContext close error preserves finished WebM and releases media',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,trackStops=0,contextCloses=0;
 const tracks=[{kind:'video',stop(){trackStops++;}}];
 const stream={
  getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),
  getTracks:()=>tracks,addTrack:t=>tracks.push(t)
 };
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8,opus';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['recorded-webm-with-audio'.repeat(20)])});
   this.emit('stop');
  }
 }
 class AudioContext{
  currentTime=0;
  async resume(){}
  async decodeAudioData(){return {duration:12};}
  createMediaStreamDestination(){
   return {stream:{getAudioTracks:()=>[{kind:'audio',stop(){trackStops++;}}]}};
  }
  createBufferSource(){return {connect(){},start(){},stop(){}};}
  close(){contextCloses++;throw Error('audio context already disposed');}
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,AudioContext,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}
 };
 const result=await recordMvWebm(plan,{assets:new Map()},{
  includeAudio:true,renderAudio:async()=>new Blob([new Uint8Array([82,73,70,70])]),
  env,canvasFactory:()=>({getContext:()=>ctx,captureStream:()=>stream})
 });
 assert.ok(result.blob.size>100,'completed WebM must not be discarded by cleanup');
 assert.equal(result.includesAudio,true);
 assert.equal(encoderStops,1);
 assert.equal(trackStops,2,'both video and audio tracks must be released');
 assert.equal(contextCloses,1);
 assert.deepEqual(p,original,'the original project must remain unchanged');
});

test('completed WebM survives an exception from the final progress callback',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,trackStops=0,completionCalls=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['completed-webm-data'.repeat(25)])});
   this.emit('stop');
  }
 }
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}
 };
 const result=await recordMvWebm(plan,{assets:new Map()},{
  env,canvasFactory:()=>({
   getContext:()=>({fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})}),
   captureStream:()=>({getVideoTracks:()=>[{}],getTracks:()=>[{stop(){trackStops++;}}]})
  }),
  onProgress(percent){if(percent===100){completionCalls++;throw Error('progress panel already disposed');}}
 });
 assert.ok(result.blob.size>100,'successful recording bytes must still be returned');
 assert.equal(result.mimeType,'video/webm');
 assert.equal(completionCalls,1,'final completion update was attempted');
 assert.equal(encoderStops,1);
 assert.equal(trackStops,1,'media tracks must be released');
 assert.deepEqual(p,original,'source project remains unchanged');
});

test('completed music WebM returns even when AudioContext.close never settles',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,trackStops=0,closeCalls=0;
 const tracks=[{kind:'video',stop(){trackStops++;}}];
 const stream={
  getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),
  getTracks:()=>tracks,
  addTrack:t=>tracks.push(t)
 };
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8,opus';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['encoded-music-video'.repeat(24)])});
   this.emit('stop');
  }
 }
 class AudioContext{
  currentTime=0;
  async resume(){}
  async decodeAudioData(){return {duration:12};}
  createMediaStreamDestination(){
   return {stream:{getAudioTracks:()=>[{kind:'audio',stop(){trackStops++;}}]}};
  }
  createBufferSource(){return {connect(){},start(){},stop(){}};}
  close(){closeCalls++;return new Promise(()=>{});}
 }
 const ctx={fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})};
 const env={MediaRecorder:Recorder,AudioContext,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}};
 let timer;
 try{
  const result=await Promise.race([
   recordMvWebm(plan,{assets:new Map()},{
    includeAudio:true,renderAudio:async()=>new Blob([new Uint8Array([82,73,70,70])]),
    env,canvasFactory:()=>({getContext:()=>ctx,captureStream:()=>stream})
   }),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('AudioContext.close blocked completed WebM')),750);})
  ]);
  assert.ok(result.blob.size>100,'the already encoded WebM must be returned');
  assert.equal(result.includesAudio,true);
  assert.equal(encoderStops,1,'recorder must be stopped');
  assert.equal(trackStops,2,'both video and audio tracks must be stopped');
  assert.equal(closeCalls,1,'audio cleanup must still be initiated');
  assert.deepEqual(p,original,'original project data must be unchanged');
 }finally{clearTimeout(timer);}
});

test('abort during canvas captureStream rejects without starting the WebM encoder',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 const controller=new AbortController();
 let encoderStarts=0,trackStops=0,encoderStops=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  start(){encoderStarts++;this.state='recording';}
  stop(){encoderStops++;this.state='inactive';}
 }
 const env={MediaRecorder:Recorder,performance:{now:()=>0},
  requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 const canvas={
  getContext:()=>({fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})}),
  captureStream(){
   controller.abort();
   const tracks=[{kind:'video',stop(){trackStops++;}}];
   return {getVideoTracks:()=>tracks,getTracks:()=>tracks};
  }
 };
 let timer;
 try{
  await assert.rejects(Promise.race([
   recordMvWebm(plan,{assets:new Map()},{
    signal:controller.signal,env,canvasFactory:()=>canvas
   }),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('missed abort during captureStream')),350);})
  ]),/영상 저장을 취소했습니다/);
 }finally{clearTimeout(timer);}
 assert.equal(encoderStarts,0,'cancelled export must not start an encoder');
 assert.equal(encoderStops,0,'inactive encoder need not be stopped');
 assert.equal(trackStops,1,'captured video track must be released');
 assert.deepEqual(p,original,'saved project must remain unchanged');
});

test('failed getTracks on a disposed stream preserves completed WebM and releases accessible tracks',async()=>{
 const p=project(),original=structuredClone(p),plan=planMvVideoRender(p);
 let elapsed=0,encoderStops=0,videoStops=0,audioStops=0;
 class Recorder{
  static isTypeSupported(type){return type==='video/webm;codecs=vp8';}
  constructor(){this.state='inactive';this.listeners={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';encoderStops++;
   this.emit('dataavailable',{data:new Blob(['recorded-webm-data'.repeat(25)])});
   this.emit('stop');
  }
 }
 const env={MediaRecorder:Recorder,performance:{now:()=>elapsed},
  requestAnimationFrame:fn=>{elapsed+=1000;queueMicrotask(fn);return elapsed;},
  cancelAnimationFrame(){}};
 const result=await recordMvWebm(plan,{assets:new Map()},{
  env,canvasFactory:()=>({
   getContext:()=>({fillRect(){},drawImage(){},fillText(){},createLinearGradient:()=>({addColorStop(){}})}),
   captureStream:()=>({
    getTracks(){throw Error('stream tracks already detached');},
    getVideoTracks:()=>[{kind:'video',stop(){videoStops++;}}],
    getAudioTracks:()=>[{kind:'audio',stop(){audioStops++;}}]
   })
  })
 });
 assert.ok(result.blob.size>100,'recorded WebM remains available');
 assert.equal(encoderStops,1);
 assert.equal(videoStops,1,'video track is released despite failed getTracks');
 assert.equal(audioStops,1,'audio track is released despite failed getTracks');
 assert.deepEqual(p,original,'original project is unchanged');
});


test('stale preview video pause does not interrupt cleanup of following clips',()=>{
 let healthyPauses=0;
 const stale={pause(){throw Error('stale video element cannot pause');}};
 const healthy={pause(){healthyPauses++;}};
 assert.doesNotThrow(()=>{for(const clip of [stale,healthy])pauseMvPreviewClip(clip);});
 assert.equal(healthyPauses,1,'later saved clips still pause');
});

test('stale preview play and rejected playback promises do not interrupt MV preview',async()=>{
 let plays=0;
 const stale={play(){throw Error('stale video element cannot play');}};
 const blocked={play(){return Promise.reject(Error('autoplay blocked'));}};
 const healthy={play(){plays++;return Promise.resolve();}};
 assert.doesNotThrow(()=>{for(const clip of [stale,blocked,healthy])playMvPreviewClip(clip);});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(plays,1,'later saved clips still play');
});

test('reused saved MP4 keeps playing in either scene and pauses only once on seek',()=>{
 const p=project(),original=structuredClone(p);
 const scenes=[
  {id:'first',kind:'video',assetId:'same-mp4',start:0,end:2},
  {id:'second',kind:'video',assetId:'same-mp4',start:2,end:4},
  {id:'third',kind:'video',assetId:'other-mp4',start:4,end:6}
 ];
 let plays=0,pauses=0,otherPauses=0;
 const shared={paused:true,duration:3,currentTime:0,
  play(){plays++;this.paused=false;return Promise.resolve();},
  pause(){pauses++;this.paused=true;}
 };
 const other={paused:true,pause(){otherPauses++;},play(){throw Error('inactive video must not play');}};
 const assets=new Map([
  ['same-mp4',{kind:'video',element:shared}],
  ['other-mp4',{kind:'video',element:other}]
 ]);
 syncMvPreviewClips(scenes,assets,scenes[0],true,1);
 assert.equal(shared.paused,false,'later scene sharing the MP4 must not pause the active clip');
 assert.equal(plays,1);
 assert.equal(pauses,0);
 syncMvPreviewClips(scenes,assets,scenes[1],true,2.5);
 assert.equal(shared.paused,false,'the same MP4 stays playing in its second scene');
 assert.equal(plays,1,'shared MP4 must not restart unnecessarily');
 syncMvPreviewClips(scenes,assets,scenes[1],false,3);
 assert.equal(shared.paused,true);
 assert.equal(pauses,1,'each shared MP4 is paused only once');
 assert.equal(shared.currentTime,1,'seeking uses the active scene start');
 assert.equal(otherPauses,3,'unrelated clip remains paused on every update');
 assert.deepEqual(p,original,'the original saved project is never modified');
});
