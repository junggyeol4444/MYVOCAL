import test from 'node:test';
import assert from 'node:assert/strict';
import {persistProductionDeliverables} from '../src/lib/productionOutputPersist.js';
import {assetsOf} from '../src/lib/projectBundle.js';
const base=()=>({id:'existing-project',title:'내 한국어 뮤직비디오',tracks:[
 {id:'original-vocal',clips:[{assetId:'original-take'}]}],scenes:[],
 deliverables:[{assetId:'delivery_original',kind:'wav',name:'기존 완성.wav'}]});
const wav=()=>new Blob([new Uint8Array(256)],{type:'audio/wav'});
const webm=()=>new Blob([new Uint8Array(256)],{type:'video/webm'});
const mp4=()=>new Blob([new Uint8Array(256)],{type:'video/mp4'});
function env(project,override={}){
 let active=project,serial=0,stored=[],removed=[],commits=[];
 return {options:{
 current:()=>active,onChange:async next=>{commits.push(next);active=next},
 newId:prefix=>prefix+'_'+(++serial),save:async entries=>{stored=entries},
 remove:async ids=>{removed=ids},now:()=>'2026-10-22T09:00:00.000Z',...override
 },state:()=>({active,stored,removed,commits})};
}
test('완성 Music+MV WAV·WebM·MP4를 원본 변경 없이 세 개 새 자산에 동시 추가',async()=>{
 const project=base(),unchanged=JSON.stringify(project),fixture=env(project);
 const r=await persistProductionDeliverables(project,[
  {kind:'wav',file:wav()},{kind:'webm',file:webm()},{kind:'mp4',file:mp4()}
 ],fixture.options);
 assert.equal(r.count,3);
 assert.equal(fixture.state().stored.length,3);
 assert.equal(fixture.state().active.deliverables.length,4);
 assert.equal(fixture.state().active.deliverables[0].assetId,'delivery_original');
 assert.equal(JSON.stringify(project),unchanged);
 assert.ok(fixture.state().stored.every(([id,file])=>id.startsWith('delivery_')&&file.name.startsWith('MYVOCAL-')));
 assert.ok(assetsOf(r.project,{voices:[],characters:[],voiceModels:[],trainingPlans:[]}).includes('delivery_1'));
});
test('실사 립싱크 MP4는 원본 MP4와 별도 파일 ID·이름 보존',async()=>{
 const project=base(),fixture=env(project);
 const r=await persistProductionDeliverables(project,[
  {kind:'mp4',file:mp4()},{kind:'mp4',variant:'face-lip',file:mp4()}
 ],fixture.options);
 assert.equal(r.files.length,2);
 assert.notEqual(r.files[0].assetId,r.files[1].assetId);
 assert.match(r.files[1].name,/립싱크/);
});
test('원본 사용자 자산과 동일 ID를 반환하면 신규 저장 시작 전에 거부',async()=>{
 const project=base(),fixture=env(project,{newId:()=> 'delivery_original'});
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'wav',file:wav()}],fixture.options),/중복/);
 assert.equal(fixture.state().stored.length,0);assert.equal(fixture.state().active,project);
});
test('저장 전 사용자 취소는 프로젝트를 그대로 보존',async()=>{
 const project=base(),fixture=env(project),controller=new AbortController();controller.abort();
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'wav',file:wav()}],
  {...fixture.options,signal:controller.signal}),/취소/);
 assert.equal(fixture.state().stored.length,0);
});
test('프로젝트 변경 중 신규 자산 저장이 완료돼도 원래 프로젝트는 변경하지 않음',async()=>{
 const project=base(),different=base();different.id='other';
 let writes=0;const fixture=env(project);
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'wav',file:wav()}],{
  ...fixture.options,current:()=>writes++===0?project:different
 }),/취소|변경/);
 assert.equal(fixture.state().commits.length,0);
});
test('신규 프로젝트 메타데이터 커밋 실패 시 새 파일만 롤백',async()=>{
 const project=base(),fixture=env(project,{onChange:async()=>{throw Error('프로젝트 저장 실패')}});
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'webm',file:webm()}],fixture.options),/저장 실패/);
 assert.deepEqual(fixture.state().removed,['delivery_1']);assert.equal(fixture.state().active,project);
});
test('산출물 종류·중복·크기 오류를 저장 전에 거부',async()=>{
 const project=base(),fixture=env(project);
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'wav',file:mp4()}],fixture.options),/형식/);
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'webm',file:webm()},{kind:'webm',file:webm()}],fixture.options),/중복/);
 await assert.rejects(()=>persistProductionDeliverables(project,[{kind:'mp4',file:new Blob([],{type:'video/mp4'})}],fixture.options),/형식/);
 assert.equal(fixture.state().stored.length,0);
});
