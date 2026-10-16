import test from 'node:test';
import assert from 'node:assert/strict';
import {putFile,getFile,removeFile,putFilesAtomic} from '../src/lib/assetDb.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fakeIndexedDb(){
 let latest=null,closed=0;
 const db={
  close(){closed++;},
  transaction(name,mode){
   assert.equal(name,'files');
   const request={result:undefined,error:null};
   const transaction={
    error:null,
    objectStore(){
     return {
      put(){return request;},
      get(){return request;},
      delete(){return request;},
      add(){return {result:undefined};}
     };
    },
    abort(){this.onabort?.();}
   };
   latest={request,transaction,mode};
   return transaction;
  }
 };
 return {
  indexedDB:{open(name,version){
   assert.equal(name,'myvocal-assets-v01');
   assert.equal(version,1);
   const request={};
   queueMicrotask(()=>{request.result=db;request.onsuccess?.();});
   return request;
  }},
  latest:()=>latest,
  closed:()=>closed
 };
}
function install(t){
 const old=globalThis.indexedDB;
 const mock=fakeIndexedDb();
 globalThis.indexedDB=mock.indexedDB;
 t.after(()=>{if(old===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=old;});
 return mock;
}
test('voice recording is not marked saved until IndexedDB transaction commits',async t=>{
 const mock=install(t);
 let finished=false;
 const saving=putFile('voice_take_1',new Blob(['vocal'])).then(()=>{finished=true;});
 await tick();
 const {request,transaction}=mock.latest();
 request.onsuccess?.();
 await tick();
 assert.equal(finished,false,'put request succeeded but disk transaction has not committed');
 transaction.oncomplete?.();
 await saving;
 assert.equal(finished,true);
 assert.equal(mock.closed(),1);
});
test('aborted IndexedDB transaction rejects even if the put request succeeded',async t=>{
 const mock=install(t);
 const saving=putFile('voice_take_2',new Blob(['vocal']));
 await tick();
 const {request,transaction}=mock.latest();
 request.onsuccess?.();
 transaction.error=new Error('QuotaExceededError');
 transaction.onabort?.();
 await assert.rejects(saving,/QuotaExceededError/);
 assert.equal(mock.closed(),1);
});
test('voice sample retrieval only resolves after readonly transaction completes',async t=>{
 const mock=install(t);
 let finished=false;
 const loading=getFile('voice_take_1').then(blob=>{finished=true;return blob;});
 await tick();
 const {request,transaction}=mock.latest();
 const original=new Blob(['original take']);
 request.result=original;request.onsuccess?.();
 await tick();
 assert.equal(finished,false);
 transaction.oncomplete?.();
 assert.equal(await loading,original);
 assert.equal(mock.closed(),1);
});
test('sample deletion waits for actual committed delete',async t=>{
 const mock=install(t);
 let finished=false;
 const deleting=removeFile('voice_take_1').then(()=>{finished=true;});
 await tick();
 const {request,transaction}=mock.latest();
 request.onsuccess?.();
 await tick();
 assert.equal(finished,false);
 transaction.oncomplete?.();
 await deleting;
 assert.equal(finished,true);
});
test('voice asset batch rejects on transaction abort rather than claiming partial success',async t=>{
 const mock=install(t);
 const saving=putFilesAtomic([['one',new Blob(['one'])],['two',new Blob(['two'])]]);
 await tick();
 const {transaction}=mock.latest();
 transaction.error=new Error('Disk write rejected');
 transaction.onabort?.();
 await assert.rejects(saving,/Disk write rejected/);
 assert.equal(mock.closed(),1);
});
