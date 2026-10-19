import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDependents,modelDependents,voiceOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';

const voice={id:'my-voice',name:'내 목소리',assetId:'my-audio',assets:[{id:'shared-sample'}]};
const checkpoint={id:'my-model',voiceId:'my-voice',assetId:'shared-checkpoint'};
const base={voices:[voice],voiceModels:[checkpoint],trainingPlans:[],projects:[],characters:[]};

test('MV 장면·장면 재생성 이력에서 사용하는 샘플은 삭제 차단',()=>{
 const project={id:'song',title:'영상 곡',scenes:[{
  imageAssetId:'shared-sample',regeneration92:{history:[{videoClipAssetId:'shared-checkpoint'}]},
  characterReplace94:{history:[{scene:{personMv:{referenceAssetId:'my-audio'}}}]}
 }]};
 const data={...base,projects:[project]};
 assert.ok(sampleDependents(data,voice.id,'shared-sample').some(x=>x.includes('영상 곡')));
 assert.ok(modelDependents(data,checkpoint).some(x=>x.includes('영상 곡')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('등록 캐릭터가 참조하는 음성/체크포인트 원본은 삭제 차단',()=>{
 const character={id:'char',name:'등록 캐릭터',looks:[{referenceAssetId:'shared-sample'}],personLipSync:{audioAssetId:'shared-checkpoint'}};
 const data={...base,characters:[character]};
 assert.ok(sampleDependents(data,voice.id,'shared-sample').some(x=>x.includes('등록 캐릭터')));
 assert.ok(modelDependents(data,checkpoint).some(x=>x.includes('등록 캐릭터')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('다른 미디어 참조가 없으면 기존 삭제 대상 선택 유지',()=>{
 const data={...base,projects:[{id:'p',scenes:[{imageAssetId:'unrelated'}]}],characters:[{id:'c',assetId:'unrelated'}]};
 assert.deepEqual(new Set(voiceOwnedFileIds(data,voice)),new Set(['my-audio','shared-sample','shared-checkpoint']));
 assert.deepEqual(sampleDependents(data,voice.id,'shared-sample'),[]);
 assert.deepEqual(modelDependents(data,checkpoint),[]);
});