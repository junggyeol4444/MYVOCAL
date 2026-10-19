import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData} from '../src/lib/schema.js';
import {createFullWorkspaceZip,parseFullWorkspaceZip,readStoredWorkspaceZip,emptyWorkspace} from '../src/lib/fullWorkspaceBundle.js';
const sample=()=>({...initialData,projects:[{id:'project_1',title:'내 곡',tracks:[],sections:[],scenes:[]}],voices:[{id:'voice_1',rights:'self'}]});
test('ZIP contains full project data and original binary assets without remapping IDs',async()=>{
 const raw=new File([Uint8Array.of(0,1,2,255)],'원본.wav',{type:'audio/wav'});
 const bytes=await createFullWorkspaceZip(sample(),[['asset_1',raw]],'2026-10-16T00:00:00Z');
 const entries=readStoredWorkspaceZip(bytes);
 assert.deepEqual([...entries.keys()],['manifest.json','assets/0.bin']);
 const copy=parseFullWorkspaceZip(bytes);
 assert.equal(copy.data.projects[0].id,'project_1');
 assert.equal(copy.data.voices[0].id,'voice_1');
 assert.equal(copy.assets[0][0],'asset_1');
 assert.deepEqual(new Uint8Array(await copy.assets[0][1].arrayBuffer()),new Uint8Array(await raw.arrayBuffer()));
});
test('empty destination is mandatory before restore',()=>{
 assert.equal(emptyWorkspace(initialData),true);
 assert.equal(emptyWorkspace(sample()),false);
});
test('no asset IDs may be duplicated',async()=>{
 const f=new Blob([new Uint8Array([1])]);await assert.rejects(createFullWorkspaceZip(sample(),[['a',f],['a',f]]),/ID/);
});
test('ZIP file corruption is rejected by CRC check',async()=>{
 const bytes=await createFullWorkspaceZip(sample(),[['x',new Blob([Uint8Array.of(1,2,3)])]]);
 const modified=bytes.slice();const n=modified.indexOf(1);if(n>=0)modified[n]^=3;
 assert.throws(()=>readStoredWorkspaceZip(modified));
});
test('foreign ZIP payloads and oversized backups are refused',()=>{
 assert.throws(()=>parseFullWorkspaceZip(new Uint8Array(22)),/ZIP/);
 assert.throws(()=>emptyWorkspace({projects:{},voices:[],characters:[]}),/형식/);
});

test('rejects malformed voicebank, virtual singer and settings objects before export or import',async()=>{
 const broken=[{voicebanks:{}},{virtualSingers:{foo:1}},{settings:[]},{settings:null}];
 for(const change of broken){
  const data={...sample(),...change};
  await assert.rejects(createFullWorkspaceZip(data,[]),/형식/);
  assert.throws(()=>emptyWorkspace(data),/형식/);
 }
});
