import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBundleEnvelope,MAX_ASSETS} from '../src/lib/bundleSafety.js';
test('accepts legacy projects without changing them',()=>{const p={title:'old',tracks:[]};assert.equal(validateBundleEnvelope(p),p)});
test('rejects malformed v2 assets before any writes',()=>{for(const assets of [null,[],{x:{dataUrl:'bad'}},{x:null}])assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}))});
test('rejects excessive asset count',()=>{const assets=Object.fromEntries(Array.from({length:MAX_ASSETS+1},(_,i)=>[String(i),{dataUrl:'data:;base64,AA=='}]));assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}))});

test('rejects unsupported backup versions instead of treating them as legacy',()=>{for(const version of [0,1,3,null,undefined]) assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:version,assets:{}}))});

test('rejects unknown declared backup formats instead of treating them as legacy projects',()=>{for(const format of ['OTHER_BACKUP','',null,0])assert.throws(()=>validateBundleEnvelope({format,title:'legacy-looking',tracks:[],sections:[]}))});

test('rejects prototype-sensitive asset IDs before mapping',()=>{for(const id of ['__proto__','constructor','prototype']){const assets=Object.fromEntries([[id,{dataUrl:'data:audio/wav;base64,AA=='}]]);assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}))}});


test('rejects cumulative media size before decoding or writing',()=>{
 const payload='A'.repeat(88*1024*1024);
 const assets={a:{dataUrl:'data:audio/wav;base64,'+payload},b:{dataUrl:'data:audio/wav;base64,'+payload},c:{dataUrl:'data:audio/wav;base64,'+payload}};
 assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}),/150MB/);
});

test('permits valid modest media backup without mutating it',()=>{
 const input={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets:{a:{dataUrl:'data:audio/wav;base64,AA=='}}};
 assert.equal(validateBundleEnvelope(input),input);
});


test('rejects malformed base64 data before decode or storage',()=>{
 for(const payload of ['AA=', 'AA===', 'AA!A', 'AA==AAAA', 'A', 'AAAA\n', '', 'AAAA=']) {
  const assets={a:{dataUrl:'data:audio/wav;base64,'+payload}};
  assert.throws(()=>validateBundleEnvelope({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets}),/Base64/);
 }
});

test('accepts valid padded and unpadded base64 without changes',()=>{
 for(const payload of ['AA==','AAA=','AAAA']) {
  const input={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets:{a:{dataUrl:'data:audio/wav;base64,'+payload}}};
  assert.equal(validateBundleEnvelope(input),input);
 }
});


test('rejects noncanonical Base64 padding bits',()=>{
 for(const payload of ['AB==','AAB=','//9=','/x==']) {
  const input={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,assets:{x:{dataUrl:'data:audio/wav;base64,'+payload}}};
  assert.throws(()=>validateBundleEnvelope(input),/Base64/);
 }
});
