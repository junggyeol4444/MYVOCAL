import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAndStoreNeuralMidiStems} from '../src/lib/autoMvSourceStems.js';
import {NEURAL_SCORE_ROLES as roles} from '../src/lib/neuralScoreBatch.js';
function project(){return {id:'p',bpm:120,neuralAutoScore:{bars:160},tracks:[
 {id:'user',clips:[{assetId:'user-original'}]},...roles.map((role,i)=>({
  id:'ai'+i,role,generatedBy:'ollama-neural-score',
  midiNotes:[{pitch:60+i,startBeat:0,length:1}]}))]};}
function setup(p,overrides={}){
 let active=p,changed=0,stored=[],removed=[],id=0;
 const options={python:'C:/Python/python.exe',library:'C:/FluidSynth/lib.dll',soundfont:'C:/Owned.sf2',
 session:'session-12345678',current:()=>active,
 onChange:next=>{active=next;changed++},newId:()=>String(++id),
 encode:()=>new Blob([new Uint8Array(80)]),render:async()=>new Blob([new Uint8Array(128)]),
 readInfo:async()=>({duration:180}),createTrack:(_p,_b,assetId)=>({clips:[{assetId}]}),
 save:async e=>{stored=e},remove:async ids=>{removed=ids},...overrides};
 return {options,state:()=>({active,changed,stored,removed})};
}
test('SoundFont로 MIDI 6악기 PCM 트랙을 신규 추가하고 원본 불변',async()=>{
 const p=project(),before=JSON.stringify(p),ctx=setup(p);
 const result=await renderAndStoreNeuralMidiStems(p,ctx.options);
 assert.equal(result.tracks,6);assert.equal(ctx.state().stored.length,6);
 assert.equal(ctx.state().active.tracks.length,p.tracks.length+6);
 assert.ok(ctx.state().active.tracks.slice(-6).every(t=>t.mute&&t.sourceMidiTrackId));
 assert.equal(JSON.stringify(p),before);assert.equal(ctx.state().changed,1);
});
test('일부 악기만 생성된 새로운 작곡 회차와 과거 회차 혼합 차단',async()=>{
 const p=project();p.tracks.push({id:'newscore',role:'melody',generatedBy:'ollama-neural-score',
 midiNotes:[{pitch:80,startBeat:0,length:1}]});const ctx=setup(p);
 await assert.rejects(()=>renderAndStoreNeuralMidiStems(p,ctx.options),/6악기/);
 assert.equal(ctx.state().stored.length,0);
});
test('중복 신규 트랙 ID는 저장 전 차단',async()=>{
 const p=project(),ctx=setup(p,{newId:()=> 'duplicate'});
 await assert.rejects(()=>renderAndStoreNeuralMidiStems(p,ctx.options),/ID 충돌/);
 assert.equal(ctx.state().stored.length,0);
});
test('프로젝트 저장 실패 시 새 자산만 롤백하고 사용자 파일 보존',async()=>{
 const p=project(),original=JSON.stringify(p),ctx=setup(p,{onChange:()=>{throw Error('저장 실패')}});
 await assert.rejects(()=>renderAndStoreNeuralMidiStems(p,ctx.options),/저장 실패/);
 assert.equal(ctx.state().removed.length,6);assert.equal(JSON.stringify(p),original);
});
test('프로젝트 교체 후 신규 자산을 임의 삭제하지 않는다',async()=>{
 const p=project(),ctx=setup(p,{onChange:()=>{throw Error('저장 실패')}});
 const options={...ctx.options,onChange:()=>{options.current=()=>({id:'replacement'});throw Error('저장 실패')}};
 await assert.rejects(()=>renderAndStoreNeuralMidiStems(p,options),/저장 실패/);
 assert.equal(ctx.state().removed.length,0);
});
