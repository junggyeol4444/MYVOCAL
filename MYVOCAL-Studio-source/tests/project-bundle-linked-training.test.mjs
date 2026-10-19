import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedProfiles,assetsOf,importProjectBundle} from '../src/lib/projectBundle.js';

function sandbox(t){
 const files=new Map([['existing-file',new File(['preserved'],'keep.txt',{type:'text/plain'})]]);
 const previous=globalThis.indexedDB;
 const db={close(){},transaction(name,mode){
  assert.equal(name,'files');assert.equal(mode,'readwrite');
  const staged=[];
  const txn={error:null,objectStore(){return{add(file,id){staged.push([id,file]);return{result:id}}}},abort(){txn.onabort?.()}};
  queueMicrotask(()=>{for(const [id,file] of staged)files.set(id,file);txn.oncomplete?.()});
  return txn;
 }};
 globalThis.indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req}};
 t.after(()=>{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous});
 return files;
}
test('project backup includes linked voice training, stored checkpoints and original samples, not other voices',()=>{
 const project={voiceId:'voiceA',tracks:[],scenes:[]};
 const data={
  voices:[{id:'voiceA',name:'Me',assets:[{id:'sampleA'}]},{id:'voiceB',name:'Other',assetId:'sampleB'}],
  characters:[],
  voiceModels:[{id:'modelA',voiceId:'voiceA',name:'My checkpoint',assetId:'checkpointA',sourceSampleId:'external-sample'},{id:'modelB',voiceId:'voiceB',name:'Other',assetId:'checkpointB'}],
  trainingPlans:[{id:'planA',voiceId:'voiceA',voiceName:'Me',sampleIds:['sampleA'],sampleSnapshot:[{id:'sampleA'}]},
   {id:'planB',voiceId:'voiceB',voiceName:'Other',sampleIds:['sampleB']}]
 };
 const profiles=linkedProfiles(project,data);
 assert.deepEqual(profiles.voiceModels.map(m=>m.id),['modelA']);
 assert.deepEqual(profiles.trainingPlans.map(p=>p.id),['planA']);
 assert.deepEqual(new Set(assetsOf(project,profiles)),new Set(['sampleA','checkpointA','external-sample']));
});
test('portable project restore remaps training job sample references, checkpoint bytes and project voice',async t=>{
 const files=sandbox(t);
 const media=(name,type,s)=>({name,type,dataUrl:`data:${type};base64,${Buffer.from(s).toString('base64')}`});
 const input={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:{id:'prj',title:'Song',voiceId:'voiceA',characterId:'',tracks:[],sections:[],scenes:[],singingEngine:{modelId:'modelA',port:7867}},
  profiles:{voices:[{id:'voiceA',name:'My voice',assets:[{id:'sampleA'}]}],characters:[],
   voiceModels:[{id:'modelA',name:'Own checkpoint',voiceId:'voiceA',assetId:'checkpointA',sourceSampleId:'sampleA',engineId:'svc'}],
   trainingPlans:[{id:'planA',voiceId:'voiceA',voiceName:'My voice',sampleIds:['sampleA'],sampleSnapshot:[{id:'sampleA',fileName:'voice.wav'}]}]},
  assets:{sampleA:media('voice.wav','audio/wav',[1,2,3,4]),checkpointA:media('model.onnx','application/octet-stream',[5,6,7])}};
 const imported=await importProjectBundle(new File([JSON.stringify(input)],'backup.json',{type:'application/json'}));
 assert.equal(imported.voices.length,1);assert.equal(imported.voiceModels.length,1);assert.equal(imported.trainingPlans.length,1);
 const v=imported.voices[0],m=imported.voiceModels[0],p=imported.trainingPlans[0];
 assert.notEqual(v.id,'voiceA');assert.equal(m.voiceId,v.id);assert.equal(p.voiceId,v.id);
 assert.notEqual(m.id,'modelA');assert.equal(imported.project.singingEngine.modelId,m.id);
 assert.notEqual(m.assetId,'checkpointA');assert.ok(files.has(m.assetId));
 assert.equal(m.sourceSampleId,v.assets[0].id,'restored model must point at restored sample');
 assert.notEqual(m.sourceSampleId,'sampleA');
 assert.notEqual(p.sampleIds[0],'sampleA');assert.equal(p.sampleIds[0],v.assets[0].id);
 assert.equal(p.sampleSnapshot[0].id,p.sampleIds[0]);
 assert.deepEqual([...new Uint8Array(await files.get(m.assetId).arrayBuffer())],[5,6,7]);
 assert.deepEqual([...new Uint8Array(await files.get(p.sampleIds[0]).arrayBuffer())],[1,2,3,4]);
 assert.equal(await files.get('existing-file').text(),'preserved');
});
test('importing a legacy v2 project without optional training groups remains possible',async t=>{
 const files=sandbox(t);
 const input={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:{id:'old',title:'Old',tracks:[],sections:[],scenes:[]},profiles:{voices:[],characters:[]},assets:{}};
 const restored=await importProjectBundle(new File([JSON.stringify(input)],'old.json'));
 assert.deepEqual(restored.voiceModels,[]);assert.deepEqual(restored.trainingPlans,[]);
 assert.equal(files.size,1);
});
