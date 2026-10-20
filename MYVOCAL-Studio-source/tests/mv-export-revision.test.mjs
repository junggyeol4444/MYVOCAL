import test from 'node:test';import assert from 'node:assert/strict';
import {mvExportRevision,verifyMvExportRevision} from '../src/lib/mvExportRevision.js';
const project=()=>({id:'project',scenes:[{id:'scene',start:0,end:3}],tracks:[{id:'music',clips:[{assetId:'wav-original'}]}],lyrics:'안녕',bpm:90});
const characters=()=>[{id:'char',lipSync:{version:1,cues:[{startMs:0,endMs:400,phoneme:'ㅏ',viseme:'A',lyric:'아'}]}}];
test('unchanged MV audio, lip sync and scenes remain exportable',()=>{
 const p=project(),c=characters(),fingerprint=mvExportRevision(p,c,{includeLipSync:true});
 assert.equal(verifyMvExportRevision(fingerprint,p,c,{includeLipSync:true}),true);
});
test('source audio/scene edits cannot be silently exported with old rendered clip',()=>{
 const p=project(),c=characters(),fingerprint=mvExportRevision(p,c,{includeLipSync:true});
 p.tracks[0].clips[0].assetId='new-recording';assert.throws(()=>verifyMvExportRevision(fingerprint,p,c,{includeLipSync:true}),/수정/);
});
test('changed performer mouth timings invalidate an in-flight overlay video',()=>{
 const p=project(),c=characters(),fingerprint=mvExportRevision(p,c,{includeLipSync:true});
 c[0].lipSync.cues[0].endMs=650;assert.throws(()=>verifyMvExportRevision(fingerprint,p,c,{includeLipSync:true}),/수정/);
});
test('unrelated lip metadata is ignored when optional lip rendering disabled',()=>{
 const p=project(),c=characters(),fingerprint=mvExportRevision(p,c,{includeLipSync:false});
 c[0].lipSync.cues=[];assert.equal(verifyMvExportRevision(fingerprint,p,c,{includeLipSync:false}),true);
});