import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonLipSettings,personVideoAssets,personAudioAssets,validatePersonLipSettings,validatePersonLipAudio,savePersonLipSettings,personMouthAt,renderPersonLipFrame} from '../src/lib/personLipSync.js';
import {parseLipSyncLines} from '../src/lib/characterLipSync.js';
import {supportedPersonLipRecording,recordPersonLipWebM} from '../src/lib/personLipRecording.js';
const character=()=>({id:'p1',kind:'person',rights:'self',name:'Test',assets:[{id:'vid',name:'face.mp4',type:'video/mp4'},{id:'sing',name:'vocal.wav',type:'audio/wav'}],lipSync:parseLipSyncLines('0,0.35,ㅁ,마\n0.35,1.5,ㅏ,마\n1.5,2.5,ㅣ,이')});
test('STEP86 only authorized registered person media and valid cues',()=>{
 const c=character(),s=createPersonLipSettings(c);assert.equal(personVideoAssets(c).length,1);assert.equal(personAudioAssets(c).length,1);
 assert.equal(s.videoAssetId,'vid');assert.equal(s.audioAssetId,'sing');assert.equal(validatePersonLipSettings(c,s),s);
 assert.equal(savePersonLipSettings(c,s).personLipSync.audioAssetId,'sing');assert.equal(c.personLipSync,undefined);
 for(const changed of [{kind:'character'},{rights:'reference'},{rights:'licensed',rightsNote:''},{lipSync:null},{assets:[]}])assert.throws(()=>validatePersonLipSettings({...c,...changed},s));
 assert.throws(()=>validatePersonLipSettings(c,{...s,videoAssetId:'other'}));assert.throws(()=>validatePersonLipSettings(c,{...s,audioAssetId:'missing'}));
 assert.throws(()=>validatePersonLipSettings(c,{...s,mouth:{x:.9,y:.8,width:.2,height:.2}}));
 assert.throws(()=>validatePersonLipSettings(c,{...s,duration:60}));assert.throws(()=>validatePersonLipSettings(c,{...s,strength:2}));
 assert.throws(()=>validatePersonLipSettings(c,{...s,offsetMs:10001}));
});
test('STEP86 format and size restrictions for only local singing audio',()=>{
 assert.equal(validatePersonLipAudio({name:'sing.wav',type:'audio/wav',size:123}).size,123);
 for(const item of [{name:'file.exe',type:'audio/wav',size:10},{name:'sing.wav',type:'video/mp4',size:10},{name:'sing.wav',type:'audio/wav',size:0},{name:'sing.wav',type:'audio/wav',size:41*1024*1024}])assert.throws(()=>validatePersonLipAudio(item));
});
test('STEP86 phoneme time + offset and viseme geometry drives actual video frame patches',()=>{
 const c=character(),s=createPersonLipSettings(c);s.strength=1;
 assert.equal(personMouthAt(c,s,.7).viseme,'A');assert.equal(personMouthAt(c,s,1.7).viseme,'I');
 assert.equal(personMouthAt(c,s,3.2).viseme,'sil');assert.equal(personMouthAt(c,s,.8).heightScale>1,true);
 const ops=[];const ctx={clearRect:(...a)=>ops.push(['clear',a]),drawImage:(...a)=>ops.push(['draw',a]),save:()=>ops.push(['save']),beginPath:()=>{},ellipse:()=>{},clip:()=>{},restore:()=>{},strokeRect:()=>ops.push(['guide'])};
 const input={type:'video'};
 renderPersonLipFrame(ctx,input,c,s,.8,640,360,{guide:true});assert.equal(ops.filter(o=>o[0]==='draw').length,2);assert.ok(ops.some(o=>o[0]==='guide'));
 ops.length=0;renderPersonLipFrame(ctx,input,c,s,3.3,640,360);assert.equal(ops.filter(o=>o[0]==='draw').length,1);
 assert.throws(()=>renderPersonLipFrame(ctx,input,c,{...s,mouth:{...s.mouth,x:1}},0,640,360));
});
test('STEP86 separate video and audio capture support requires both WebM and AudioContext',()=>{
 assert.equal(Boolean(supportedPersonLipRecording({})),false);
 assert.equal(Boolean(supportedPersonLipRecording({MediaRecorder:{isTypeSupported:()=>true},MediaStream:class {},AudioContext:class {}})),true);
});
test('STEP86 rejects unsupported media/aborted capture without returning bogus WebM',async()=>{
 await assert.rejects(recordPersonLipWebM({canvas:{},video:{},audioUrl:'blob:local',duration:2,draw:()=>{}}));
 await assert.rejects(recordPersonLipWebM({canvas:{captureStream:()=>({})},video:{},audioUrl:'blob:local',duration:32,draw:()=>{}}));
 await assert.rejects(recordPersonLipWebM({canvas:{captureStream:()=>({})},video:{},audioUrl:'blob:local',duration:2,draw:()=>{},signal:{aborted:true},env:{MediaRecorder:{isTypeSupported:()=>true},MediaStream:class {},AudioContext:class {}}}));
});

