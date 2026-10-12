import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBundleEnvelope,MAX_ASSETS} from '../src/lib/bundleSafety.js';
test('accepts legacy projects without changing them',()=>{const p={title:'old',tracks:[]};assert.equal(validateBundleEnvelope(p),p)});
test('rejects malformed v2 assets before any writes',()=>{for(const assets of [null,[],{x:{dataUrl:'bad'}},{x:null}])assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}))});
test('rejects excessive asset count',()=>{const assets=Object.fromEntries(Array.from({length:MAX_ASSETS+1},(_,i)=>[String(i),{dataUrl:'data:;base64,AA=='}]));assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}))});

test('rejects unsupported backup versions instead of treating them as legacy',()=>{for(const version of [0,1,3,null,undefined]) assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:version,assets:{}}))});
