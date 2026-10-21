import test from 'node:test';
import assert from 'node:assert/strict';
import {composeNeuralMidiArrangement} from '../src/lib/neuralMidiComposer.js';
const roles=['melody','chords','bass','drums','guitar','pad'];
test('240BPM 6분 노래의 마지막 353마디까지 실제 Ollama 엔드포인트 요청',async()=>{
 let calls=0,last=0;
 const result=await composeNeuralMidiArrangement({model:'qwen3:4b',prompt:'한국어 오리지널 고속 록',bpm:240,targetSeconds:360,session:'local-session',
  request:async(_url,{body})=>{
   const input=JSON.parse(body);calls++;last=input.barStart;
   return {ok:true,json:async()=>({provider:'local-ollama',model:'qwen3:4b',neuralSymbolicGenerated:true,
    audioGenerated:false,bars:8,barStart:input.barStart,stems:roles.map((role,i)=>({role,notes:[{pitch:role==='drums'?36:60+i,startBeat:0,length:1,velocity:80}]}))})};
  }});
 assert.equal(calls,45);assert.equal(last,353);assert.equal(result.durationSec,360);
 assert.equal(result.tracks.length,6);assert.equal(result.tracks[0].midiNotes.length,45);
});