test('STEP86 project backup/restore relinks both source video and captured singing audio without modifying prior metadata',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const {newProject}=await import('../src/lib/schema.js');
 const c=character(),s=createPersonLipSettings(c),profile=savePersonLipSettings(c,s),project=newProject();project.characterId=c.id;
 const payload={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[profile]},assets:{vid:{name:'face.mp4',type:'video/mp4',dataUrl:'data:video/mp4;base64,'+Buffer.from('video bytes').toString('base64')},sing:{name:'vocal.wav',type:'audio/wav',dataUrl:'data:audio/wav;base64,'+Buffer.from('audio bytes').toString('base64')}}};
 const original=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const restored=await importProjectBundle(new File([JSON.stringify(payload)],'demo.json',{type:'application/json'}));const result=restored.characters[0];
  assert.equal(restored.project.characterId,result.id);assert.notEqual(result.id,c.id);
  assert.notEqual(result.personLipSync.videoAssetId,'vid');assert.notEqual(result.personLipSync.audioAssetId,'sing');
  assert.equal(result.personLipSync.videoAssetId,result.assets[0].id);assert.equal(result.personLipSync.audioAssetId,result.assets[1].id);
  assert.equal(validatePersonLipSettings(result,result.personLipSync),result.personLipSync);assert.deepEqual(result.lipSync,c.lipSync);
 }finally{globalThis.indexedDB=original;}
});

test('STEP86 MediaRecorder creates WebM containing both local video and recorded vocal track; closes resources',async()=>{
 const tracks=[{type:'video',stopped:false,stop(){this.stopped=true;}},{type:'audio',stopped:false,stop(){this.stopped=true;}}];let ticks=0,closed=false,videoPaused=false,recorderTracks=[];
 class FakeRecorder{static isTypeSupported(){return true;}constructor(stream){recorderTracks=stream.getTracks();this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio+video'])});this.onstop();}}
 class FakeContext{createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[tracks[1]],getTracks:()=>[tracks[1]]}};}createMediaElementSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){closed=true;}}
 class FakeAudio{constructor(url){assert.equal(url,'blob:singing');this.currentTime=0;this.ended=false;}async play(){}pause(){} }
 class FakeStream{constructor(ts){this.tracks=ts;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.type==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.type==='video');}}
 const video={currentTime:0,readyState:2,muted:false,async play(){},pause(){videoPaused=true;}};
 const env={AudioContext:FakeContext,Audio:FakeAudio,MediaRecorder:FakeRecorder,MediaStream:FakeStream,requestAnimationFrame:f=>{queueMicrotask(()=>{video.currentTime=(++ticks)*.5;audioTime=ticks*.5;f();});return ticks;},cancelAnimationFrame:()=>{}};
 let audioTime=0;const frames=[],canvas={captureStream:fps=>{assert.equal(fps,30);return new FakeStream([tracks[0]]);}};
 // Fake audio time advances through a clock getter so the recorder sees a true timebase.
 Object.defineProperty(FakeAudio.prototype,'currentTime',{get(){return audioTime;},set(v){audioTime=v;},configurable:true});
 const blob=await recordPersonLipWebM({canvas,video,audioUrl:'blob:singing',duration:2,fps:30,draw:t=>frames.push(t),env});
 assert.equal(await blob.text(),'audio+video');assert.equal(recorderTracks.length,2);assert.ok(frames.length>=3);assert.equal(videoPaused,true);assert.equal(closed,true);assert.ok(tracks.every(t=>t.stopped));
});

test('STEP86 cancel mid-recording rejects and removes incomplete audio/video streams',async()=>{
 const controller=new AbortController();let n=0,closed=false,stopped=0;
 const vTrack={stop(){stopped++;}},aTrack={stop(){stopped++;}};
 class R{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['partial'])});this.onstop?.();}}
 class A{constructor(){this.currentTime=0;this.ended=false;}async play(){}pause(){}}
 class C{createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[aTrack],getTracks:()=>[aTrack]}};}createMediaElementSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){closed=true;}}
 class S{constructor(t){this.t=t;}getTracks(){return this.t;}getVideoTracks(){return this.t.filter(t=>t===vTrack);}getAudioTracks(){return this.t.filter(t=>t===aTrack);}}
 let mediaInstance;
 const env={AudioContext:C,Audio:class extends A{constructor(){super();mediaInstance=this;}},MediaRecorder:R,MediaStream:S,requestAnimationFrame:cb=>{queueMicrotask(()=>{mediaInstance.currentTime=++n*.4;cb();});return n;},cancelAnimationFrame:()=>{}};
 await assert.rejects(recordPersonLipWebM({canvas:{captureStream:()=>new S([vTrack])},video:{currentTime:0,readyState:2,play:async()=>{},pause:()=>{}},audioUrl:'blob:local',duration:3,signal:controller.signal,env,draw:t=>{if(t>.7)controller.abort();}}),/취소/);
 assert.equal(closed,true);assert.ok(stopped>=2);
});
