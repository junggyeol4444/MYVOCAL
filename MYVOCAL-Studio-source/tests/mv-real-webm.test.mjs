import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newProject} from '../src/lib/schema.js';
import {planMvVideoRender,findMvVideoScene,drawMvVideoFrame,loadMvVideoAssets,MV_VIDEO_WIDTH,MV_VIDEO_HEIGHT,MV_VIDEO_FPS} from '../src/lib/mvVideoRender.js';
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
