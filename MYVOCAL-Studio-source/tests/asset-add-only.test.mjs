import test from 'node:test';
import assert from 'node:assert/strict';
import {putFileNew} from '../src/lib/assetDb.js';
test('new generated asset uses add, never silent put/overwrite',async()=>{
 const original=globalThis.indexedDB;const calls=[];
 globalThis.indexedDB={open(){const r={};queueMicrotask(()=>{r.result={close(){},transaction(){const t={};t.objectStore=()=>({add(file,id){calls.push(['add',id,file]);const req={};queueMicrotask(()=>{req.result=id;req.onsuccess?.();t.oncomplete?.()});return req},put(){throw Error('unexpected put')}});return t}};r.onsuccess?.()});return r}};
 try{await putFileNew('new-key',{name:'clip.webm'});assert.equal(calls.length,1);assert.equal(calls[0][0],'add');}finally{globalThis.indexedDB=original}
});
