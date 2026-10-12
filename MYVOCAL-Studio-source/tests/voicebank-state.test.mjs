import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData,saveData,updateEntity} from '../src/lib/store.js';
import {newProject} from '../src/lib/schema.js';
test('new voicebank profile metadata and selected project bank survive local store roundtrip',()=>{
 const entries=new Map(),original=globalThis.localStorage;
 globalThis.localStorage={getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>{entries.set(k,v)}};
 try{
  const p={...newProject({title:'보이스뱅크 테스트'}),openUtauVoicebankId:'b1'};
  const profile={id:'b1',name:'Korean CV',aliases:['a','ha'],mappingText:'안=a\n하=ha',singer:'Korean CV',format:'MYVOCAL_OTO_PROFILE'};
  let d=loadData();d=updateEntity(d,'projects',p);d=updateEntity(d,'voicebanks',profile);
  assert.equal(saveData(d),true);const reloaded=loadData();assert.equal(reloaded.voicebanks[0].mappingText,profile.mappingText);
  assert.equal(reloaded.projects[0].openUtauVoicebankId,'b1');
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});
