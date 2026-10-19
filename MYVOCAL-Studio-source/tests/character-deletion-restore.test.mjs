import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalState} from '../src/lib/characterDeletionRecovery.js';
import {inspectCharacterDeletionBackup,listCharacterDeletionBackups,restoreCharacterProfileFromBackup} from '../src/lib/characterDeletionRestore.js';
const KEY='myvocal-studio-v01';
const original=()=>({characters:[{id:'c1',name:'원본 캐릭터',assets:[{id:'asset'}]},{id:'c2',name:'보존 캐릭터'}],projects:[],voices:[],virtualSingers:[],settings:{theme:'dark'}});
function memory(data=original()){
 const values=new Map([[KEY,JSON.stringify(data)]]);
 return {values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>{values.set(k,String(v));},key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
}
function prepare(){const s=memory();const backupKey=backupCharacterRemovalState(s,KEY,'c1',101);const data=JSON.parse(s.getItem(KEY));data.characters=data.characters.filter(c=>c.id!=='c1');s.setItem(KEY,JSON.stringify(data));return {s,backupKey};}
const restore=({s,backupKey},stamp=102)=>restoreCharacterProfileFromBackup(s,KEY,backupKey,'c1',s.getItem(KEY),stamp);

test('캐릭터 프로필만 복원하며 현재 프로젝트·설정과 다른 캐릭터를 유지한다',()=>{
 const p=prepare();const current=JSON.parse(p.s.getItem(KEY));current.projects.push({id:'p-new'});current.settings.theme='light';p.s.setItem(KEY,JSON.stringify(current));
 const before=p.s.getItem(KEY);const result=restore(p);
 assert.deepEqual(result.data.characters.map(c=>c.id),['c1','c2']);
 assert.deepEqual(result.data.projects,[{id:'p-new'}]);assert.equal(result.data.settings.theme,'light');
 assert.equal(p.s.getItem(result.beforeRestoreKey),before);
 assert.equal(JSON.parse(p.s.getItem(p.backupKey)).characters.length,2);
});
test('읽기 전용 복구본 검사에서 캐릭터 이름과 원래 순서를 확인한다',()=>{
 const p=prepare();const info=inspectCharacterDeletionBackup(p.s,KEY,p.backupKey,'c1');
 assert.equal(info.characterName,'원본 캐릭터');assert.equal(info.originalIndex,0);
});
test('여러 복구본을 조회하되 손상된 복구본은 수정하지 않는다',()=>{
 const p=prepare();p.s.setItem(`${KEY}-character-delete-backup-102`,p.s.getItem(p.backupKey));
 p.s.setItem(`${KEY}-character-delete-backup-103`,'{손상');
 const count=p.s.values.size;const result=listCharacterDeletionBackups(p.s,KEY,'c1');
 assert.equal(result.length,2);assert.equal(p.s.values.size,count);
 assert.equal(p.s.getItem(`${KEY}-character-delete-backup-103`),'{손상');
});
test('다른 캐릭터 ID와 잘못된 복구 키를 거부한다',()=>{
 const p=prepare();
 assert.throws(()=>inspectCharacterDeletionBackup(p.s,KEY,p.backupKey,'missing'),/유일하게/);
 assert.throws(()=>inspectCharacterDeletionBackup(p.s,KEY,KEY,'c1'),/식별자/);
});
test('복구본에 중복 ID가 있으면 복원하지 않는다',()=>{
 const p=prepare(),snapshot=JSON.parse(p.s.getItem(p.backupKey));snapshot.characters.push(snapshot.characters[0]);p.s.setItem(p.backupKey,JSON.stringify(snapshot));
 assert.throws(()=>restore(p),/유일하게/);
});
test('현재 작업 공간에 같은 캐릭터가 있으면 덮어쓰지 않는다',()=>{
 const p=prepare();const current=JSON.parse(p.s.getItem(KEY));current.characters.push({id:'c1',name:'새 캐릭터'});p.s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>restore(p),/동일한 캐릭터 ID/);
 assert.equal(JSON.parse(p.s.getItem(KEY)).characters.at(-1).name,'새 캐릭터');
});
test('사용자가 확인한 원문과 현재 원문이 다르면 복구를 차단한다',()=>{
 const p=prepare();const expected=p.s.getItem(KEY);p.s.setItem(KEY,expected+' ');
 assert.throws(()=>restoreCharacterProfileFromBackup(p.s,KEY,p.backupKey,'c1',expected,102),/다른 창/);
 assert.equal(p.s.values.size,2);
});
test('복구 직전 보존 저장이 quota로 실패하면 현재 데이터를 유지한다',()=>{
 const p=prepare();const before=p.s.getItem(KEY),write=p.s.setItem;
 p.s.setItem=(k,v)=>{if(k.includes('restore-before'))throw Error('quota');write(k,v);};
 assert.throws(()=>restore(p),/보존하지 못해/);
 assert.equal(p.s.getItem(KEY),before);
});
test('복구 직전 보존 키가 충돌하면 기존 키를 덮어쓰지 않는다',()=>{
 const p=prepare();const key=`${KEY}-character-restore-before-102`;p.s.setItem(key,'기존 원문');
 const result=restore(p);assert.equal(result.beforeRestoreKey,key+'-1');assert.equal(p.s.getItem(key),'기존 원문');
});
test('복구 중 다른 창이 변경하면 복구를 중단하고 그 변경을 보존한다',()=>{
 const p=prepare();const write=p.s.setItem;
 p.s.setItem=(k,v)=>{write(k,v);if(k.includes('restore-before'))write(KEY,JSON.stringify({...JSON.parse(p.s.getItem(KEY)),projects:[{id:'다른창'}]}));};
 assert.throws(()=>restore(p),/복구 중 원본 데이터가 변경/);
 assert.equal(JSON.parse(p.s.getItem(KEY)).projects[0].id,'다른창');
});
test('복구 중 백업 자체가 변경되면 복구를 중단한다',()=>{
 const p=prepare(),write=p.s.setItem;
 p.s.setItem=(k,v)=>{write(k,v);if(k.includes('restore-before'))write(p.backupKey,'{}');};
 assert.throws(()=>restore(p),/복구 중 원본 데이터가 변경/);
});
test('복구 저장 결과 재읽기 실패 시 성공으로 보고하지 않고 직전 원문을 보존한다',()=>{
 const p=prepare();const raw=p.s.getItem(KEY),write=p.s.setItem;
 p.s.setItem=(k,v)=>{if(k===KEY){write(k,'잘못된 저장');return;}write(k,v);};
 assert.throws(()=>restore(p),/복구 결과를 확인하지 못했습니다/);
 assert.equal(p.s.getItem(`${KEY}-character-restore-before-102`),raw);
});
test('손상된 현재 데이터 또는 복구본은 복구하지 않는다',()=>{
 const p=prepare();p.s.setItem(KEY,'{');
 assert.throws(()=>restore(p),/JSON이 손상/);
 p.s.setItem(KEY,JSON.stringify({characters:[],projects:[],voices:[]}));p.s.setItem(p.backupKey,'{');
 assert.throws(()=>restore(p),/JSON이 손상/);
});
test('복구본 목록 저장소 접근이 없으면 오류로 보고한다',()=>{
 const p=prepare();assert.throws(()=>listCharacterDeletionBackups({getItem:p.s.getItem},KEY,'c1'),/목록/);
});
test('복구 전 현재 원문 인수가 없으면 저장소를 변경하지 않는다',()=>{
 const p=prepare(),raw=p.s.getItem(KEY);
 assert.throws(()=>restoreCharacterProfileFromBackup(p.s,KEY,p.backupKey,'c1',null,102),/원문/);
 assert.equal(p.s.getItem(KEY),raw);
});