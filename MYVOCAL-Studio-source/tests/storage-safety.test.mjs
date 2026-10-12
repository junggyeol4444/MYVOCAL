import test from 'node:test';
import assert from 'node:assert/strict';
import {readDataState,saveData,resetCorruptData,STORAGE_KEY} from '../src/lib/store.js';

function mockStorage(start = {}) {
  const data = new Map(Object.entries(start));
  return {
    data,
    getItem(k) {return data.has(k)?data.get(k):null;},
    setItem(k,v) {data.set(k,String(v));},
    removeItem(k) {data.delete(k);},
  };
}

test('first-run empty workspace is writable and reloads project metadata',()=>{
  const storage=mockStorage();
  const initial=readDataState(storage);
  assert.equal(initial.status,'empty');
  const project={id:'p-1',name:'Reload preserved'};
  assert.equal(saveData({...initial.data,projects:[project]},storage),true);
  const again=readDataState(storage);
  assert.equal(again.status,'ok');
  assert.deepEqual(again.data.projects,[project]);
});
test('valid earlier-version data reads without migration or wiping original',()=>{
  const raw=JSON.stringify({projects:[{id:'legacy'}],voices:[],characters:[],settings:{provider:'MYVOCAL Native'}});
  const storage=mockStorage({[STORAGE_KEY]:raw});
  assert.equal(readDataState(storage).status,'ok');
  assert.equal(readDataState(storage).data.projects[0].id,'legacy');
  assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('malformed JSON remains untouched when an auto-save is attempted',()=>{
  const raw='{ "projects": [broken';
  const storage=mockStorage({[STORAGE_KEY]:raw});
  assert.equal(readDataState(storage).status,'corrupt');
  assert.equal(saveData({projects:[]},storage),false);
  assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('wrong JSON root structure is also protected',()=>{
  const storage=mockStorage({[STORAGE_KEY]:'[]'});
  assert.equal(readDataState(storage).status,'corrupt');
  assert.equal(saveData({projects:[]},storage),false);
  assert.equal(storage.getItem(STORAGE_KEY),'[]');
});
test('explicit recovery preserves exact raw bytes in separate backup key before reset',()=>{
  const raw='garbled \uD55C\uAE00\n {not-json';
  const storage=mockStorage({[STORAGE_KEY]:raw});
  const result=resetCorruptData(storage,new Date('2026-10-11T12:00:00.000Z'));
  assert.equal(storage.getItem(result.backupKey),raw);
  assert.equal(readDataState(storage).status,'ok');
  assert.deepEqual(readDataState(storage).data.projects,[]);
  assert.ok(result.backupKey.startsWith(STORAGE_KEY+'-corrupt-backup-'));
});
test('failed recovery backup never overwrites the original',()=>{
  const raw='{bad';const storage=mockStorage({[STORAGE_KEY]:raw});
  storage.setItem=(key,value)=>{if(key!==STORAGE_KEY)throw Error('quota exceeded');storage.data.set(key,value);};
  assert.throws(()=>resetCorruptData(storage),/quota exceeded/);
  assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('storage access denied surfaces unavailable status',()=>{
  const storage={getItem(){throw Error('access denied')}};
  assert.equal(readDataState(storage).status,'unavailable');
  assert.equal(saveData({},storage),false);
});
test('failed ordinary save never claims success',()=>{
  const storage=mockStorage();
  storage.setItem=()=>{throw Error('quota exceeded')};
  assert.equal(saveData({projects:[]},storage),false);
  assert.equal(storage.getItem(STORAGE_KEY),null);
});
