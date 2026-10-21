import test from 'node:test';
import assert from 'node:assert/strict';
import {getLocalRVCTrainedIndex} from '../src/lib/rvcTrainingClient.js';
import {assetsOf} from '../src/lib/projectBundle.js';

test('RVC trained FAISS index is downloaded only from authenticated local EXE',async()=>{
 const bytes=new Uint8Array(2048);bytes.set([73,120,70,73],0);
 const request=async(url,opts)=>{
  assert.equal(url,'/api/training/rvc/index?id=0123456789abcdef01234567');
  assert.equal(opts.headers['X-MYVOCAL-Session'],'key');
  return {ok:true,headers:{get:()=> 'application/octet-stream'},blob:async()=>new Blob([bytes])};
 };
 const file=await getLocalRVCTrainedIndex('0123456789abcdef01234567',{session:'key',request});
 assert.equal(file.name,'MYVOCAL-RVC-trained.index');assert.equal(file.size,2048);
 await assert.rejects(getLocalRVCTrainedIndex('bad',{session:'key',request}),/ID/);
 await assert.rejects(getLocalRVCTrainedIndex('0123456789abcdef01234567',{session:'key',request:async()=>({ok:true,headers:{get:()=> 'application/octet-stream'},blob:async()=>new Blob([new Uint8Array(2048)])})}),/내용/);
});
test('project backups include RVC model and paired index assets',()=>{
 const project={tracks:[],scenes:[]};
 const profiles={voices:[],characters:[],voiceModels:[{assetId:'model-file',indexAssetId:'index-file'}],trainingPlans:[]};
 const ids=assetsOf(project,profiles);
 assert.ok(ids.includes('model-file'));
 assert.ok(ids.includes('index-file'));
});
