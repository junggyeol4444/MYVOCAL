import test from 'node:test';
import assert from 'node:assert/strict';
import {characterDependents,characterOwnedFileIds,sampleDependents,modelDependents,voiceOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';

const character={id:'original-person',name:'과거 캐릭터',assets:[{id:'portrait-file'}]};
const voice={id:'voice-original',name:'기존 음성',assetId:'voice-file',assets:[{id:'sample-file'}]};
const model={id:'checkpoint-original',voiceId:voice.id,name:'보존 모델',assetId:'model-file'};
const dataFor=(scene)=>({characters:[character],voices:[voice],voiceModels:[model],trainingPlans:[],virtualSingers:[],voicebanks:[],projects:[{id:'p',title:'과거 장면',scenes:[scene]}]});

test('STEP92 history의 원본 장면 characterId가 삭제 보호 대상으로 남는다',()=>{
 const data=dataFor({characterId:'new-person',regeneration92:{history:[{characterId:character.id,imageAssetId:'old-image'}]}});
 assert.ok(characterDependents(data,character).some(x=>x.includes('과거 장면')));
 assert.throws(()=>characterOwnedFileIds(data,character),/연결된 프로젝트/);
});

test('STEP92 과거 장면의 인물 참고 음성 원본을 보호한다',()=>{
 const data=dataFor({regeneration92:{history:[{personMv:{personId:character.id,referenceAssetId:'sample-file'}}]}});
 assert.ok(sampleDependents(data,voice.id,'sample-file').some(x=>x.includes('과거 장면')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
 assert.ok(characterDependents(data,character).length);
});

test('STEP92 과거 장면 내부 sourceAssetId도 체크포인트 삭제 보호에 포함된다',()=>{
 const data=dataFor({regeneration92:{history:[{regeneration92:{sourceAssetId:'model-file'}}]}});
 assert.ok(modelDependents(data,model).some(x=>x.includes('과거 장면')));
});

test('STEP94 이력 래퍼에 직접 저장된 원본과 scene 모두 검사한다',()=>{
 const data=dataFor({characterReplace94:{history:[{imageAssetId:'portrait-file',scene:{characterId:character.id}}]}});
 assert.ok(characterDependents(data,character).length);
 assert.throws(()=>characterOwnedFileIds(data,character),/연결된 프로젝트/);
});

test('수천 단계의 STEP92 직접 스냅샷도 재귀 오류 없이 보호한다',()=>{
 let scene={characterId:character.id};
 for(let i=0;i<15000;i++)scene={regeneration92:{history:[scene]}};
 const data=dataFor(scene);
 assert.ok(characterDependents(data,character).length);
});

test('순환 STEP92 스냅샷을 무한 반복 없이 검사한다',()=>{
 const previous={characterId:character.id};
 const current={regeneration92:{history:[previous]}};
 previous.regeneration92={history:[current]};
 assert.equal(characterDependents(dataFor(current),character).length,1);
});

test('무관한 STEP92 이력만 존재하면 삭제를 잘못 차단하지 않는다',()=>{
 const data=dataFor({regeneration92:{history:[{characterId:'other',personMv:{personId:'other',referenceAssetId:'unrelated'}}]}});
 assert.deepEqual(characterDependents(data,character),[]);
 assert.deepEqual(characterOwnedFileIds(data,character),['portrait-file']);
 assert.deepEqual(sampleDependents(data,voice.id,'sample-file'),[]);
 assert.deepEqual(modelDependents(data,model),[]);
});