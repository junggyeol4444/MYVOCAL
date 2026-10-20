import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMidiSoundFont} from '../src/lib/midiSoundFontClient.js';
const midi=()=>new File([new Uint8Array(30)],'notes.mid',{type:'audio/midi'});
function wav(){
 const samples=44100,buf=new ArrayBuffer(44+samples*4),v=new DataView(buf);
 for(const [p,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)v.setUint8(p+i,s.charCodeAt(i));
 v.setUint32(4,buf.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,44100*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,samples*4,true);
 for(let i=0;i<samples;i++){const n=Math.round(4000*Math.sin(i/15));v.setInt16(44+i*4,n,true);v.setInt16(46+i*4,n,true)}
 return new Blob([buf],{type:'audio/wav'});
}
const settings={python:'C:\\AI\\python.exe',library:'C:\\AI\\libfluidsynth-3.dll',soundfont:'C:\\AI\\piano.sf2',rate:44100,gain:.2};
test('real WAV response is structurally validated and not confused with MIDI',async()=>{
 let calls=0;
 const request=async(path,opt)=>{calls++;assert.equal(path,'/api/music/midi/soundfont');assert.equal(opt.headers['X-MYVOCAL-Session'],'session');assert.equal(opt.body.get('soundfont'),settings.soundfont);return {ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>wav()};};
 const file=await renderMidiSoundFont(midi(),settings,{session:'session',request});
 assert.equal(calls,1);assert.equal(file.size,44+44100*4);
});
test('invalid path rejected before network request',async()=>{
 await assert.rejects(renderMidiSoundFont(midi(),{...settings,library:'../fluid.dll'},{session:'session',request:()=>{throw Error('unexpected request')}}),/FluidSynth/);
});
test('missing session rejected',async()=>{
 await assert.rejects(renderMidiSoundFont(midi(),settings,{session:''}),/세션/);
});
test('server error propagates without producing a fake WAV',async()=>{
 const request=async()=>({ok:false,status:502,json:async()=>({error:'로컬 SoundFont 로딩 실패'})});
 await assert.rejects(renderMidiSoundFont(midi(),settings,{session:'session',request}),/로딩 실패/);
});
