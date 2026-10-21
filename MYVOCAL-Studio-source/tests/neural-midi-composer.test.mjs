import test from 'node:test';
import assert from 'node:assert/strict';
import {composeNeuralMidiArrangement,appendNeuralMidiToProject,validateNeuralMidiSection} from '../src/lib/neuralMidiComposer.js';
const roles=['melody','chords','bass','drums','guitar','pad'];
const response=(start)=>({provider:'local-ollama',model:'qwen3:4b',neuralSymbolicGenerated:true,
 audioGenerated:false,bars:8,barStart:start,stems:roles.map((role,i)=>({role,
 notes:[{pitch:role==='drums'?36:60+i,startBeat:0,length:1,velocity:92}]}))});
test('real local neural model MIDI composes six editable instruments across several song sections',async()=>{
 const queries=[],generated=await composeNeuralMidiArrangement({model:'qwen3:4b',prompt:'나의 한국어 사랑 노래',bpm:120,targetSeconds:180,
 session:'private',onProgress:(a,b)=>assert.ok(a<=b),
 request:async(url,opts)=>{const q=JSON.parse(opts.body);queries.push(q);assert.equal(url,'/api/local-ai/midi-section');assert.equal(opts.headers['X-MYVOCAL-Session'],'private');
  return {ok:true,json:async()=>response(q.barStart)};}
 });
 assert.equal(queries.length,11);assert.equal(queries[0].barStart,1);assert.equal(queries[1].barStart,9);
 assert.deepEqual(queries[1].previousMelody,[60]);
 assert.equal(generated.tracks.length,6);
 assert.equal(generated.tracks[0].midiNotes.length,11);
 assert.equal(generated.tracks[0].midiNotes.at(-1).startBeat,320);
 assert.equal(generated.durationSec,176);
 assert.equal(generated.neuralSymbolic,true);
});
test('full six-minute neural MIDI plan never exceeds 360 seconds and remains time-aligned',async()=>{
 let calls=0;
 const generated=await composeNeuralMidiArrangement({model:'qwen3:4b',prompt:'길고 이어지는 멜로디',bpm:120,targetSeconds:360,session:'p',
  request:async(_url,opts)=>{calls++;return {ok:true,json:async()=>response(JSON.parse(opts.body).barStart)};}});
 assert.equal(calls,22);assert.equal(generated.durationSec,352);
 assert.equal(generated.tracks.length,6);
 const lengths=generated.tracks.map(t=>Math.max(...t.midiNotes.map(n=>n.startBeat+n.length)));
 assert.ok(lengths.every(l=>l<=generated.bars*4));
});
test('neural music commit never deletes or overwrites existing owned user tracks',async()=>{
 const project={id:'owned',bpm:100,tracks:[{id:'original',name:'나의 녹음',clips:[{assetId:'protected'}]}]};
 const music={neuralSymbolic:true,tracks:roles.map(role=>({role,name:role,midiNotes:[{pitch:60,startBeat:0,length:1,velocity:80}]})),bpm:120,durationSec:20,notes:6};
 let n=0,committed=null;
 const result=await appendNeuralMidiToProject(project,music,{current:()=>project,newId:()=>String(++n),onChange:x=>{committed=x}});
 assert.equal(result.addedTracks,6);assert.equal(project.tracks.length,1);
 assert.equal(committed.tracks[0],project.tracks[0]);assert.equal(committed.tracks.length,7);
});
test('corrupt neural output, cancellation and changed project cannot touch existing assets',async()=>{
 assert.throws(()=>validateNeuralMidiSection({...response(1),stems:[]},{model:'qwen3:4b',barStart:1}),/악기/);
 const original={id:'p1',tracks:[]},generated={neuralSymbolic:true,tracks:roles.map(role=>({role,midiNotes:[]})),bpm:120,notes:0};
 await assert.rejects(appendNeuralMidiToProject(original,generated,{current:()=>({id:'p2'}),newId:()=>1,onChange:()=>{throw Error('never');}}),/변경/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(composeNeuralMidiArrangement({model:'qwen3:4b',prompt:'한글 노래',bpm:120,targetSeconds:180,session:'key',signal:controller.signal,
 request:()=>{throw Error('called canceled model');}}),/취소/);
});
