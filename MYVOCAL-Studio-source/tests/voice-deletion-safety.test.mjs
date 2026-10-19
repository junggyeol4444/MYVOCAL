import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDependents,voiceDependents,modelDependents,voiceOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';
const me={id:'v',assetId:'main-file',assets:[{id:'take1'},{id:'take2'}]},other={id:'o',assetId:'other-file'};
const data={voices:[me,other],
 voiceModels:[{id:'sampler',voiceId:'v',sourceSampleId:'take1',assetId:'sampler-file'},
 {id:'model',voiceId:'v',assetId:'checkpoint-file'}],
 trainingPlans:[{id:'plan',voiceId:'v',voiceName:'My voice',sampleIds:['take2']}],
 projects:[{id:'p',title:'My song',voiceId:'v',singingEngine:{modelId:'model'},tracks:[{clips:[{assetId:'take1'}]}]}],
 virtualSingers:[],voicebanks:[]};
test('sample deletion is blocked when training, sampler or project still refers to original',()=>{
 assert.ok(sampleDependents(data,'v','take1').length>=2);
 assert.ok(sampleDependents(data,'v','take2').length>=1);
 assert.deepEqual(sampleDependents(data,'v','unused'),[]);
});
test('voice and checkpoint cannot delete currently used project dependencies',()=>{
 assert.ok(voiceDependents(data,me).some(s=>s.includes('My song')));
 assert.ok(modelDependents(data,data.voiceModels[1]).some(s=>s.includes('My song')));
});
test('voice deletion selects only unique owned files and never unrelated data',()=>{
 const d={...data,projects:[]};
 assert.deepEqual(new Set(voiceOwnedFileIds(d,me)),new Set(['main-file','take1','take2','sampler-file','checkpoint-file']));
 assert.ok(!voiceOwnedFileIds(d,me).includes('other-file'));
 const shared={...d,voiceModels:[...d.voiceModels,{id:'other-model',voiceId:'o',assetId:'checkpoint-file'}]};
 assert.throws(()=>voiceOwnedFileIds(shared,me),/공유/);
 assert.ok(modelDependents(shared,data.voiceModels[1]).length>0);
});
test('virtual singer or voicebank still referencing the voice blocks deletion',()=>{
 assert.equal(voiceDependents({...data,projects:[],virtualSingers:[{id:'s',voiceId:'v'}]},me).length,1);
 assert.equal(voiceDependents({...data,projects:[],voicebanks:[{id:'b',voiceId:'v'}]},me).length,1);
});
