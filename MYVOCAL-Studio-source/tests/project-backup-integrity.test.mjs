import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaSha256Hex,assertPortableAssetReferences,verifyBackupMedia} from '../src/lib/projectBackupIntegrity.js';
import {assetsOf} from '../src/lib/projectBundle.js';

const bytes=new TextEncoder().encode('abc');
const expected='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
test('actual SHA-256 is computed for binary originals without mutating bytes',async()=>{
 const before=bytes.slice();assert.equal(await mediaSha256Hex(bytes),expected);assert.deepEqual(bytes,before);
 assert.equal(await verifyBackupMedia({bytes:3,sha256:expected},bytes),true);
});
test('tampered model or WAV originals are rejected before IndexedDB import',async()=>{
 await assert.rejects(verifyBackupMedia({bytes:3,sha256:expected},new TextEncoder().encode('abd')),/SHA-256/);
 await assert.rejects(verifyBackupMedia({bytes:4,sha256:expected},bytes),/크기/);
 await assert.rejects(verifyBackupMedia({bytes:3,sha256:'0'.repeat(63)},bytes),/형식/);
});
test('legacy portable v2 file blobs without new checksums remain readable',async()=>{
 assert.equal(await verifyBackupMedia({name:'legacy.wav',type:'audio/wav'},bytes),true);
});
test('RVC model and FAISS index references are required for a complete portable backup',()=>{
 const project={tracks:[{id:'t1',clips:[{assetId:'original-wav'}]}],scenes:[]};
 const profiles={voices:[],characters:[],voiceModels:[{assetId:'model-pth',indexAssetId:'index-faiss'}],trainingPlans:[]};
 const ids=assetsOf(project,profiles);
 assert.deepEqual(new Set(ids),new Set(['original-wav','model-pth','index-faiss']));
 const assets=Object.fromEntries(ids.map(id=>[id,{dataUrl:'data:application/octet-stream;base64,YWJj'}]));
 assert.equal(assertPortableAssetReferences(ids,assets),3);
 delete assets['index-faiss'];
 assert.throws(()=>assertPortableAssetReferences(ids,assets),/누락/);
});

test('previous v2 backups without the new integrity marker remain compatible',async()=>{
 const {validateBundleEnvelope}=await import('../src/lib/bundleSafety.js');
 const legacy={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:{title:'기존 프로젝트',tracks:[],sections:[]},profiles:{voices:[],characters:[]},assets:{}};
 assert.doesNotThrow(()=>validateBundleEnvelope(legacy));
 assert.doesNotThrow(()=>validateBundleEnvelope({...legacy,integrityVersion:1}));
 assert.throws(()=>validateBundleEnvelope({...legacy,integrityVersion:99}),/무결성/);
});
