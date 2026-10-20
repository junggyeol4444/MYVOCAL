import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMusicGenSequence,joinMusicGenWaves,MAX_SEQUENCE_SEGMENTS,MAX_SEQUENCE_BYTES,musicGenContinuationPrompt} from '../src/lib/musicGenSequence.js';
import {inspectSingingWav} from '../src/lib/singingOutputValidation.js';

function wav(seconds=18,rate=8000,channels=1){
 const frames=Math.round(seconds*rate),bytes=new Uint8Array(44+frames*channels*2),v=new DataView(bytes.buffer);
 for(const [pos,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)bytes[pos+i]=tag.charCodeAt(i);
 v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);
 v.setUint16(32,channels*2,true);v.setUint16(34,16,true);v.setUint32(40,bytes.length-44,true);
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)v.setInt16(44+(i*channels+c)*2,Math.round(6000*Math.sin(i*0.08)),true);
 return bytes;
}
const settings={python:'C:\\Python\\python.exe',modelDir:'C:\\models\\musicgen',prompt:'original Korean rock orchestral music',seconds:18,seed:100};

test('twenty actual MusicGen WAV responses combine to a valid 350.5-second WAV',async()=>{
 let calls=0;const original=wav();const copy=original.slice();
 const out=await generateMusicGenSequence(settings,{segments:20,crossfadeSec:.5,generate:async()=>{calls++;return new Blob([original],{type:'audio/wav'});}});
 assert.equal(calls,20);assert.equal(MAX_SEQUENCE_SEGMENTS,20);
 assert.equal(inspectSingingWav(await out.arrayBuffer(),{maxDurationSec:360}).durationSec,350.5);
 assert.deepEqual(original,copy,'original recording must never be mutated');
});
test('over-360s projected song is rejected before running a single neural inference',async()=>{
 let calls=0;
 await assert.rejects(generateMusicGenSequence({...settings,seconds:20},{segments:20,crossfadeSec:.5,generate:async()=>{calls++;return new Blob([wav()],{type:'audio/wav'});}}),/360초/);
 assert.equal(calls,0);
});
test('up to 18 actual audio-prompt continuation calls preserve PCM timing and output',async()=>{
 let calls=0,seen=0;
 const out=await generateMusicGenSequence({...settings,seconds:20},{segments:18,continuation:true,crossfadeSec:.5,generate:async cfg=>{
   calls++;if(calls>1){assert.ok(cfg.audioPrompt);seen++;}
   return new Blob([wav(20)],{type:'audio/wav'});
 }});
 assert.equal(calls,18);assert.equal(seen,17);
 assert.equal(inspectSingingWav(await out.arrayBuffer(),{maxDurationSec:360}).durationSec,351.5);
});
test('memory limit is explicit and 6-minute 44.1kHz stereo PCM is below it',()=>{
 assert.ok(MAX_SEQUENCE_BYTES>360*44100*2*2+44);
 assert.ok(MAX_SEQUENCE_BYTES<=160*1024*1024);
});
test('WAV crossfade joins twenty sources without altering input bytes',async()=>{
 const source=wav(18);const originals=Array.from({length:20},()=>source.slice());
 const out=joinMusicGenWaves(originals,{crossfadeSec:.5});
 assert.equal(inspectSingingWav(await out.arrayBuffer(),{maxDurationSec:360}).durationSec,350.5);
 for(const item of originals)assert.deepEqual(item,source);
});
