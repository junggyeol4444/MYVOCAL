import test from 'node:test';
import assert from 'node:assert/strict';
import {planMvBatch,runMvBatch} from '../src/lib/mvBatchProduction.js';
const base={id:'prj_batch',title:'MV',bpm:120,key:'C Major',genreMix:[{name:'Rock',weight:100}],characterId:'',scenes:[{id:'scn_a',start:0,end:5,title:'첫 장면',description:'달빛 아래',characterId:'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''}]};
test('batch creates real image+clip assets in order, never deletes originals',async()=>{
 let project=structuredClone(base),imageCalls=0,videoCalls=0;const assets=new Map(),progress=[];
 const result=await runMvBatch({project,data:{characters:[]},checkpoint:'sd.safetensors',videoModel:'svd.safetensors',port:8188,session:'auth',
  current:()=>project,commit:p=>{project=p},progress:x=>progress.push(x),
  generateImage:async()=>{imageCalls++;return new Blob(['\x89PNG mock bytes yes'],{type:'image/png'})},
  generateVideo:async()=>{videoCalls++;return new Blob(['ANIMVP mock clip'],{type:'image/webp'})},
  saveFile:async(id,file)=>{if(assets.has(id))throw Error('asset overwritten');assets.set(id,file)},
  loadFile:async(id)=>assets.get(id),sourceFrame:async()=>new Uint8Array([1,2,3]),
  idFactory:prefix=>prefix==='img'?'img_scene_batch':'vid_scene_batch'});
 assert.equal(result.generatedImages,1);assert.equal(result.generatedVideos,1);assert.equal(result.fullMovieExported,false);
 assert.equal(imageCalls,1);assert.equal(videoCalls,1);assert.equal(assets.size,2);
 assert.equal(project.scenes[0].imageAssetId,'img_scene_batch');assert.equal(project.scenes[0].videoClipAssetId,'vid_scene_batch');
 assert.deepEqual(progress.length,3);
 const next=planMvBatch(project);assert.equal(next.total,0);assert.equal(next.already,1);
});
test('batch does not overwrite manually edited or personal photo scenes',()=>{
 const project={...base,scenes:[{...base.scenes[0],personMv:{personId:'a'}},{...base.scenes[0],id:'scn_b',videoClipAssetId:'vid_old'}]};
 const plan=planMvBatch(project);assert.equal(plan.total,0);assert.equal(plan.linked,1);assert.equal(plan.already,1);
});
test('missing local engines fail before touching original project',async()=>{
 let edits=0;
 await assert.rejects(()=>runMvBatch({project:base,data:{characters:[]},checkpoint:'',videoModel:'',port:8188,session:'auth',current:()=>base,commit:()=>edits++}),/모델/);
 assert.equal(edits,0);
});
test('duplicate MV scene IDs fail before allocating any new assets',()=>{
 const project={...base,scenes:[{...base.scenes[0]},{...base.scenes[0]}]};
 assert.throws(()=>planMvBatch(project),/중복/);
});
test('cancellation while producing an image does not publish an asset or edit the project',async()=>{
 const controller=new AbortController();let saves=0,commits=0;
 const current=structuredClone(base),original=JSON.stringify(current);
 await assert.rejects(runMvBatch({project:current,data:{characters:[]},checkpoint:'sd.safetensors',videoModel:'svd.safetensors',
  port:8188,session:'auth',signal:controller.signal,current:()=>current,commit:()=>commits++,
  generateImage:async()=>{controller.abort();return new Blob(['fake'],{type:'image/png'})},
  saveFile:async()=>saves++
 }),/취소/);
 assert.equal(saves,0);assert.equal(commits,0);assert.equal(JSON.stringify(current),original);
});
test('cancel while producing a clip keeps an earlier saved image and never links a partial video',async()=>{
 const controller=new AbortController(),files=new Map();
 let current=structuredClone(base);const writes=[];
 await assert.rejects(runMvBatch({project:current,data:{characters:[]},checkpoint:'sd.safetensors',videoModel:'svd.safetensors',
  port:8188,session:'auth',signal:controller.signal,current:()=>current,commit:p=>{current=p},
  generateImage:async()=>new Blob(['image'],{type:'image/png'}),
  generateVideo:async()=>{controller.abort();return new Blob(['video'],{type:'image/webp'})},
  saveFile:async(id,file)=>{files.set(id,file);writes.push(id)},
  loadFile:async(id)=>files.get(id),sourceFrame:async()=>new Uint8Array([1,2,3]),
  idFactory:prefix=>prefix==='img'?'img_fresh_image':'vid_fresh_video'
 }),/취소/);
 assert.equal(current.scenes[0].imageAssetId,'img_fresh_image');
 assert.equal(current.scenes[0].videoClipAssetId,undefined);
 assert.deepEqual(writes,['img_fresh_image']);
 assert.equal(planMvBatch(current).total,1);
});

test('user cancellation aborts the actual remote ComfyUI requests, not only subsequent scenes',async()=>{
 const controller=new AbortController(), current=structuredClone(base);let captured=null, writes=0;
 await assert.rejects(runMvBatch({project:current,data:{characters:[]},checkpoint:'sd.safetensors',videoModel:'svd.safetensors',port:8188,session:'auth',signal:controller.signal,current:()=>current,commit:()=>writes++,
  generateImage:async(settings,session,signal)=>{assert.equal(session,'auth');captured=signal;controller.abort();throw Error('fetch aborted')},saveFile:async()=>writes++
 }),/fetch aborted/);
 assert.equal(captured,controller.signal);assert.equal(writes,0);
});
test('server-invalid ComfyUI options fail before requesting remote images or writing media',async()=>{
 const current=structuredClone(base);let calls=0;
 for(const opts of [{width:1536,height:448},{width:770,height:448},{frames:20},{fps:12},{imageSteps:70},{videoSteps:60}]){
  await assert.rejects(runMvBatch({project:current,data:{characters:[]},checkpoint:'sd.safetensors',videoModel:'svd.safetensors',port:8188,session:'auth',current:()=>current,commit:()=>calls++,generateImage:async()=>{calls++;return null},...opts}),/옵션/);
 }
 assert.equal(calls,0);
});
