import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {buildSceneImageRequest,applySceneImage,isSceneImageStale,validateGeneratedImage} from '../src/lib/mvSceneImages.js';
const sample=()=>{const p=newProject({title:'Scene image'});p.scenes[0].description='달빛 아래 무대';p.scenes[0].outfit='black suit';p.scenes[0].lighting='blue spotlight';return p;};
test('Step77 prompt includes scene details, character and direction without remote images',()=>{
 const p=sample(),s=p.scenes[0],r=buildSceneImageRequest(p,s,{name:'LUNA'},{direction:'공연 중심',framing:'full face'});
 for(const part of ['달빛 아래 무대','black suit','blue spotlight','LUNA','공연 중심','full face'])assert.ok(r.prompt.includes(part),part);
 assert.ok(r.negative.includes('watermark'));
 assert.ok(r.prompt.length<=3000);
});
test('Step77 prompt changes when meaningful scene setting changes',()=>{
 const p=sample(),s=p.scenes[0],r=buildSceneImageRequest(p,s);
 assert.notEqual(buildSceneImageRequest(p,{...s,location:'바닷가'}).key,r.key);
 assert.notEqual(buildSceneImageRequest(p,s,{name:'other'}).key,r.key);
 assert.notEqual(buildSceneImageRequest(p,s,null,{direction:'스토리 중심'}).key,r.key);
});
test('Step77 preserves legacy scene properties and independent tracks',()=>{
 const p=sample(),original=JSON.stringify(p),s=p.scenes[0],r=buildSceneImageRequest(p,s);
 const out=applySceneImage(p,s.id,'img_abc123',r,{seed:27,checkpoint:'model.safetensors'});
 assert.equal(out.scenes[0].imageAssetId,'img_abc123');assert.equal(out.scenes[0].imageGeneration.seed,27);
 assert.deepEqual(out.tracks,p.tracks);assert.deepEqual(out.sections,p.sections);assert.equal(JSON.stringify(p),original);
 assert.equal(isSceneImageStale(out.scenes[0],r),false);
 assert.equal(isSceneImageStale({...out.scenes[0],lighting:'new'},buildSceneImageRequest(out,{...out.scenes[0],lighting:'new'})),true);
});
test('Step77 rejects invalid and missing scene image association',()=>{
 const p=sample(),r=buildSceneImageRequest(p,p.scenes[0]);
 assert.throws(()=>applySceneImage(p,'missing','img_good',r),/삭제/);
 assert.throws(()=>applySceneImage(p,p.scenes[0].id,'../../evil',r),/ID/);
 assert.throws(()=>applySceneImage(p,p.scenes[0].id,'img_good',{}),/생성 정보/);
});
test('Step77 image mime, byte limits, missing content',()=>{
 assert.equal(validateGeneratedImage(new Blob([Buffer.alloc(30)],{type:'image/png'})),true);
 assert.equal(validateGeneratedImage(new Blob([Buffer.alloc(30)],{type:'image/jpeg'})),true);
 assert.throws(()=>validateGeneratedImage(new Blob([Buffer.alloc(30)],{type:'text/html'})),/형식/);
 assert.throws(()=>validateGeneratedImage(new Blob(['x'],{type:'image/png'})),/용량/);
 assert.throws(()=>validateGeneratedImage(new Blob([Buffer.alloc(12*1024*1024+1)],{type:'image/png'})),/용량/);
});
test('Step77 older scenes with no images remain normal',()=>{
 const p=sample(),r=buildSceneImageRequest(p,p.scenes[0]);
 assert.equal(isSceneImageStale(p.scenes[0],r),false);
 assert.equal(p.scenes[0].imageAssetId,undefined);
});

test('Step77 bundled PNG is restored into IndexedDB with a new scene and asset ID',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');
 const p=sample(),s=p.scenes[0],request=buildSceneImageRequest(p,s);
 const updated=applySceneImage(p,s.id,'img_original',request,{seed:44,checkpoint:'fake.safetensors'});
 const binary=Buffer.from('fake png payload for backup test');
 const fileJson={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,exportedAt:new Date().toISOString(),project:updated,profiles:{voices:[],characters:[]},assets:{img_original:{name:'scene.png',type:'image/png',dataUrl:'data:image/png;base64,'+binary.toString('base64')}}};
 let id='',savedFile=null;
 const oldDb=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{
  const req={};queueMicrotask(()=>{req.result={createObjectStore(){},close(){},transaction(){
   const tx={objectStore(){return {add(file,key){savedFile=file;id=key;queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;
  }};req.onsuccess?.();});return req;
 }};
 try {
  const file=new File([JSON.stringify(fileJson)],'backup.myvocal.json',{type:'application/json'});
  const restored=await importProjectBundle(file);
  assert.notEqual(restored.project.id,p.id);
  assert.notEqual(restored.project.scenes[0].id,s.id);
  assert.notEqual(restored.project.scenes[0].imageAssetId,'img_original');
  assert.equal(restored.project.scenes[0].imageAssetId,id);
  assert.equal(restored.project.scenes[0].imageGeneration.key,'');
  assert.deepEqual(Buffer.from(await savedFile.arrayBuffer()),binary);
  assert.equal(restored.project.tracks.length,updated.tracks.length);
 } finally { globalThis.indexedDB=oldDb; }
});
