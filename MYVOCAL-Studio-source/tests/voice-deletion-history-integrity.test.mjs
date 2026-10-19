import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDependents,modelDependents,voiceOwnedFileIds} from '../src/lib/voiceDeletionSafety.js';

const voice={id:'voice1',name:'내 목소리',assetId:'audio1',assets:[{id:'sample1'}]};
const model={id:'model1',voiceId:'voice1',assetId:'checkpoint1',sourceSampleId:'sample1'};
const dataWith=(project,character)=>({voices:[voice],voiceModels:[model],trainingPlans:[],projects:project?[project]:[],characters:character?[character]:[]});

function nestedReplacement(depth,finalAsset){
 let scene={id:'oldest',personMv:{referenceAssetId:finalAsset}};
 for(let i=0;i<depth;i++)scene={id:'version-'+i,characterReplace94:{history:[{scene}]}};
 return scene;
}

test('10회를 초과한 과거 장면 교체 이력의 원본 음성은 삭제할 수 없다',()=>{
 const project={id:'p',title:'긴 교체 이력',scenes:[nestedReplacement(12,'sample1')]};
 const data=dataWith(project);
 assert.ok(sampleDependents(data,voice.id,'sample1').some(x=>x.includes('긴 교체 이력')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('깊은 교체 이력 속 모델 체크포인트 파일도 삭제 차단한다',()=>{
 const project={id:'p',title:'모델 교체 이력',scenes:[nestedReplacement(14,'checkpoint1')]};
 assert.ok(modelDependents(dataWith(project),model).some(x=>x.includes('모델 교체 이력')));
});

test('반복된 과거 장면 참조는 무한 순회하지 않고 보호한다',()=>{
 const scene={id:'cycle',imageAssetId:'sample1'};
 scene.characterReplace94={history:[{scene}]};
 const data=dataWith({id:'p',title:'순환',scenes:[scene]});
 assert.ok(sampleDependents(data,voice.id,'sample1').length>0);
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('불완전한 장면·클립 이력의 null 항목이 정상 참조 보호를 무력화하지 않는다',()=>{
 const data=dataWith({id:'p',title:'부분 복원',tracks:[null,{clips:[null,{assetId:'sample1'}]}],scenes:[null,{characterReplace94:{history:[null,{scene:{imageAssetId:'checkpoint1'}}]}}]});
 assert.ok(sampleDependents(data,voice.id,'sample1').length>0);
 assert.ok(modelDependents(data,model).some(x=>x.includes('부분 복원')));
 assert.throws(()=>voiceOwnedFileIds(data,voice),/공유/);
});

test('캐릭터 참조 배열의 null 항목과 정상 참조를 함께 안전하게 검사한다',()=>{
 const data=dataWith(null,{id:'c',name:'미완성 캐릭터',assets:[null,{id:'sample1'}],looks:[null,{referenceAssetId:'checkpoint1'}]});
 assert.ok(sampleDependents(data,voice.id,'sample1').some(x=>x.includes('미완성 캐릭터')));
 assert.ok(modelDependents(data,model).some(x=>x.includes('미완성 캐릭터')));
});

test('무관한 과거 장면이 아무리 많아도 기존 소유 파일 삭제 대상 집합을 바꾸지 않는다',()=>{
 const project={id:'p',scenes:[nestedReplacement(13,'unrelated')]};
 assert.deepEqual(new Set(voiceOwnedFileIds(dataWith(project),voice)),new Set(['audio1','sample1','checkpoint1']));
});