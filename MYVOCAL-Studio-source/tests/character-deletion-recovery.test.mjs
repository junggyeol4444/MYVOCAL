import test from 'node:test';
import assert from 'node:assert/strict';
import {backupCharacterRemovalState} from '../src/lib/characterDeletionRecovery.js';
import {commitCharacterProfileRemoval} from '../src/lib/characterDeletionPersistence.js';
const KEY='myvocal-studio-v01';
const fixture=()=>({characters:[{id:'c1',name:'인물',assets:[{id:'photo'}]}],projects:[],virtualSingers:[],voices:[],voiceModels:[],trainingPlans:[]});
function memory(data){
 const values=new Map([[KEY,JSON.stringify(data)]]);
 return {values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value))};
}
const state=s=>({status:'ok',data:JSON.parse(s.getItem(KEY))});
const save=s=>next=>(s.setItem(KEY,JSON.stringify(next)),true);
const run=(s,data,stamp=101)=>commitCharacterProfileRemoval(data,'c1',save(s),()=>state(s),()=>backupCharacterRemovalState(s,KEY,'c1',stamp));

test('실제 저장 전 작업 공간 원문을 별도 키에 바이트 문자열 그대로 보존한다',()=>{
 const data=fixture(),s=memory(data),raw=s.getItem(KEY);const result=run(s,data);
 assert.equal(s.getItem(result.backupKey),raw);
 assert.equal(JSON.parse(s.getItem(KEY)).characters.length,0);
 assert.deepEqual(result.preservedFileIds,['photo']);
});
test('같은 시각의 복구본 키가 있으면 덮어쓰지 않고 새 키를 만든다',()=>{
 const data=fixture(),s=memory(data);s.setItem(`${KEY}-character-delete-backup-101`,'기존 복구본');
 const result=run(s,data);
 assert.equal(s.getItem(`${KEY}-character-delete-backup-101`),'기존 복구본');
 assert.equal(result.backupKey,`${KEY}-character-delete-backup-101-1`);
});
test('복구본 저장 공간 부족 시 캐릭터 프로필과 원본은 변경하지 않는다',()=>{
 const data=fixture(),s=memory(data),raw=s.getItem(KEY),write=s.setItem;
 s.setItem=(key,value)=>{if(key!==KEY)throw Error('quota');return write(key,value);};
 assert.throws(()=>run(s,data),/복구본 저장·검증에 실패/);
 assert.equal(s.getItem(KEY),raw);
});
test('복구본 저장이 거짓 성공한 경우 삭제를 중단한다',()=>{
 const data=fixture(),s=memory(data),raw=s.getItem(KEY),write=s.setItem;
 s.setItem=(key,value)=>{if(key===KEY)write(key,value);};
 assert.throws(()=>run(s,data),/복구본 저장·검증에 실패/);
 assert.equal(s.getItem(KEY),raw);
});
test('복구본 저장 중 다른 창에서 바꾼 데이터는 덮어쓰지 않는다',()=>{
 const data=fixture(),s=memory(data),write=s.setItem;
 s.setItem=(key,value)=>{write(key,value);if(key!==KEY)write(KEY,JSON.stringify({...data,projects:[{id:'new'}]}));};
 assert.throws(()=>run(s,data),/복구본 저장 중 작업 공간이 변경/);
 assert.equal(state(s).data.projects.length,1);
});
test('저장된 캐릭터 ID가 중복된 경우 복구본을 생성하지 않는다',()=>{
 const data=fixture();data.characters.push({...data.characters[0]});const s=memory(data);
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',101),/복구본을 검증하지 못했습니다/);
 assert.equal(s.values.size,1);
});
test('저장소 원문이 손상되면 복구본을 만들거나 삭제하지 않는다',()=>{
 const data=fixture(),s=memory(data);s.setItem(KEY,'{');
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',101),/복구본을 검증하지 못했습니다/);
 assert.equal(s.values.size,1);
});
test('복구본 저장소를 읽을 수 없으면 원본을 보존하고 중단한다',()=>{
 const data=fixture(),s=memory(data),raw=s.getItem(KEY);
 s.getItem=()=>{throw Error('security');};
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',101),/읽지 못해/);
 assert.equal(s.values.get(KEY),raw);
});
test('저장 후 확인 실패여도 삭제 전 원문 복구본은 남아 있다',()=>{
 const data=fixture(),s=memory(data);let reads=0;
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',save(s),()=>{
  reads++;return reads<3?state(s):{status:'unavailable'};
 },()=>backupCharacterRemovalState(s,KEY,'c1',101)),/저장 결과를 확인하지 못했습니다/);
 assert.equal(JSON.parse(s.values.get(`${KEY}-character-delete-backup-101`)).characters.length,1);
});
test('복구본 생성 함수가 키를 반환하지 않으면 저장하지 않는다',()=>{
 const data=fixture(),s=memory(data),raw=s.getItem(KEY);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',save(s),()=>state(s),()=>null),/복구본을 확인하지 못했습니다/);
 assert.equal(s.getItem(KEY),raw);
});
test('잘못된 복구 처리기와 누락 원본은 삭제를 중단한다',()=>{
 const data=fixture(),s=memory(data);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',save(s),()=>state(s),true),/복구본 처리기가/);
 s.values.delete(KEY);
 assert.throws(()=>backupCharacterRemovalState(s,KEY,'c1',101),/원문이 없어/);
});
test('캐릭터 복구본의 기존 키가 많아도 기존 복구본은 수정하지 않는다',()=>{
 const data=fixture(),s=memory(data);
 for(let i=0;i<4;i++)s.setItem(`${KEY}-character-delete-backup-101${i?'-'+i:''}`,'이전 원문 '+i);
 const result=run(s,data);
 assert.equal(result.backupKey,`${KEY}-character-delete-backup-101-4`);
 for(let i=0;i<4;i++)assert.equal(s.getItem(`${KEY}-character-delete-backup-101${i?'-'+i:''}`),'이전 원문 '+i);
});