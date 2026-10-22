import test from 'node:test';
import assert from 'node:assert/strict';
import {readSavedProductionOutput} from '../src/lib/productionOutputRetrieval.js';

const create=()=>{
 const file=new Blob([new Uint8Array(256)],{type:'video/mp4'});
 const entry={assetId:'delivery_generated_48',kind:'mp4',variant:'base',mime:'video/mp4',
  name:'MYVOCAL-내곡-완성.mp4',size:file.size,createdAt:'2026-10-22T02:00:00.000Z'};
 const project={id:'prj_48',deliverables:[entry]};
 return {file,entry,project};
};
test('동일 프로젝트의 완성 MP4를 IndexedDB 원본 그대로 다시 열기',async()=>{
 const {file,entry,project}=create();let reads=0;
 const original=await readSavedProductionOutput(project,entry,{load:async id=>{
  assert.equal(id,entry.assetId);reads++;return file;
 }});
 assert.equal(original.file,file);assert.equal(original.name,entry.name);assert.equal(original.kind,'mp4');
 assert.equal(reads,1);
});
test('프로젝트 목록에 없는 타 사용자·다른 프로젝트 자산을 읽지 않음',async()=>{
 const {file,entry,project}=create();let reads=0;
 await assert.rejects(()=>readSavedProductionOutput({...project,deliverables:[]},entry,
  {load:async()=>{reads++;return file}}),/현재 프로젝트/);
 assert.equal(reads,0);
});
test('산출물 ID·종류·생성 시간이 바뀌면 기존 자산 조회를 거부',async()=>{
 const {file,entry,project}=create();let reads=0;
 for(const tampered of [{...entry,kind:'wav'},{...entry,createdAt:'2020-01-01'},{...entry,assetId:'delivery_other'}]){
  await assert.rejects(()=>readSavedProductionOutput(project,tampered,
   {load:async()=>{reads++;return file}}),/현재 프로젝트/);
 }
 assert.equal(reads,0);
});
test('원본 파일이 없어졌거나 크기·MIME 정보가 바뀌면 오류',async()=>{
 const {entry,project}=create();
 for(const returned of [null,new Blob([new Uint8Array(8)],{type:'video/mp4'}),
  new Blob([new Uint8Array(256)],{type:'video/webm'})]){
  await assert.rejects(()=>readSavedProductionOutput(project,entry,{load:async()=>returned}),/누락|변경/);
 }
});
test('비정상 파일명과 자산 ID를 다운로드 전에 차단',async()=>{
 const {entry,project,file}=create();
 for(const bad of ['../../임의.mp4','C:/원본.mp4','잘못된.avi']){
  const e={...entry,name:bad};
  await assert.rejects(()=>readSavedProductionOutput({...project,deliverables:[e]},e,
   {load:async()=>file}),/파일명/);
 }
 const item={...entry,assetId:'wrong_id'};
 await assert.rejects(()=>readSavedProductionOutput({...project,deliverables:[item]},item,
  {load:async()=>file}),/정보/);
});
test('이전 Windows 생성 결과에서 파일명이 한국어여도 변경 없이 반환',async()=>{
 const {entry,project}=create();
 const f=new File([new Uint8Array(256)],'원본 저장 영상.mp4',{type:'video/mp4'});
 const output=await readSavedProductionOutput(project,entry,{load:async()=>f});
 assert.equal(output.file,f);assert.equal(output.name,'MYVOCAL-내곡-완성.mp4');
});
