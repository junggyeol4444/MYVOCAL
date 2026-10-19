import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleDependents, modelDependents, voiceOwnedFileIds } from '../src/lib/voiceDeletionSafety.js';

const voice = { id: 'v1', name: '본인 목소리', assetId: 'voice-main', assets: [{id: 'sample-a'}] };
const model = { id: 'm1', voiceId: 'v1', name: '기존 모델', assetId: 'model-file', sourceSampleId: 'sample-a' };
const base = () => ({voices:[voice],voiceModels:[model],trainingPlans:[],projects:[],characters:[]});

test('장면 교체 이력 안의 원본 사진이 삭제 보호 대상이다',()=>{
 const data={...base(),projects:[{id:'p',title:'교체 이력',scenes:[{characterReplace94:{history:[{scene:{regeneration92:{sourceAssetId:'sample-a'}}}]}}]}]};
 assert.ok(sampleDependents(data,'v1','sample-a').some(x=>x.includes('교체 이력')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('과거 장면 재생성의 영상 체크포인트 원본은 모델 삭제에서 보호한다',()=>{
 const data={...base(),projects:[{id:'p',title:'재생성 기록',scenes:[{characterReplace94:{history:[{scene:{regeneration92:{history:[{videoClipAssetId:'model-file'}]}}}]}}]}]};
 assert.ok(modelDependents(data,model).some(x=>x.includes('재생성 기록')));
});

test('캐릭터 2D/3D/립싱크 원본 참조는 음성 모델 삭제에서 보호한다',()=>{
 const data={...base(),characters:[{id:'c',name:'등록 가수',layerPlan:{sourceAssetId:'model-file'},animation2d:{sourceAssetId:'sample-a'},personLipSync:{audioAssetId:'voice-main'}}]};
 assert.ok(modelDependents(data,model).some(x=>x.includes('등록 가수')));
 assert.ok(sampleDependents(data,'v1','sample-a').some(x=>x.includes('등록 가수')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('캐릭터 외형 참조에만 존재하는 음성 파일도 보호한다',()=>{
 const data={...base(),characters:[{id:'c',name:'의상',looks:[{referenceAssetId:'voice-main'}]}]};
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('트랙의 기존 원본 참조도 계속 보호한다',()=>{
 const data={...base(),projects:[{id:'p',title:'트랙 곡',tracks:[{clips:[{assetId:'sample-a'}]}]}]};
 assert.ok(sampleDependents(data,'v1','sample-a').some(x=>x.includes('트랙 곡')));
});

test('관련 없는 장면·캐릭터 파일은 기존 목소리 삭제를 차단하지 않는다',()=>{
 const data={...base(),projects:[{id:'p',scenes:[{imageAssetId:'other-image',videoClipAssetId:'other-video'}]}],characters:[{id:'c',assets:[{id:'other-image'}],rig3d:{assetId:'other-model'}}]};
 assert.deepEqual(new Set(voiceOwnedFileIds(data,voice)),new Set(['voice-main','sample-a','model-file']));
 assert.deepEqual(modelDependents(data,model),[]);
});

test('외부 프로젝트가 없는 빈 저장소에서는 기존 파일 집합을 보존한다',()=>{
 const data={...base(),projects:[],characters:[]};
 assert.deepEqual(new Set(voiceOwnedFileIds(data,voice)),new Set(['voice-main','sample-a','model-file']));
});

test('동일 원본을 두 캐릭터가 참조해도 삭제를 안전하게 차단한다',()=>{
 const data={...base(),characters:[{id:'c1',name:'첫 캐릭터',referenceId:'sample-a'},{id:'c2',name:'둘째 캐릭터',videoAssetId:'sample-a'}]};
 const uses=sampleDependents(data,'v1','sample-a');
 assert.equal(uses.filter(x=>x.includes('캐릭터')).length,2);
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});