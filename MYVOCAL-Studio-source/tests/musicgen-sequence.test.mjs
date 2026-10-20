import test from 'node:test';
import assert from 'node:assert/strict';
import {joinMusicGenWaves,generateMusicGenSequence} from '../src/lib/musicGenSequence.js';
import {inspectSingingWav} from '../src/lib/singingOutputValidation.js';
function wav(seconds=3,rate=8000,channels=1,tone=8000){
 const frames=seconds*rate,out=new Uint8Array(44+frames*channels*2),d=new DataView(out.buffer);
 for(const [p,t] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)out[p+i]=t.charCodeAt(i);
 d.setUint32(4,out.length-8,true);d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,channels,true);d.setUint32(24,rate,true);d.setUint32(28,rate*channels*2,true);d.setUint16(32,channels*2,true);d.setUint16(34,16,true);d.setUint32(40,out.length-44,true);
 for(let f=0;f<frames;f++)for(let c=0;c<channels;c++)d.setInt16(44+(f*channels+c)*2,tone,true);
 return out;
}
test('two neural WAV segments become one valid sounding PCM clip with correct overlap',async()=>{
 const f=joinMusicGenWaves([wav(3),wav(3,8000,1,-10000)],{crossfadeSec:.5});
 const b=await f.arrayBuffer(),i=inspectSingingWav(b),v=new DataView(b);
 assert.equal(i.durationSec,5.5);assert.ok(i.peak>.2);
 assert.equal(v.getInt16(44,true),8000);assert.equal(v.getInt16(44+(5*8000)*2,true),-10000);
 assert.ok(Math.abs(v.getInt16(44+(2.75*8000)*2,true))<5000);
});
test('PCM stereo remains stereo, sources and project never mutated',async()=>{
 const first=wav(3,8000,2,8000),second=wav(3,8000,2,12000),copy=first.slice();
 const result=joinMusicGenWaves([first,second]);const b=await result.arrayBuffer();
 assert.equal(inspectSingingWav(b).channels,2);assert.deepEqual(first,copy);
});
test('invalid or silent WAV and mismatched model output abort the complete merge',()=>{
 assert.throws(()=>joinMusicGenWaves([wav(3),wav(3,16000)]),/샘플레이트/);
 assert.throws(()=>joinMusicGenWaves([wav(3),new Uint8Array([1,2,3])]),/WAV/);
 assert.throws(()=>joinMusicGenWaves([wav(3),wav(3)],{crossfadeSec:5}),/결합 조건/);
 assert.throws(()=>joinMusicGenWaves([wav(3),wav(3,8000,1,0)]),/소리가 없는/);
});
test('long music calls real generation for each segment before delivering combined output',async()=>{
 const commands=[],progress=[],config={python:'D:\\AI\\python.exe',modelDir:'D:\\musicgen',prompt:'Korean rock instrumental',seconds:3,seed:14};
 const result=await generateMusicGenSequence(config,{segments:3,prompts:['verse piano','chorus guitars','final orchestra'],onProgress:(done,total)=>progress.push([done,total]),generate:async setting=>{commands.push(setting);return new Blob([wav(3)],{type:'audio/wav'});}});
 assert.deepEqual(commands.map(x=>x.seed),[14,15,16]);
 assert.deepEqual(commands.map(x=>x.prompt),['verse piano','chorus guitars','final orchestra']);
 assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
 assert.equal(inspectSingingWav(await result.arrayBuffer()).durationSec,8);
});
test('cancellation after a segment stops all later inferences and delivers no output',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(generateMusicGenSequence({python:'D:\\AI\\python.exe',modelDir:'D:\\Music',prompt:'Cinematic rock',seconds:3,seed:3},{segments:4,signal:controller.signal,generate:async()=>{calls++;controller.abort();return new Blob([wav(3)],{type:'audio/wav'});}}),/취소/);
 assert.equal(calls,1);
});

test('invalid fade is rejected before spending any local GPU inference',async()=>{
 let calls=0;
 await assert.rejects(generateMusicGenSequence({python:'D:\\AI\\python.exe',modelDir:'D:\\Music',prompt:'Cinematic instrumental',seconds:3,seed:3},{segments:3,crossfadeSec:2,generate:async()=>{calls++;return new Blob([wav(3)],{type:'audio/wav'});}}),/크로스페이드/);
 assert.equal(calls,0);
});
test('mismatched PCM format stops the remaining MusicGen requests early',async()=>{
 let calls=0;
 await assert.rejects(generateMusicGenSequence({python:'D:\\AI\\python.exe',modelDir:'D:\\Music',prompt:'Cinematic instrumental',seconds:3,seed:3},{segments:5,generate:async()=>{calls++;return new Blob([wav(3,calls===1?8000:16000)],{type:'audio/wav'});}}),/다른 샘플레이트/);
 assert.equal(calls,2);
});
