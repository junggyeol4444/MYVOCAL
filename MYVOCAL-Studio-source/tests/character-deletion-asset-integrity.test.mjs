import test from 'node:test';
import assert from 'node:assert/strict';
import {characterDependents,characterOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';
const character={id:'c-main',name:'기준 캐릭터',assets:[{id:'portrait-original'},{id:'outfit-original'}]};
const base=()=>({characters:[character],projects:[],voices:[],voiceModels:[],trainingPlans:[],virtualSingers:[]});

test('다른 프로젝트가 캐릭터를 직접 출연시키면 삭제를 막는다',()=>{
 const data={...base(),projects:[{id:'p',title:'현재 영상',characterId:character.id}]};
 assert.ok(characterDependents(data,character).some(s=>s.includes('현재 영상')));
 assert.throws(()=>characterOwnedFileIds(data,character),/연결된 프로젝트/);
});
test('현재 장면과 과거 교체 장면의 캐릭터 참조를 모두 보호한다',()=>{
 const data={...base(),projects:[{id:'p',title:'교체 이력',scenes:[{characterReplace94:{history:[{scene:{characterMv:{characterId:character.id}}}]}}]}]};
 assert.ok(characterDependents(data,character).some(s=>s.includes('교체 이력')));
 assert.throws(()=>characterOwnedFileIds(data,character),/연결된 프로젝트/);
});
test('밴드 구성원의 캐릭터를 삭제하지 않는다',()=>{
 const data={...base(),projects:[{id:'p',title:'밴드',band90:{members:[{characterId:character.id}]}}]};
 assert.ok(characterDependents(data,character).some(s=>s.includes('밴드')));
});
test('다른 캐릭터가 같은 원본을 사용하면 파일 삭제를 막는다',()=>{
 const data={...base(),characters:[character,{id:'c-other',name:'다른 캐릭터',looks:[{referenceAssetId:'portrait-original'}]}]};
 assert.throws(()=>characterOwnedFileIds(data,character),/공유/);
});
test('프로젝트 MV 재생성 이력의 캐릭터 원본을 삭제하지 않는다',()=>{
 const data={...base(),projects:[{id:'p',scenes:[{regeneration92:{history:[{scene:{imageAssetId:'portrait-original'}}]}}]}]};
 assert.throws(()=>characterOwnedFileIds(data,character),/공유/);
});
test('목소리·모델·학습 기록에서 공유하는 캐릭터 첨부 파일을 삭제하지 않는다',()=>{
 for(const change of [
  {voices:[{id:'v',assetId:'portrait-original'}]},
  {voiceModels:[{id:'m',sourceSampleId:'portrait-original'}]},
  {trainingPlans:[{id:'t',sampleSnapshot:[{id:'portrait-original'}]}]}
 ]){
  assert.throws(()=>characterOwnedFileIds({...base(),...change},character),/공유/);
 }
});
test('다른 캐릭터의 참고 파일을 소유 첨부로 확대하여 삭제하지 않는다',()=>{
 const c={...character,referenceId:'external-reference',looks:[{referenceAssetId:'external-look'}],layerPlan:{sourceAssetId:'external-layer'}};
 const data={...base(),characters:[c]};
 assert.deepEqual(new Set(characterOwnedFileIds(data,c)),new Set(['portrait-original','outfit-original']));
});
test('다른 곳에서 사용하지 않는 첨부는 중복 없이 삭제 대상으로 선정한다',()=>{
 const c={...character,assets:[...character.assets,{id:'portrait-original'},null]};
 const data={...base(),characters:[c],projects:[null],voices:[null],voiceModels:[null],trainingPlans:[null]};
 assert.deepEqual(characterOwnedFileIds(data,c),['portrait-original','outfit-original']);
});
test('매우 긴 교체 이력에서도 캐릭터 출연 연결을 보존한다',()=>{
 let scene={personMv:{personId:character.id}};
 for(let i=0;i<14000;i++)scene={characterReplace94:{history:[{scene}]}};
 const data={...base(),projects:[{id:'p',title:'깊은 출연',scenes:[scene]}]};
 assert.ok(characterDependents(data,character).some(s=>s.includes('깊은 출연')));
});
test('순환 참조가 있어도 캐릭터 참조를 검사하고 종료한다',()=>{
 const scene={characterId:character.id};scene.characterReplace94={history:[{scene}]};
 const data={...base(),projects:[{id:'p',scenes:[scene]}]};
 assert.equal(characterDependents(data,character).length,1);
});
test('프로젝트가 캐릭터를 참조하지 않는 경우 잘못 차단하지 않는다',()=>{
 const data={...base(),projects:[{id:'p',scenes:[{characterId:'other'}]}]};
 assert.deepEqual(characterDependents(data,character),[]);
 assert.equal(characterOwnedFileIds(data,character).length,2);
});
test('가상 가수가 캐릭터를 참조하면 삭제하지 않는다',()=>{
 const data={...base(),virtualSingers:[{id:'s',name:'등록 가수',characterId:character.id}]};
 assert.ok(characterDependents(data,character).some(s=>s.includes('등록 가수')));
});