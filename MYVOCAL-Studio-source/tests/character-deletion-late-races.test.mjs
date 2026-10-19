import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalState} from '../src/lib/characterDeletionRecovery.js';
import {backupCharacterRemovalWithManifest,listRestorableDeletedCharacters,restoreDeletedCharacterFromManifest} from '../src/lib/characterDeletionManifest.js';
const KEY='myvocal-studio-v01';
const data=()=>({characters:[{id:'c1',name:'가수'},{id:'c2',name:'동료'}],projects:[],voices:[],settings:{theme:'dark'}});
function memory(){const values=new Map([[KEY,JSON.stringify(data())]]);return {values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
function deleted(){const s=memory(),meta=backupCharacterRemovalWithManifest(s,KEY,'c1',100);const current=data();current.characters.shift();s.setItem(KEY,JSON.stringify(current));return {s,meta};}
test('기존 복구 목록 키가 예약돼 있으면 그 키와 원본을 보존하고 다음 빈 쌍을 선택한다',()=>{
 const s=memory(),orphan=`${KEY}-character-delete-backup-100-manifest`;
 s.setItem(orphan,'사용자 기존 데이터');
 const result=backupCharacterRemovalWithManifest(s,KEY,'c1',100);
 assert.equal(result.backupKey,`${KEY}-character-delete-backup-100-1`);
 assert.equal(s.getItem(orphan),'사용자 기존 데이터');
 assert.equal(s.getItem(result.backupKey),JSON.stringify(data()));
});
test('백업 함수는 기존 복구 목록을 예약된 이름으로 덮어쓰지 않는다',()=>{
 const s=memory(),reserved=`${KEY}-character-delete-backup-100-manifest`;
 s.setItem(reserved,'기존 복구 목록');
 const key=backupCharacterRemovalState(s,KEY,'c1',100,['-manifest']);
 assert.equal(key,`${KEY}-character-delete-backup-100-1`);
 assert.equal(s.getItem(reserved),'기존 복구 목록');
});
test('복구 목록 조회 중 읽은 목록 원문이 바뀌면 오래된 목록을 반환하지 않는다',()=>{
 const {s,meta}=deleted(),get=s.getItem;let mutated=false;
 s.getItem=k=>{const result=get(k);if(k===meta.manifestKey&&!mutated){mutated=true;s.setItem(k,'{}');}return result;};
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/변경|중단/);
});
test('복구 목록 조회 중 읽은 백업 원문이 바뀌면 오래된 목록을 반환하지 않는다',()=>{
 const {s,meta}=deleted(),get=s.getItem;let mutated=false;
 s.getItem=k=>{const result=get(k);if(k===meta.backupKey&&!mutated){mutated=true;s.setItem(k,'{}');}return result;};
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/변경|중단/);
});
test('복구 목록 열거 중 새 항목이 삽입되면 부분 목록을 정상 결과로 반환하지 않는다',()=>{
 const {s}=deleted(),key=s.key;let once=false;
 s.key=i=>{const value=key(i);if(!once){once=true;s.setItem(`${KEY}-character-delete-backup-101-manifest`,'{}');}return value;};
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/변경|중단/);
});
test('복원 최종 원문 검사 이후 복구 목록이 변경되면 저장을 중단한다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY),get=s.getItem;let count=0;
 s.getItem=k=>{const value=get(k);if(k===meta.backupKey&&++count===4)s.setItem(meta.manifestKey,'{}');return value;};
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,before,101),/목록|변경|중단/);
 assert.equal(s.getItem(KEY),before);
});
test('정상 복구 목록과 선택 복원은 추가 무결성 검사 후에도 동작한다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY);
 assert.equal(listRestorableDeletedCharacters(s,KEY).length,1);
 const result=restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,before,101);
 assert.deepEqual(result.data.characters.map(x=>x.id),['c1','c2']);
 assert.equal(s.getItem(result.beforeRestoreKey),before);
});
test('복구 목록 키 확인이 예외를 던지면 원본 삭제 없이 중단한다',()=>{
 const s=memory(),get=s.getItem;
 s.getItem=k=>{if(k===`${KEY}-character-delete-backup-100-manifest`)throw Error('읽기 거부');return get(k);};
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',100),/목록 키|중단/);
 assert.equal(s.getItem(KEY),JSON.stringify(data()));
});
test('복구본 키 1000개가 모두 예약됐으면 기존 키를 덮어쓰지 않고 중단한다',()=>{
 const s=memory();for(let i=0;i<1000;i++)s.setItem(`${KEY}-character-delete-backup-100${i?'-'+i:''}-manifest`,'기존');
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',100),/키|중단/);
 assert.equal(s.getItem(KEY),JSON.stringify(data()));
 assert.equal(s.getItem(`${KEY}-character-delete-backup-100`),null);
});
test('잘못된 예약 접미사는 백업 전에 거부한다',()=>{
 const s=memory();
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',100,['manifest']),/설정/);
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',100,'-manifest'),/설정/);
 assert.equal(s.length,1);
});
test('복구 목록 원문이 다른 유효한 JSON으로 바뀌어도 조회 결과를 반환하지 않는다',()=>{
 const {s,meta}=deleted(),get=s.getItem;let changed=false;
 s.getItem=k=>{const v=get(k);if(k===meta.manifestKey&&!changed){changed=true;const m=JSON.parse(v);m.characterName='다른 이름';s.setItem(k,JSON.stringify(m));}return v;};
 assert.throws(()=>listRestorableDeletedCharacters(s,KEY),/변경|중단/);
});
test('정상 삭제·복원 중 기존 다른 백업 키의 내용은 변경하지 않는다',()=>{
 const s=memory(),other=`${KEY}-character-delete-backup-100-manifest`,original='사용자가 보존한 이전 목록';
 s.setItem(other,original);
 const meta=backupCharacterRemovalWithManifest(s,KEY,'c1',100);
 const current=data();current.characters.shift();s.setItem(KEY,JSON.stringify(current));
 const result=restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),102);
 assert.equal(s.getItem(other),original);
 assert.equal(result.data.characters[0].id,'c1');
});