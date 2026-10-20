import test from 'node:test';import assert from 'node:assert/strict';
import {projectVocalSources} from '../src/lib/lipSyncProjectSources.js';
test('only real project vocal clips can feed character Lip Sync',()=>{
 const p={tracks:[{id:'v1',type:'vocal',name:'AI 보컬',clips:[{assetId:'voc_file',fileName:'me.wav',startBar:1,durationSec:12},{assetId:'voc_file',startBar:1}]},{id:'i',type:'instrument',clips:[{assetId:'musicgen_clip',startBar:1}]},{id:'v2',type:'vocal',clips:[{assetId:'shifted',startBar:8},{assetId:'direct',fileName:'me2.wav',startBar:1}]}]};
 assert.deepEqual(projectVocalSources(p).map(x=>x.assetId),['voc_file','direct']);
 assert.equal(p.tracks[0].clips.length,2);
});
test('broken vocal clip metadata is ignored',()=>{assert.deepEqual(projectVocalSources({tracks:[{type:'vocal',clips:[{assetId:''},{assetId:'bad',durationSec:-5}]}]}),[]);});
