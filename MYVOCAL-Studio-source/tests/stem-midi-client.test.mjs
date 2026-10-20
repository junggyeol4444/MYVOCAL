import test from 'node:test';
import assert from 'node:assert/strict';
import {transcribeStemToMidi} from '../src/lib/stemMidiClient.js';
function input(){return new File([new Uint8Array(44+500)],'stem.wav',{type:'audio/wav'});}
// Valid Type 0 MIDI: one middle-C note followed by end-of-track.
const midi=()=>new Blob([new Uint8Array([
  77,84,104,100,0,0,0,6,0,0,0,1,1,224,
  77,84,114,107,0,0,0,13,
  0,144,60,64,131,96,128,60,0,0,255,47,0
])],{type:'audio/midi'});
test('installed neural MIDI request returns parsed notes, not synthetic empty track',async()=>{
 let calls=0;
 const request=async(path,opt)=>{calls++;assert.equal(path,'/api/music/stems/midi');assert.equal(opt.body.get('python'),'C:\\AI\\python.exe');assert.equal(opt.headers['X-MYVOCAL-Session'],'session');return {ok:true,headers:{get:()=> 'audio/midi'},blob:async()=>midi()};};
 const result=await transcribeStemToMidi(input(),'C:\\AI\\python.exe',{session:'session',request});
 assert.equal(calls,1);assert.equal(result.parsed.tracks[0].notes[0].pitch,60);
});
test('rejects a non-MIDI native response',async()=>{
 const request=async()=>({ok:true,headers:{get:()=> 'application/json'},blob:async()=>midi()});
 await assert.rejects(transcribeStemToMidi(input(),'C:\\AI\\python.exe',{session:'session',request}),/MIDI/);
});
test('rejects missing session and invalid python without native inference',async()=>{
 await assert.rejects(transcribeStemToMidi(input(),'C:\\AI\\python.exe',{session:''}),/세션/);
 await assert.rejects(transcribeStemToMidi(input(),'./python',{session:'session'}),/Python/);
});
