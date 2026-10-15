import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {buildSceneImageRequest,applySceneImage} from '../src/lib/mvSceneImages.js';
import {videoSourceKey,applySceneVideo,isSceneVideoStale,MAX_SCENE_VIDEO_BYTES,readSourceFrame} from '../src/lib/mvSceneVideos.js';
function fixture(){let p=newProject({title:'SVD short clips'}),s=p.scenes[0];s.description='달빛의 공연';const req=buildSceneImageRequest(p,s);p=applySceneImage(p,s.id,'img_abc',req,{seed:12,checkpoint:'synthetic.safetensors'});return {p,s:p.scenes[0],req};}
test('Step78 new clip metadata preserves original scene image and tracks',()=>{
 const {p,s,req}=fixture(),old=JSON.stringify(p),key=videoSourceKey(p,s,req);
 const out=applySceneVideo(p,s.id,'vid_abc',key,{checkpoint:'svd.safetensors',frames:14,fps:6,seed:11,mime:'image/webp'});
 assert.equal(out.scenes[0].imageAssetId,'img_abc');assert.equal(out.scenes[0].videoClipAssetId,'vid_abc');
 assert.equal(isSceneVideoStale(out.scenes[0],key),false);assert.equal(JSON.stringify(p),old);assert.deepEqual(p.tracks,out.tracks);
 assert.equal(out.scenes[0].videoGeneration.frames,14);
});
test('Step78 detects stale generated clip when source image, timing, or prompt changed',()=>{
 const {p,s,req}=fixture(),key=videoSourceKey(p,s,req),out=applySceneVideo(p,s.id,'vid_abc',key,{frames:25,fps:8,mime:'image/webp'});
 assert.equal(isSceneVideoStale(out.scenes[0],videoSourceKey(out,out.scenes[0],req)),false);
 assert.equal(isSceneVideoStale(out.scenes[0],videoSourceKey(out,{...s,imageAssetId:'img_new'},req)),true);
 assert.equal(isSceneVideoStale(out.scenes[0],videoSourceKey(out,{...s,start:30},req)),true);
 assert.equal(isSceneVideoStale(out.scenes[0],videoSourceKey(out,s,buildSceneImageRequest(out,{...s,action:'walking'}))),true);
});
test('Step78 old scenes without image or clip remain valid',()=>{
 const p=newProject({title:'old'});assert.equal(p.scenes[0].videoClipAssetId,undefined);
 assert.equal(isSceneVideoStale(p.scenes[0],''),false);
 assert.throws(()=>videoSourceKey(p,p.scenes[0],{key:'key'}),/Step77/);
});
test('Step78 rejects missing scene, unsafe IDs, wrong frame counts and excessive media',async()=>{
 const {p,s,req}=fixture(),key=videoSourceKey(p,s,req);
 const detail={frames:14,fps:6,mime:'image/webp'};
 assert.throws(()=>applySceneVideo(p,'deleted','vid_abc',key,detail),/삭제/);
 assert.throws(()=>applySceneVideo(p,s.id,'../bad',key,detail),/ID/);
 assert.throws(()=>applySceneVideo(p,s.id,'vid_good',key,{...detail,frames:200}),/메타데이터/);
 assert.equal(MAX_SCENE_VIDEO_BYTES,40*1024*1024);
 await assert.rejects(readSourceFrame(new Blob([Buffer.alloc(34)],{type:'text/html'})),/PNG\/JPEG/);
});
test('Step78 video plus Step77 image survives project backup restoration with independent asset IDs',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');
 const {p,s,req}=fixture(),key=videoSourceKey(p,s,req);
 const bundled=applySceneVideo(p,s.id,'vid_original',key,{checkpoint:'fake.safetensors',frames:14,fps:6,seed:4,mime:'image/webp'});
 const image=Buffer.from('image placeholder for backup validation'),video=Buffer.from('animated webp placeholder for backup validation');
 const entries={img_abc:{name:'shot.png',type:'image/png',dataUrl:'data:image/png;base64,'+image.toString('base64')},vid_original:{name:'shot.webp',type:'image/webp',dataUrl:'data:image/webp;base64,'+video.toString('base64')}};
 const backup={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,exportedAt:new Date().toISOString(),project:bundled,profiles:{voices:[],characters:[]},assets:entries};
 const restoredFiles=[];const old=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {add(file,id){restoredFiles.push([id,file]);if(restoredFiles.length===2)queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{
  const result=await importProjectBundle(new File([JSON.stringify(backup)],'backup.myvocal.json',{type:'application/json'}));
  const scene=result.project.scenes[0];assert.notEqual(scene.imageAssetId,'img_abc');assert.notEqual(scene.videoClipAssetId,'vid_original');
  assert.notEqual(scene.imageAssetId,scene.videoClipAssetId);assert.equal(scene.videoGeneration.sourceKey,'');
  const saved=new Map(restoredFiles);assert.deepEqual(Buffer.from(await saved.get(scene.imageAssetId).arrayBuffer()),image);
  assert.deepEqual(Buffer.from(await saved.get(scene.videoClipAssetId).arrayBuffer()),video);
 }finally{globalThis.indexedDB=old;}
});
