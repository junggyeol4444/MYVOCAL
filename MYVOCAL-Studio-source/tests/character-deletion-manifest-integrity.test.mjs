import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalWithManifest,listRestorableDeletedCharacters,restoreDeletedCharacterFromManifest} from '../src/lib/characterDeletionManifest.js';
import {restoreCharacterProfileFromBackup} from '../src/lib/characterDeletionRestore.js';
const KEY='myvocal-studio-v01';
const fixture=()=>({characters:[{id:'c1',name:'가수'},{id:'c2',name:'동료'}],projects:[],voices:[],settings:{theme:'dark'}});
function memory(){
 const values=new Map([[KEY,JSON.stringify(fixture())]]);
 return {values,getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,String(v)),key:i=>[...values.keys()][i]??null,
  get length(){return values.size;}};
}
function deleted(){
 const s=memory(),meta=backupCharacterRemovalWithManifest(s,KEY,'c1',123);
 const current=JSON.parse(s.getItem(KEY));current.characters=current.characters.filter(c=>c.id!=='c1');
 s.setItem(KEY,JSON.stringify(current));return {s,meta};
}
test('목록 메타데이터의 생성 시각이 원본 복구 키와 다르면 목록에서 제외한다',()=>{
 const {s,meta}=deleted(),m=JSON.parse(s.getItem(meta.manifestKey));m.createdAt=999;
 s.setItem(meta.manifestKey,JSON.stringify(m));
 assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
});
test('생성 시각이 위조된 목록으로 복원할 수 없다',()=>{
 const {s,meta}=deleted(),m=JSON.parse(s.getItem(meta.manifestKey));m.createdAt=999;
 s.setItem(meta.manifestKey,JSON.stringify(m));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/시각/);
});
test('목록 저장 중 원문 복구본이 바뀌면 삭제 준비를 중단한다',()=>{
 const s=memory(),raw=s.getItem(KEY),set=s.setItem;
 s.setItem=(k,v)=>{set(k,v);if(k.endsWith('-manifest'))set(k.slice(0,-9),'{}');};
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',123),/변경|일치|중단/);
 assert.equal(s.getItem(KEY),raw);
});
test('목록 저장 중 현재 작업 공간이 바뀌면 삭제 준비를 중단한다',()=>{
 const s=memory(),set=s.setItem;
 s.setItem=(k,v)=>{set(k,v);if(k.endsWith('-manifest'))set(KEY,JSON.stringify({...fixture(),settings:{theme:'changed'}}));};
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',123),/변경|일치|중단/);
 assert.equal(JSON.parse(s.getItem(KEY)).settings.theme,'changed');
});
test('선택 복원 도중 복구 목록이 변경되면 프로필을 쓰지 않는다',()=>{
 const {s,meta}=deleted(),raw=s.getItem(KEY),set=s.setItem;
 s.setItem=(k,v)=>{set(k,v);if(k.includes('-character-restore-before-'))set(meta.manifestKey,'{}');};
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,raw,124),/목록.*변경/);
 assert.equal(s.getItem(KEY),raw);
});
test('복원 직전 검사 콜백 실패 시 기존 작업 공간을 보존한다',()=>{
 const {s,meta}=deleted(),raw=s.getItem(KEY);
 assert.throws(()=>restoreCharacterProfileFromBackup(s,KEY,meta.backupKey,'c1',raw,124,()=>{throw Error('동시 변경');}),/동시 변경/);
 assert.equal(s.getItem(KEY),raw);
});
test('잘못된 복원 직전 검사 콜백을 거부한다',()=>{
 const {s,meta}=deleted(),raw=s.getItem(KEY);
 assert.throws(()=>restoreCharacterProfileFromBackup(s,KEY,meta.backupKey,'c1',raw,124,'bad'),/검사/);
 assert.equal(s.getItem(KEY),raw);
});
test('현재 작업 공간에 다른 ID 중복이 있으면 복원하지 않는다',()=>{
 const {s,meta}=deleted(),current=JSON.parse(s.getItem(KEY));
 current.characters.push({...current.characters[0]});s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/중복/);
});
test('복구본에 다른 ID 중복이 있으면 복원하지 않는다',()=>{
 const {s,meta}=deleted(),snapshot=JSON.parse(s.getItem(meta.backupKey));
 snapshot.characters.push({...snapshot.characters[1]});s.setItem(meta.backupKey,JSON.stringify(snapshot));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/중복/);
});
test('현재 작업 공간에 ID가 없는 캐릭터가 있으면 복원하지 않는다',()=>{
 const {s,meta}=deleted(),current=JSON.parse(s.getItem(KEY));
 current.characters.push({name:'식별 불가'});s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/ID/);
});
test('복구본에 null 캐릭터가 있으면 복원하지 않는다',()=>{
 const {s,meta}=deleted(),snapshot=JSON.parse(s.getItem(meta.backupKey));
 snapshot.characters.push(null);s.setItem(meta.backupKey,JSON.stringify(snapshot));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/캐릭터/);
});
test('중복 ID가 있는 현재 작업 공간에서는 복구 목록 조회를 차단한다',()=>{
 const {s}=deleted(),current=JSON.parse(s.getItem(KEY));
 current.characters.push({...current.characters[0]});s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/중복/);
});
test('ID 없는 캐릭터가 있는 현재 작업 공간에서는 복구 목록 조회를 차단한다',()=>{
 const {s}=deleted(),current=JSON.parse(s.getItem(KEY));
 current.characters.push({name:'누락'});s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/ID/);
});
test('정상 목록과 복원은 강화된 무결성 검사 뒤에도 기존 데이터를 보존한다',()=>{
 const {s,meta}=deleted(),raw=s.getItem(KEY);
 const list=listRestorableDeletedCharacters(s,KEY);assert.equal(list.length,1);
 const r=restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,raw,124);
 assert.deepEqual(r.data.characters.map(c=>c.id),['c1','c2']);
 assert.equal(r.data.settings.theme,'dark');
 assert.equal(s.getItem(r.beforeRestoreKey),raw);
});