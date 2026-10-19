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

test('다른 목소리가 공유하는 녹음 원본은 샘플 삭제에서 보호한다',()=>{
 const shared={...data,voices:[me,{id:'other',name:'두 번째 목소리',assetId:'take2'}],projects:[],trainingPlans:[]};
 assert.ok(sampleDependents(shared,'v','take2').some(x=>x.includes('두 번째 목소리')));
});
test('다른 목소리의 학습 준비 기록이 참조하는 샘플은 삭제하지 않는다',()=>{
 const shared={...data,projects:[],trainingPlans:[{id:'external-plan',voiceId:'o',sampleSnapshot:[{id:'take1'}]}]};
 assert.ok(sampleDependents(shared,'v','take1').some(x=>x.includes('학습 기록')));
 assert.throws(()=>voiceOwnedFileIds(shared,me),/공유/);
});
test('체크포인트와 같은 원본을 목소리나 곡에서 쓰면 모델 삭제를 차단한다',()=>{
 const model=data.voiceModels[1];
 const shared={...data,projects:[{id:'external-song',title:'보존할 곡',tracks:[{clips:[{assetId:model.assetId}]}]}],voices:[me,{id:'o',name:'다른 목소리',assetId:model.assetId}]};
 const uses=modelDependents(shared,model);
 assert.ok(uses.some(x=>x.includes('보존할 곡')));
 assert.ok(uses.some(x=>x.includes('다른 목소리')));
});
test('학습 자료에서 사용하는 모델 파일과 모델에서 사용하는 샘플 파일은 삭제하지 않는다',()=>{
 const d={...data,projects:[],trainingPlans:[{id:'external',voiceId:'o',sampleIds:['checkpoint-file']}],voiceModels:[{id:'model',voiceId:'v',assetId:'checkpoint-file'},{id:'other-model',voiceId:'o',assetId:'take2'}]};
 assert.ok(modelDependents(d,d.voiceModels[0]).some(x=>x.includes('학습 기록')));
 assert.ok(sampleDependents(d,'v','take2').some(x=>x.includes('모델')));
 assert.throws(()=>voiceOwnedFileIds(d,me),/공유/);
});
