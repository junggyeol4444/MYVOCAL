import test from 'node:test';
import assert from 'node:assert/strict';
import {commitCharacterProfileRemoval} from '../src/lib/characterDeletionPersistence.js';

const make=()=>({characters:[{id:'c1',name:'인물',assets:[{id:'photo'},{id:'photo'},null]}],projects:[],virtualSingers:[],voices:[],voiceModels:[],trainingPlans:[]});
function memory(data){let saved=structuredClone(data);return {read:()=>({status:'ok',data:structuredClone(saved)}),write:next=>(saved=structuredClone(next),true),get:()=>saved};}

test('저장 성공 뒤 프로필만 제거하고 원본 파일 ID를 보존한다',()=>{
 const data=make(),db=memory(data);const result=commitCharacterProfileRemoval(data,'c1',db.write,db.read);
 assert.equal(result.data.characters.length,0);assert.deepEqual(result.preservedFileIds,['photo']);
 assert.equal(db.get().characters.length,0);assert.equal(data.characters.length,1);
});
test('저장 실패 시 화면 데이터와 원본 목록을 변경하지 않는다',()=>{
 const data=make(),db=memory(data);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',()=>false,db.read),/저장에 실패/);
 assert.equal(data.characters.length,1);assert.equal(db.get().characters.length,1);
});
test('저장 예외 발생 시 원본 파일 삭제 함수를 호출하지 않는다',()=>{
 const data=make(),db=memory(data);let touched=0;
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',()=>{touched++;throw Error('quota');},db.read),/quota/);
 assert.equal(touched,1);assert.equal(db.get().characters.length,1);
});
test('다른 창에서 갱신된 작업 공간을 덮어쓰지 않는다',()=>{
 const data=make(),db=memory({...data,projects:[{id:'other'}]});let writes=0;
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',()=>{writes++;return true;},db.read),/화면과 다릅니다/);
 assert.equal(writes,0);
});
test('프로젝트의 현재·과거 장면에서 참조하는 캐릭터 삭제를 차단한다',()=>{
 const data=make();data.projects=[{id:'p',scenes:[{regeneration92:{history:[{characterId:'c1'}]}}]}];
 const db=memory(data);let writes=0;
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',()=>{writes++;return true;},db.read),/연결된 프로젝트/);
 assert.equal(writes,0);
});
test('가상 가수가 사용하는 캐릭터는 프로필도 제거하지 않는다',()=>{
 const data=make();data.virtualSingers=[{id:'v',characterId:'c1'}];const db=memory(data);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',db.write,db.read),/연결된 프로젝트/);
});
test('없는 캐릭터 또는 중복 ID는 삭제하지 않는다',()=>{
 const data=make(),db=memory(data);
 assert.throws(()=>commitCharacterProfileRemoval(data,'missing',db.write,db.read),/찾을 수 없거나/);
 data.characters.push({...data.characters[0]});
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',db.write,db.read),/중복/);
});
test('저장 후 읽기 검증 실패 시 성공으로 보고하지 않는다',()=>{
 const data=make(),db=memory(data);let reads=0;
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',db.write,()=>{reads++;return reads===1?db.read():{status:'unavailable'};}),/확인하지 못했습니다/);
});
test('손상되거나 접근 불가한 저장소에서는 삭제를 차단한다',()=>{
 const data=make();let writes=0;
 for(const status of ['corrupt','unavailable','empty'])assert.throws(()=>commitCharacterProfileRemoval(data,'c1',()=>{writes++;return true;},()=>({status})),/화면과 다릅니다/);
 assert.equal(writes,0);
});
test('불완전한 캐릭터·저장 인수는 안전하게 거절한다',()=>{
 const data=make(),db=memory(data);
 assert.throws(()=>commitCharacterProfileRemoval(null,'c1',db.write,db.read),/저장 상태/);
 assert.throws(()=>commitCharacterProfileRemoval(data,'',db.write,db.read),/ID/);
 assert.throws(()=>commitCharacterProfileRemoval(data,'c1',null,db.read),/저장 상태/);
});