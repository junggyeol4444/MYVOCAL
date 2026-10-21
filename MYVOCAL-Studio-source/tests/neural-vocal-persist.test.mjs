import test from 'node:test';
import assert from 'node:assert/strict';
import {persistNeuralVocalTake} from '../src/lib/neuralVocalPersist.js';
const original=()=>({id:'my-song',tracks:[{id:'saved-recording',name:'내 원본 녹음',clips:[{assetId:'original-voice'}]}]});
const files=()=>[new Blob([new Uint8Array(256)],{type:'audio/wav'}),new Blob([new Uint8Array(512)],{type:'audio/wav'})];
function opts(original,state={}){
 let seq=0;
 return {current:()=>original,onChange:p=>{state.project=p},newId:p=>p+(++seq),
 readInfo:async()=>({duration:150}),createTrack:(_p,_wav,id,duration)=>({clips:[{assetId:id,duration}]}),
 store:async entries=>{state.saved=entries},rollback:async ids=>{state.rolled=ids}
 }
}
test('neural Korean Singing and converted RVC outputs become two actual editable WAV tracks in one commit',async()=>{
 const p=original(),state={},result=await persistNeuralVocalTake(p,files(),opts(p,state));
 assert.equal(result.tracks,2);assert.equal(result.assets,2);
 assert.equal(state.project.tracks.length,3);assert.strictEqual(state.project.tracks[0],p.tracks[0]);
 assert.equal(state.project.tracks[1].mute,true);
 assert.equal(state.project.tracks[2].mute,false);
 assert.equal(state.saved.length,2);assert.equal(state.rolled,undefined);
 assert.equal(p.tracks.length,1);
});
test('single genuine installed neural Singing WAV saves as a vocal project track',async()=>{
 const p=original(),state={};await persistNeuralVocalTake(p,files().slice(0,1),opts(p,state));
 assert.equal(state.project.tracks.length,2);assert.equal(state.project.tracks[1].mute,false);
});
test('no newly rendered source clip is written if RVC processing aborted, project switched or file invalid',async()=>{
 const p=original(),state={},ctl=new AbortController();ctl.abort();
 await assert.rejects(persistNeuralVocalTake(p,files(),{...opts(p,state),signal:ctl.signal}),/취소/);
 assert.equal(state.saved,undefined);
 await assert.rejects(persistNeuralVocalTake(p,files(),{...opts(p,state),current:()=>({id:'other'})}),/전환/);
 await assert.rejects(persistNeuralVocalTake(p,[new Blob(['invalid'])],opts(p,state)),/WAV/);
 assert.equal(state.saved,undefined);
});
test('project save failure rolls back only two newly created singing WAV assets',async()=>{
 const p=original(),state={},inputs=opts(p,state);inputs.onChange=()=>{throw Error('프로젝트 저장 실패')};
 await assert.rejects(persistNeuralVocalTake(p,files(),inputs),/저장 실패/);
 assert.deepEqual(state.rolled,state.saved.map(([id])=>id));
 assert.ok(!state.rolled.includes('original-voice'));
});
test('existing Singing Workbench auto-saves the converted output, not raw audio twice',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/components/SingingWorkbench.jsx',import.meta.url),'utf8');
 assert.match(source,/sourceForSave=original/);
 assert.match(source,/blob=converted/);
 assert.match(source,/persistNeuralVocalTake\(p,files/);
});
