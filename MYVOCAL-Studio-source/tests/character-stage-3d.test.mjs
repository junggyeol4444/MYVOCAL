import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStageSettings,validateStageSettings,saveStageSettings,stageStatus,stageFrame,stageRigSettings,stageMetadata} from '../src/lib/characterStage3d.js';
import {recordStageWebM,supportedStageWebM} from '../src/lib/stage3dRecording.js';
const character={id:'char84',name:'Stage Singer',rights:'owned',assets:[{id:'model84',role:'model',name:'performer.vrm',size:1000}]};
const setup=()=>createStageSettings(character);
test('84 defaults are linked to existing VRM model',()=>{const s=setup();assert.equal(s.assetId,'model84');assert.equal(s.version,1);assert.equal(s.fps,24);assert.doesNotThrow(()=>validateStageSettings(character,s));});
test('84 saved stage is independent from Step83 rig and model originals',()=>{const s=setup();const next=saveStageSettings(character,s);assert.equal(stageStatus(next),'3D 무대 저장됨');assert.equal(character.stage3d,undefined);assert.strictEqual(next.assets,character.assets);assert.equal(next.stage3d.assetId,'model84');assert.equal(next.stage3d.duration,8);});
test('84 rights reject references and undocumented licenses',()=>{const s=setup();for(const c of [{...character,rights:'reference'},{...character,rights:'licensed',rightsNote:''}])assert.throws(()=>saveStageSettings(c,s),/허가/);assert.doesNotThrow(()=>saveStageSettings({...character,rights:'licensed',rightsNote:'artist permission'},s));});
test('84 invalid or missing model prevents stage creation',()=>{assert.throws(()=>createStageSettings({...character,assets:[]}),/모델/);assert.throws(()=>validateStageSettings(character,{...setup(),assetId:'missing'}),/원본/);});
test('84 bad or unsafe numeric values rejected',()=>{const s=setup();for(const patch of [{duration:31},{duration:1},{duration:NaN},{fps:25},{fps:'24'},{yaw:181},{pitch:-61},{zoom:0},{cameraMotion:-1},{lightMotion:3},{lightIntensity:0},{speed:4},{expressionWeight:-.1},{version:2}])assert.throws(()=>validateStageSettings(character,{...s,...patch}),JSON.stringify(patch));});
test('84 unknown stage, camera, lights, and arbitrary expression rejected',()=>{for(const patch of [{backdrop:'external-url'},{camera:'x'},{lights:'x'},{motion:'network'},{expression:'unknown'},{animation:'x'.repeat(101)}])assert.throws(()=>validateStageSettings(character,{...setup(),...patch}));});
test('84 camera movements vary across time, fixed is deterministic',()=>{const s=setup();for(const camera of ['orbit','track','dolly','cuts']){const frame0=stageFrame({...s,camera},0).camera;const changed=[.8,2.4,4.8].some(t=>JSON.stringify(frame0)!==JSON.stringify(stageFrame({...s,camera},t).camera));assert.equal(changed,true,camera);}assert.deepEqual(stageFrame({...s,camera:'fixed'},0).camera,stageFrame({...s,camera:'fixed'},3).camera);});
test('84 lighting palettes, animation and rig carry across settings',()=>{const s={...setup(),lights:'pulse',backdrop:'neon',lightMotion:1.2,motion:'wave',expression:'happy'};assert.notDeepEqual(stageFrame(s,0).light,stageFrame(s,1).light);assert.notDeepEqual(stageFrame(s,0).palette,stageFrame({...s,backdrop:'theater'},0).palette);assert.equal(stageRigSettings(s).motion,'wave');assert.equal(stageRigSettings(s).expression,'happy');});
test('84 stage time and camera values are clamped at boundaries',()=>{const s={...setup(),camera:'cuts',cameraMotion:2};assert.equal(stageFrame(s,999).time,s.duration);assert.ok(stageFrame(s,4).camera.zoom<=2.6);assert.equal(stageFrame(s,-33).time,0);});
test('84 exported metadata preserves stage & describes silent WebM faithfully',()=>{const m=stageMetadata(character,setup());assert.equal(m.format,'MYVOCAL_3D_STAGE_STEP84');assert.equal(m.export.format,'video/webm');assert.equal(m.export.audio,'none');assert.equal(m.settings.assetId,'model84');});
test('84 recording rejects unsupported canvas, recorder and invalid length',async()=>{
 await assert.rejects(recordStageWebM({canvas:{},fps:24,duration:4,draw(){}}),/캔버스/);
 await assert.rejects(recordStageWebM({canvas:{captureStream:()=>{}},fps:25,duration:4,draw(){}}),/FPS/);
 assert.equal(supportedStageWebM(undefined),supportedStageWebM(globalThis.MediaRecorder));
 assert.equal(supportedStageWebM(class{static isTypeSupported(){return false}}),'');
});
test('84 recording captures true Canvas WebM chunks, stops tracks and reports progress',async()=>{
 const frames=[],times=[],tracks=[{stopped:false,stop(){this.stopped=true;}}],recorders=[];
 class Recorder{static isTypeSupported(type){return type==='video/webm;codecs=vp8';}constructor(stream,opts){this.state='inactive';this.opts=opts;recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['webmbytes'])});this.onstop?.();}}
 const previous=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;let tick=0;
 globalThis.requestAnimationFrame=(cb)=>{queueMicrotask(()=>cb((tick+=125)));return tick;};globalThis.cancelAnimationFrame=()=>{};
 try{const blob=await recordStageWebM({canvas:{captureStream:()=>({getTracks:()=>tracks})},duration:2,fps:24,draw:t=>frames.push(t),onProgress:p=>times.push(p),MediaRecorderClass:Recorder});
  assert.equal(blob.type,'video/webm');assert.equal(await blob.text(),'webmbytes');assert.ok(frames.length>8);assert.equal(frames.at(-1),2);assert.ok(times.includes(1));assert.equal(tracks[0].stopped,true);assert.equal(recorders[0].opts.mimeType,'video/webm;codecs=vp8');}
 finally{globalThis.requestAnimationFrame=previous;globalThis.cancelAnimationFrame=previousCancel;}
});
test('84 abort does not publish partially recorded video',async()=>{
 const controller=new AbortController(),track={stopCalled:false,stop(){this.stopCalled=true;}};
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}}
 const original=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;let n=0;globalThis.requestAnimationFrame=cb=>{queueMicrotask(()=>cb(++n*500));return n;};globalThis.cancelAnimationFrame=()=>{};
 try{await assert.rejects(recordStageWebM({canvas:{captureStream:()=>({getTracks:()=>[track]})},duration:3,fps:24,draw:t=>{if(t>.4)controller.abort();},signal:controller.signal,MediaRecorderClass:Recorder}),/취소/);assert.equal(track.stopCalled,true);}
 finally{globalThis.requestAnimationFrame=original;globalThis.cancelAnimationFrame=cancel;}
});
test('84 UI wired in Character Studio without replacing 83 screen',()=>{const characters=fs.readFileSync(new URL('../src/pages/Characters.jsx',import.meta.url),'utf8');const ui=fs.readFileSync(new URL('../src/components/CharacterStage3dEditor.jsx',import.meta.url),'utf8');const renderer=fs.readFileSync(new URL('../src/lib/character3dRenderer.js',import.meta.url),'utf8');
 for(const token of ['CharacterStage3dEditor','setStageFor(c)','STEP84 · 3D 무대 연출','Character3dEditor'])assert.ok(characters.includes(token),token);
 for(const token of ['new Character3dRenderer','recordStageWebM','saveStageSettings','WebM','3D 공연'])assert.ok(ui.includes(token),token);
 for(const token of ['drawStage','stageFrame','gl.drawElements','stageVertexBuffer'])assert.ok(renderer.includes(token),token);
});
test('84 backup restore relinks stage model IDs and preserves previous rig IDs',()=>{const bundle=fs.readFileSync(new URL('../src/lib/projectBundle.js',import.meta.url),'utf8');assert.match(bundle,/result\.stage3d/);assert.match(bundle,/assetMap\[result\.stage3d\.assetId\]/);assert.match(bundle,/assetMap\[result\.rig3d\.assetId\]/);});

