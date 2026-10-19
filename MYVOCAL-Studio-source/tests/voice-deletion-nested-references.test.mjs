import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDependents, modelDependents, voiceOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';

const voice={id:'voice-a',name:'보존할 목소리',assetId:'voice-original',assets:[{id:'sample-original'}]};
const model={id:'model-a',voiceId:voice.id,assetId:'checkpoint-original',sourceSampleId:'sample-original'};
const dataFor=(project,characters=[])=>({voices:[voice],voiceModels:[model],trainingPlans:[],projects:[project],characters});

test('재생성 이력에 보관된 과거 scene 속 음성 원본도 보호한다',()=>{
 const project={id:'p',title:'재생성 이력',scenes:[{regeneration92:{history:[{scene:{personMv:{referenceAssetId:'sample-original'}}}]}}]};
 const data=dataFor(project);
 assert.ok(sampleDependents(data,voice.id,'sample-original').some(x=>x.includes('재생성 이력')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('장면 교체 이력 항목 자체에 저장된 미디어 원본도 보호한다',()=>{
 const project={id:'p',title:'교체 이력',scenes:[{characterReplace94:{history:[{imageAssetId:'sample-original',videoClipAssetId:'checkpoint-original'}]}}]};
 const data=dataFor(project);
 assert.ok(sampleDependents(data,voice.id,'sample-original').some(x=>x.includes('교체 이력')));
 assert.ok(modelDependents(data,model).some(x=>x.includes('교체 이력')));
});

test('수천 번의 장면 교체도 스택 초과 없이 오래된 원본을 보호한다',()=>{
 let scene={imageAssetId:'sample-original'};
 for(let i=0;i<14000;i++)scene={characterReplace94:{history:[{scene}]}};
 const data=dataFor({id:'p',title:'매우 긴 교체 이력',scenes:[scene]});
 assert.ok(sampleDependents(data,voice.id,'sample-original').some(x=>x.includes('매우 긴 교체 이력')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('프로젝트·캐릭터 최상위 배열에 null이 섞여도 유효 참조를 보호한다',()=>{
 const data=dataFor({id:'p',title:'복원 중 프로젝트',scenes:[{imageAssetId:'sample-original'}]},[null,{id:'c',name:'유효 캐릭터',looks:[{referenceAssetId:'checkpoint-original'}]}]);
 data.projects.unshift(null);
 assert.ok(sampleDependents(data,voice.id,'sample-original').some(x=>x.includes('복원 중 프로젝트')));
 assert.ok(modelDependents(data,model).some(x=>x.includes('유효 캐릭터')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('목소리·샘플·모델·학습 목록의 null을 무시하되 공유 샘플을 보호한다',()=>{
 const data={voices:[null,voice,{id:'other',assets:[null,{id:'sample-original'}]}],voiceModels:[null,model],trainingPlans:[null],projects:[],characters:[]};
 assert.ok(sampleDependents(data,voice.id,'sample-original').some(x=>x.includes('other')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('이력에 관련 없는 원본만 있을 때 기존 삭제 대상은 그대로 유지한다',()=>{
 const project={id:'p',scenes:[{regeneration92:{history:[null,{scene:{imageAssetId:'other-image'}}]},characterReplace94:{history:[null,{imageAssetId:'other-image'}]}}]};
 assert.deepEqual(new Set(voiceOwnedFileIds(dataFor(project),voice)),new Set(['voice-original','sample-original','checkpoint-original']));
});