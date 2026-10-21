import test from 'node:test';
import assert from 'node:assert/strict';
import {produceNeuralSongStems} from '../src/lib/neuralSongStems.js';
const roles=['melody','chords','bass','drums','guitar','pad'];
const project=()=>({id:'original-project',bpm:100,tracks:[{id:'my-recording',clips:[{assetId:'my-voice-original'}],name:'나의 목소리 원본'}]});
const generated=()=>({neuralSymbolic:true,bpm:120,durationSec:176,tracks:roles.map(role=>({role,name:role,type:'instrument',midiNotes:[{startBeat:0,length:1,pitch:60,velocity:90}]}))});
function harness(src,state={}){
 let n=0;
 return {current:()=>src(),onChange:async p=>{state.project=p;},
  newId:prefix=>prefix+'-'+(++n),makeMidi:()=>new Blob([new Uint8Array(48)],{type:'audio/midi'}),
  renderStem:async()=>new Blob([new Uint8Array(512)],{type:'audio/wav'}),
  readInfo:async()=>({duration:176}),
  createTrack:(_p,_f,id,length)=>({clips:[{assetId:id,length}],volume:75}),
  saveAssets:async batch=>{state.batch=batch;},
  removeAssets:async ids=>{state.deleted=ids;}
 };
}
test('local neural 6 instrument MIDI parts yield six sampled PCM WAVs and 12 non-destructive editable tracks',async()=>{
 const original=project(),state={},opts=harness(()=>original,state);
 const result=await produceNeuralSongStems(original,generated(),{},opts);
 assert.equal(result.midiTracks,6);assert.equal(result.pcmTracks,6);assert.equal(result.storedAssets,6);
 assert.equal(state.batch.length,6);assert.equal(state.project.tracks.length,13);
 assert.strictEqual(state.project.tracks[0],original.tracks[0]);assert.equal(original.tracks.length,1);
 assert.equal(state.project.tracks.filter(t=>t.mute===true).length,6);
 assert.equal(state.project.tracks.slice(-6).every(t=>t.clips.length===1&&t.mute===false),true);
 assert.equal(state.deleted,undefined);
});
test('if any local model soundfont rendering fails, no incomplete assets or project are committed',async()=>{
 const original=project(),state={},opts=harness(()=>original,state);let n=0;
 opts.renderStem=async()=>{if(++n===4)throw Error('실제 샘플 악기 렌더 실패');return new Blob([new Uint8Array(512)]);};
 await assert.rejects(produceNeuralSongStems(original,generated(),{},opts),/렌더 실패/);
 assert.equal(state.batch,undefined);assert.equal(state.project,undefined);
 assert.equal(original.tracks.length,1);
});
test('project changed during multi-instrument inference prevents any state overwrite',async()=>{
 const original=project(),next={...original,id:'different'},state={};let current=original;
 const opts=harness(()=>current,state);
 opts.renderStem=async()=>{current=next;return new Blob([new Uint8Array(512)]);};
 await assert.rejects(produceNeuralSongStems(original,generated(),{},opts),/프로젝트 변경/);
 assert.equal(state.batch,undefined);assert.equal(state.project,undefined);
});
test('a failed project commit deletes only this invocation’s newly created soundfont stems',async()=>{
 const original=project(),state={},opts=harness(()=>original,state);
 opts.onChange=async()=>{throw Error('디스크 프로젝트 저장 실패');};
 await assert.rejects(produceNeuralSongStems(original,generated(),{},opts),/저장 실패/);
 assert.equal(state.deleted.length,6);
 assert.deepEqual(state.deleted,state.batch.map(x=>x[0]));
 assert.ok(!state.deleted.includes('my-voice-original'));
 assert.equal(original.tracks.length,1);
});
test('aborted neural multi-stem sampling cannot write partially completed project',async()=>{
 const original=project(),state={},ctrl=new AbortController(),opts=harness(()=>original,state);
 opts.renderStem=async()=>{ctrl.abort();return new Blob([new Uint8Array(512)]);};
 await assert.rejects(produceNeuralSongStems(original,generated(),{},{...opts,signal:ctrl.signal}),/취소/);
 assert.equal(state.batch,undefined);
});
