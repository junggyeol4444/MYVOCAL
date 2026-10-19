import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalWithManifest,listRestorableDeletedCharacters,restoreDeletedCharacterFromManifest} from '../src/lib/characterDeletionManifest.js';
import {restoreCharacterProfileFromBackup} from '../src/lib/characterDeletionRestore.js';
import {commitCharacterProfileRemoval} from '../src/lib/characterDeletionPersistence.js';
const KEY='myvocal-studio-v01';
const fixture=()=>({characters:[{id:'c1',name:'가수'},{id:'c2',name:'동료'}],projects:[],voices:[],settings:{theme:'dark'}});
function memory(data=fixture()){
 const values=new Map([[KEY,JSON.stringify(data)]]);
 return {values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>{values.set(k,String(v));},key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
}
function deleted(){
 const s=memory(),meta=backupCharacterRemovalWithManifest(s,KEY,'c1',100);
 const next=JSON.parse(s.getItem(KEY));next.characters=next.characters.filter(c=>c.id!=='c1');s.setItem(KEY,JSON.stringify(next));
 return {s,meta};
}
test('복원 직전 콜백이 작업 공간을 수정하면 외부 변경을 덮어쓰지 않는다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY);
 assert.throws(()=>restoreCharacterProfileFromBackup(s,KEY,meta.backupKey,'c1',before,101,()=>{
  s.setItem(KEY,JSON.stringify({...JSON.parse(before),settings:{theme:'other-window'}}));
 }),/변경|중단/);
 assert.equal(JSON.parse(s.getItem(KEY)).settings.theme,'other-window');
});
test('복원 직전 콜백이 원본 복구본을 수정하면 복원을 중단한다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY);
 assert.throws(()=>restoreCharacterProfileFromBackup(s,KEY,meta.backupKey,'c1',before,101,()=>s.setItem(meta.backupKey,'{}')),/변경|중단/);
 assert.equal(s.getItem(KEY),before);
});
test('복원 직전 콜백이 예외 없이 원문을 유지하면 정상 복원한다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY);
 const result=restoreCharacterProfileFromBackup(s,KEY,meta.backupKey,'c1',before,101,()=>{});
 assert.equal(result.data.characters[0].id,'c1');
});
test('manifest 선택 복원 중 재검사 직후 작업 공간이 바뀌면 복원하지 않는다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY),get=s.getItem;
 let seen=0;
 s.getItem=k=>{if(k===meta.manifestKey && ++seen===3){s.setItem(KEY,JSON.stringify({...JSON.parse(before),settings:{theme:'other-window'}}));}return get(k);};
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,before,101),/변경|중단/);
 assert.equal(JSON.parse(s.getItem(KEY)).settings.theme,'other-window');
});
test('중복된 다른 캐릭터 ID가 있는 작업 공간에서 삭제용 manifest를 만들지 않는다',()=>{
 const d=fixture();d.characters.push({...d.characters[1]});const s=memory(d);
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',100),/중복/);
 assert.equal(s.length,1);
});
test('누락된 다른 캐릭터 ID가 있는 작업 공간에서 삭제용 manifest를 만들지 않는다',()=>{
 const d=fixture();d.characters.push({name:'식별 불가'});const s=memory(d);
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',100),/ID/);
 assert.equal(s.length,1);
});
test('null 캐릭터가 있는 작업 공간에서 삭제용 manifest를 만들지 않는다',()=>{
 const d=fixture();d.characters.push(null);const s=memory(d);
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',100),/캐릭터/);
 assert.equal(s.length,1);
});
test('복구 목록 조회 도중 다른 창이 작업 공간을 수정하면 오래된 목록을 반환하지 않는다',()=>{
 const {s}=deleted(),key=s.key;
 let triggered=false;
 s.key=i=>{if(!triggered){triggered=true;const d=JSON.parse(s.getItem(KEY));d.settings.theme='changed';s.setItem(KEY,JSON.stringify(d));}return key(i);};
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/변경|중단/);
});
test('복구 목록 조회 도중 복구본이 수정되면 오래된 목록을 반환하지 않는다',()=>{
 const {s,meta}=deleted(),get=s.getItem;
 let seen=0;
 s.getItem=k=>{const value=get(k);if(k===meta.manifestKey && ++seen===1)s.setItem(meta.backupKey,'{}');return value;};
 assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
});
test('삭제 영구 저장이 성공한 뒤 재읽기 실패하면 삭제 미실시라고 확정하지 않는다',()=>{
 const s=memory(),data=fixture();let changed=false;
 const persist=next=>{s.setItem(KEY,JSON.stringify(next));changed=true;return true;};
 const read=()=>({status:'ok',data:changed?{...fixture(),settings:{theme:'external'}}:fixture()});
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',persist,read,()=>({backupKey:'backup',manifestKey:'backup-manifest'})),/확인 필요|확인하지 못|복구 키/);
 assert.equal(JSON.parse(s.getItem(KEY)).characters.some(c=>c.id==='c1'),false);
});
test('삭제 영구 저장 성공·재읽기 정상일 때 복구 키와 보존 파일 ID를 반환한다',()=>{
 const data=fixture();data.characters[0].assets=[{id:'media-1'},{id:'media-1'}];let current=structuredClone(data);
 const persist=next=>{current=structuredClone(next);return true;};
 const read=()=>({status:'ok',data:current});
 const result=commitCharacterProfileRemoval(data,'c1',persist,read,()=>({backupKey:'backup',manifestKey:'backup-manifest'}));
 assert.deepEqual(result.preservedFileIds,['media-1']);assert.equal(result.manifestKey,'backup-manifest');
});
test('manifest 목록 정상 조회 시 저장소를 수정하지 않는다',()=>{
 const {s}=deleted(),before=[...s.values.entries()];
 assert.equal(listRestorableDeletedCharacters(s,KEY).length,1);
 assert.deepEqual([...s.values.entries()],before);
});
test('삭제 저장 콜백이 실제로 쓴 뒤 오류를 던지면 결과 불확실과 복구 키를 안내한다',()=>{
 const s=memory(),data=fixture(),persist=next=>{s.setItem(KEY,JSON.stringify(next));throw Error('quota-after-write');};
 const read=()=>({status:'ok',data:JSON.parse(s.getItem(KEY))});
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',persist,read,()=>({backupKey:'backup',manifestKey:'backup-manifest'})),error=>{
  assert.match(error.message,/삭제 결과 확인 필요/);assert.match(error.message,/복구 키: backup/);assert.match(error.message,/quota-after-write/);return true;
 });
 assert.equal(JSON.parse(s.getItem(KEY)).characters.some(c=>c.id==='c1'),false);
});
test('삭제 저장 성공 후 재읽기 불일치 시 복구 키와 확인 필요를 안내한다',()=>{
 const s=memory(),data=fixture();let wrote=false;
 const read=()=>({status:'ok',data:wrote?{...fixture(),settings:{theme:'changed'}}:fixture()});
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',next=>{wrote=true;s.setItem(KEY,JSON.stringify(next));return true;},read,()=>({backupKey:'backup',manifestKey:'backup-manifest'})),error=>{
  assert.match(error.message,/삭제 결과 확인 필요/);assert.match(error.message,/복구 키: backup/);return true;
 });
});