test('84 real renderer path draws stage geometry with WebGL, plus original model',async()=>{
 const {Character3dRenderer}=await import('../src/lib/character3dRenderer.js');
 const calls=[];const c={width:640,height:360,getContext(){return gl;}};let index=1;
 const gl=new Proxy({}, {get(target,key){if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='getAttribLocation')return name=>({pos:0,uv:1,shade:2}[name]);
  if(key==='getUniformLocation')return (_,name)=>name;
  if(key==='createShader'||key==='createProgram'||key==='createBuffer')return ()=>({id:index++});
  if(key==='getExtension')return ()=>true;
  if(key==='drawElements')return (...args)=>calls.push(['draw',...args]);
  if(key==='clearColor')return (...args)=>calls.push(['clear',...args]);
  if(key==='uniformMatrix4fv')return (_,__,mat)=>calls.push(['matrix',...mat]);
  if(typeof key==='string'&&/^[A-Z0-9_]+$/.test(key))return index++;
  return ()=>{};
 }});
 const model={nodes:[{index:0,name:'body',translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],skin:null,matrix:null}],parents:[-1],skins:[],animations:[],vrm:{bones:{},expressions:{}},textures:[],images:[],primitives:[{node:0,mesh:0,position:new Float32Array([-.4,0,0,.4,0,0,0,1,0]),indices:[0,1,2],uv:null,weights:[],targets:[],joints:null,jointWeights:null,material:{color:[1,1,1,1],texture:-1,doubleSided:true},mode:4}]};
 const renderer=new Character3dRenderer(c,model),settings={...stageRigSettings(setup()),boneName:'',boneDegrees:0};
 renderer.render(settings,0);const initialCount=calls.filter(c=>c[0]==='draw').length;assert.equal(initialCount,1);
 calls.length=0;renderer.render(settings,2,setup());assert.ok(calls.filter(c=>c[0]==='draw').length>=7,'procedural stage quads and model really drawn');assert.deepEqual(calls.find(c=>c[0]==='clear').slice(1),[.025,.034,.085,1]);
 const orbitMatrix=calls.find(c=>c[0]==='matrix');calls.length=0;renderer.render(settings,3,{...setup(),camera:'cuts',backdrop:'theater'});
 assert.notDeepEqual(calls.find(c=>c[0]==='matrix'),orbitMatrix,'different camera changes actual WebGL matrix');
 assert.deepEqual(calls.find(c=>c[0]==='clear').slice(1),[.07,.025,.03,1]);renderer.dispose();
});
test('84 portable project import maps stage and rig asset IDs to restored 3D asset',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const {newProject}=await import('../src/lib/schema.js');
 const {createRigSettings,saveRigSettings}=await import('../src/lib/character3d.js');
 const saved=saveStageSettings({...character,rig3d:createRigSettings(character)},setup());const project=newProject();project.characterId=saved.id;
 const payload={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[saved]},assets:{model84:{name:'performer.vrm',type:'model/gltf-binary',dataUrl:'data:model/gltf-binary;base64,'+Buffer.from('tiny-example').toString('base64')}}};
 const old=globalThis.indexedDB;globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const restored=await importProjectBundle(new File([JSON.stringify(payload)],'demo.json',{type:'application/json'}));const profile=restored.characters[0];assert.notEqual(profile.stage3d.assetId,'model84');assert.equal(profile.stage3d.assetId,profile.assets[0].id);assert.equal(profile.rig3d.assetId,profile.assets[0].id);assert.equal(stageStatus(profile),'3D 무대 저장됨');assert.equal(restored.project.characterId,profile.id);}
 finally{globalThis.indexedDB=old;}
});
test('84 invalid saved model reference falls back to present asset',()=>{
 const broken={...character,rig3d:{...setup(),assetId:'gone'}};
 assert.equal(createStageSettings(broken).assetId,'model84');
});
