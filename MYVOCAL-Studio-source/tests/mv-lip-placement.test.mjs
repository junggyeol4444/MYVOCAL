import test from 'node:test';import assert from 'node:assert/strict';
import {readMvLipPlacement,saveMvLipPlacement,MV_LIP_PLACEMENT_KEY} from '../src/lib/mvLipPlacement.js';
test('user's project placement persists locally but never personal media',()=>{
 const db=new Map(),storage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 saveMvLipPlacement(storage,'p1',{xPercent:30,yPercent:75,sizePercent:7});
 assert.deepEqual(readMvLipPlacement(storage,'p1'),{xPercent:30,yPercent:75,sizePercent:7});
 assert.deepEqual(readMvLipPlacement(storage,'p2'),{});
 const json=JSON.parse(db.get(MV_LIP_PLACEMENT_KEY));assert.deepEqual(Object.keys(json.p1).sort(),['sizePercent','xPercent','yPercent']);
});
test('corrupted placement state never enables invalid visible output',()=>{
 assert.deepEqual(readMvLipPlacement({getItem:()=>'{invalid'},'p'),{});
 assert.throws(()=>saveMvLipPlacement({setItem(){}},'p',{xPercent:2,yPercent:75,sizePercent:10}),/위치/);
});