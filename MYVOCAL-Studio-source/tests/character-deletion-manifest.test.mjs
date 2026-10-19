import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalWithManifest,listRestorableDeletedCharacters,restoreDeletedCharacterFromManifest} from '../src/lib/characterDeletionManifest.js';
const KEY='myvocal-studio-v01';
const initial=()=>({characters:[{id:'c1',name:'첫 캐릭터',assets:[{id:'asset1'}]},{id:'c2',name:'둘째 캐릭터'}],projects:[{id:'p1'}],voices:[],settings:{theme:'light'}});
function storage(){const values=new Map([[KEY,JSON.stringify(initial())]]);return {values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
function deleted(){const s=storage(),meta=backupCharacterRemovalWithManifest(s,KEY,'c1',123);const current=JSON.parse(s.getItem(KEY));current.characters=current.characters.filter(c=>c.id!=='c1');s.setItem(KEY,JSON.stringify(current));return {s,meta};}
test('복구본 원문과 별도 목록 메타데이터를 저장하고 재읽기 검증한다',()=>{
 const s=storage(),before=s.getItem(KEY),meta=backupCharacterRemovalWithManifest(s,KEY,'c1',123);
 assert.equal(s.getItem(meta.backupKey),before);assert.equal(JSON.parse(s.getItem(meta.manifestKey)).characterId,'c1');
 assert.equal(s.getItem(KEY),before);
});
test('삭제 전에는 복구 목록에 표시하지 않고 삭제 후에만 표시한다',()=>{
 const s=storage();backupCharacterRemovalWithManifest(s,KEY,'c1',123);assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
 const current=JSON.parse(s.getItem(KEY));current.characters.shift();s.setItem(KEY,JSON.stringify(current));
 assert.equal(listRestorableDeletedCharacters(s,KEY)[0].characterId,'c1');
});
test('복구 목록 조회는 읽기 전용이며 IndexedDB 파일을 변경하지 않는다',()=>{
 const {s}=deleted(),before=new Map(s.values);const list=listRestorableDeletedCharacters(s,KEY);
 assert.equal(list.length,1);assert.deepEqual([...s.values],[...before]);
});
test('명시적 복원은 현재 프로젝트·설정·다른 캐릭터를 보존한다',()=>{
 const {s,meta}=deleted(),before=s.getItem(KEY),result=restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,before,124);
 assert.deepEqual(result.data.characters.map(c=>c.id),['c1','c2']);assert.deepEqual(result.data.projects,[{id:'p1'}]);
 assert.equal(result.data.settings.theme,'light');assert.equal(s.getItem(result.beforeRestoreKey),before);
 assert.equal(s.getItem(meta.backupKey),JSON.stringify(initial()));
});
test('복원 완료한 캐릭터는 삭제 캐릭터 목록에서 제외한다',()=>{
 const {s,meta}=deleted();restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124);
 assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
});
test('복구 목록 저장 실패 시 삭제를 중단하고 원문은 보존한다',()=>{
 const s=storage(),before=s.getItem(KEY),set=s.setItem;
 s.setItem=(k,v)=>{if(k.endsWith('-manifest'))throw Error('quota');set(k,v);};
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',123),/삭제를 중단/);
 assert.equal(s.getItem(KEY),before);assert.equal(s.getItem(`${KEY}-character-delete-backup-123`),before);
});
test('복구 목록이 저장된 척하지만 값이 없으면 삭제를 중단한다',()=>{
 const s=storage(),set=s.setItem;s.setItem=(k,v)=>{if(!k.endsWith('-manifest'))set(k,v);};
 assert.throws(()=>backupCharacterRemovalWithManifest(s,KEY,'c1',123),/삭제를 중단/);
});
test('복구 목록을 손상시켜도 자동 삭제하거나 덮어쓰지 않는다',()=>{
 const {s,meta}=deleted();s.setItem(meta.manifestKey,'{손상');const before=new Map(s.values);
 assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);assert.deepEqual([...s.values],[...before]);
});
test('복구 목록의 캐릭터 ID가 원본과 다르면 목록에서 제외한다',()=>{
 const {s,meta}=deleted(),manifest=JSON.parse(s.getItem(meta.manifestKey));manifest.characterId='missing';s.setItem(meta.manifestKey,JSON.stringify(manifest));
 assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
});
test('복구 목록의 캐릭터 이름이 원본과 다르면 복원을 차단한다',()=>{
 const {s,meta}=deleted(),manifest=JSON.parse(s.getItem(meta.manifestKey));manifest.characterName='다른 사람';s.setItem(meta.manifestKey,JSON.stringify(manifest));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/이름/);
});
test('원본 복구본이 사라진 목록은 조회에서 제외한다',()=>{
 const {s,meta}=deleted();s.values.delete(meta.backupKey);assert.deepEqual(listRestorableDeletedCharacters(s,KEY),[]);
});
test('다른 창의 저장 이후에는 선택 복원을 차단한다',()=>{
 const {s,meta}=deleted(),expected=s.getItem(KEY);s.setItem(KEY,expected+' ');
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,expected,124),/다른 창/);
});
test('이미 같은 ID가 있으면 다른 프로필을 덮어쓰지 않는다',()=>{
 const {s,meta}=deleted(),current=JSON.parse(s.getItem(KEY));current.characters.push({id:'c1',name:'새 사용자 캐릭터'});s.setItem(KEY,JSON.stringify(current));
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124),/동일한 캐릭터 ID/);
});
test('여러 삭제 캐릭터를 원래 복구본 별로 나열한다',()=>{
 const {s}=deleted();const second=backupCharacterRemovalWithManifest(s,KEY,'c2',125);
 const data=JSON.parse(s.getItem(KEY));data.characters=[];s.setItem(KEY,JSON.stringify(data));
 const list=listRestorableDeletedCharacters(s,KEY);assert.deepEqual(list.map(x=>x.characterId),['c2','c1']);
 assert.equal(list[0].manifestKey,second.manifestKey);
});
test('복구 직전 목록 변경을 감지하면 프로필을 수정하지 않는다',()=>{
 const {s,meta}=deleted(),original=s.getItem(KEY),get=s.getItem;let count=0;
 s.getItem=k=>{if(k===meta.manifestKey&&++count===2){s.values.set(k,'{}');}return get(k);};
 assert.throws(()=>restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,original,124),/목록이 변경/);
 assert.equal(s.getItem(KEY),original);
});
test('복구 목록을 만든 후 현재 프로젝트가 변경되더라도 다른 프로젝트는 그대로 유지한다',()=>{
 const {s,meta}=deleted(),data=JSON.parse(s.getItem(KEY));data.projects.push({id:'new'});data.settings.theme='dark';s.setItem(KEY,JSON.stringify(data));
 const r=restoreDeletedCharacterFromManifest(s,KEY,meta.manifestKey,s.getItem(KEY),124);
 assert.deepEqual(r.data.projects,[{id:'p1'},{id:'new'}]);assert.equal(r.data.settings.theme,'dark');
});
import {commitCharacterProfileRemoval} from '../src/lib/characterDeletionPersistence.js';
test('삭제 영구 저장 처리기가 목록 메타데이터 키를 결과에 함께 전달한다',()=>{
 const s=storage(),data=JSON.parse(s.getItem(KEY));
 const r=commitCharacterProfileRemoval(data,'c1',next=>{s.setItem(KEY,JSON.stringify(next));return true;},
  ()=>({status:'ok',data:JSON.parse(s.getItem(KEY))}),()=>backupCharacterRemovalWithManifest(s,KEY,'c1',123));
 assert.equal(r.manifestKey,`${KEY}-character-delete-backup-123-manifest`);
 assert.equal(r.backupKey,`${KEY}-character-delete-backup-123`);
 assert.deepEqual(JSON.parse(s.getItem(KEY)).characters.map(x=>x.id),['c2']);
});
test('목록 메타데이터가 다른 복구본을 가리키면 영구 저장을 중단한다',()=>{
 const s=storage(),before=s.getItem(KEY),data=JSON.parse(before);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',next=>{s.setItem(KEY,JSON.stringify(next));return true;},
  ()=>({status:'ok',data:JSON.parse(s.getItem(KEY))}),()=>({backupKey:'x',manifestKey:'y'})),/복구본/);
 assert.equal(s.getItem(KEY),before);
});