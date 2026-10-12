import test from 'node:test';
import assert from 'node:assert/strict';
import {hangulHint,singingCapabilitiesView,engineModelCompatibility,buildSingingRequest,appendRenderHistory} from '../src/lib/singingBridge.js';
test('한글 음절에서 초성/중성/종성 분해',()=>{
 assert.deepEqual(hangulHint('안'),{onset:'ㅇ',vowel:'ㅏ',coda:'ㄴ'});
 assert.deepEqual(hangulHint('꽃'),{onset:'ㄲ',vowel:'ㅗ',coda:'ㅊ'});
 assert.deepEqual(hangulHint('abc'),null);
});
test('기존 v1.0 엔진은 목록 미지원, 사전검증 미확정',()=>{
 const c=singingCapabilitiesView({supported:false});assert.equal(c.supported,false);assert.equal(c.inferenceReady,false);
});
test('엔진 호환성과 체크포인트 유무 검사',()=>{
 const c=singingCapabilitiesView({protocol:'MYVOCAL_SINGING_V1',supported:true,mode:'neural',inferenceReady:true,models:[{id:'voice1',name:'Voice 1',engineId:'svc'}]});
 assert.equal(engineModelCompatibility(c,{id:'voice1',engineId:'svc'}).ok,true);
 assert.equal(engineModelCompatibility(c,{id:'bad',engineId:'svc'}).ok,false);
 assert.equal(engineModelCompatibility(c,{id:'voice1',engineId:'rvc'}).ok,false);
});
test('보컬 요청이 초중종성 힌트와 모델을 포함',()=>{
 const p={title:'test'},v={id:'v1',name:'나',rights:'self'},align={bpm:120,cues:[{lyric:'노',pitch:68,startSec:0,endSec:1,velocity:95}]};
 const request=buildSingingRequest(7867,p,align,v,{id:'model1',name:'모델',engineId:'svc'});
 assert.deepEqual(request.cues[0].hangul,{onset:'ㄴ',vowel:'ㅗ',coda:''});
 assert.equal(request.checkpoint.id,'model1');
 assert.throws(()=>buildSingingRequest(7867,p,align,{...v,rights:'reference'},null));
});
test('생성 작업 로그는 최대 20개 유지',()=>{
 let h=[];for(let i=0;i<22;i++)h=appendRenderHistory(h,{id:String(i),result:'WAV 수신',notes:1});
 assert.equal(h.length,20);assert.equal(h[0].id,'2');assert.equal(h[19].id,'21');
});
