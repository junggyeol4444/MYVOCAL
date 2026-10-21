import test from 'node:test';
import assert from 'node:assert/strict';
import {persistNeuralMusicTracks} from '../src/lib/musicProductionCommit.js';
const src=()=>({id:'real-project',tracks:[{id:'old-track',name:'내 원본 보컬',clips:[{assetId:'original-recording'}]}]});
const file=()=>new Blob([new Uint8Array(128)],{type:'audio/wav'});
const result=(six=false)=>({master:file(),stems:{stems:(six?['drums','bass','other','vocals','guitar','piano']:['drums','bass','other','vocals']).map(name=>({name,file:file()}))}});
const deps=(current,history={})=>{
 let seq=0;
 return {current:()=>current(),onChange:async p=>{history.committed=p;},
 info:async()=>({duration:120}),createTrack:(_,f,id,n)=>({clips:[{assetId:id,durationSec:n,startBar:1}],volume:75}),
 newId:prefix=>prefix+'-'+(++seq),
 save:async entries=>{history.saved=entries;},
 remove:async ids=>{history.removed=ids;}
 };
};
test('real MusicGen and Demucs 4 stems commit all editable tracks in ONE project update',async()=>{
 const source=src(),state={};const d=deps(()=>source,state);
 const resultObj=await persistNeuralMusicTracks(source,result(),d);
 assert.equal(state.saved.length,5);
 assert.equal(resultObj.tracks.length,5);
 assert.equal(state.committed.tracks.length,6);
 assert.equal(state.committed.tracks[0],source.tracks[0]);
 assert.equal(resultObj.tracks.filter(t=>t.mute).length,1);
 assert.match(resultObj.tracks.at(-1).name,/마스터/);
 assert.equal(resultObj.tracks.at(-1).mute,true);
 assert.equal(source.tracks.length,1);
});
test('6-stem actual MusicGen processing persists six instruments and one muted reference mix',async()=>{
 const source=src(),state={};await persistNeuralMusicTracks(source,result(true),deps(()=>source,state));
 assert.equal(state.saved.length,7);assert.equal(state.committed.tracks.length,8);
 assert.equal(state.committed.tracks.filter(t=>t.type==='vocal').length,1);
});
test('cannot save duplicate/missing stems, corrupted duration or a changed project',async()=>{
 const source=src(),state={},d=deps(()=>source,state);
 const b=result();b.stems.stems[0].name='bass';
 await assert.rejects(persistNeuralMusicTracks(source,b,d),/중복|누락/);
 assert.equal(state.saved,undefined);
 const changed={...source};await assert.rejects(persistNeuralMusicTracks(source,result(),deps(()=>changed)),/프로젝트가 변경/);
 const dr=deps(()=>source);let calls=0;dr.info=async()=>({duration:++calls===2?150:120});
 await assert.rejects(persistNeuralMusicTracks(source,result(),dr),/시간축/);
});
test('atomic save failure or failed commit does not delete any existing user assets',async()=>{
 const original=src(),state={};const d=deps(()=>original,state);
 d.onChange=async()=>{throw Error('프로젝트 저장 실패')};
 await assert.rejects(persistNeuralMusicTracks(original,result(),d),/저장 실패/);
 assert.deepEqual(state.removed,state.saved.map(([id])=>id));
 assert.ok(!state.removed.includes('original-recording'));
 assert.equal(original.tracks.length,1);
});
test('cancellation prevents writing generated assets',async()=>{
 const source=src(),history={},d=deps(()=>source,history);
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(persistNeuralMusicTracks(source,result(),{...d,signal:ctrl.signal}),/취소/);
 assert.equal(history.saved,undefined);
});
