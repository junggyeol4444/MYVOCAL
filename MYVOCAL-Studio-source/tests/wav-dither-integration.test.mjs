// Step46 full production mixdown API with deterministic local mock rendering.
// Not a substitute for Windows 10/11 or WebView2 hardware tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installAudioIndexedDB} from './helpers/audio-indexeddb.mjs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
installAudioIndexedDB(fakeFile);
class Param{setValueAtTime(){}linearRampToValueAtTime(){}setValueCurveAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};}
 createBufferSource(){return new Node();}createGain(){return new Gain();}
 async startRendering(){
  const l=new Float32Array(this.length),r=new Float32Array(this.length);
  for(let i=100;i<1000;i++){l[i]=.125;r[i]=.25;}
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:i=>i===0?l:r};
 }
}
globalThis.window={OfflineAudioContext:Offline,AudioContext:class{decodeAudioData(){return Promise.resolve({duration:2,numberOfChannels:1});}}};
let src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
for(const name of ['assetDb','midiEngine','clipTiming','mixPeak','wavPcm','wavTrim','wavNormalize','wavExportRange','wavExportMeter'])
 src=src.replace(`'./${name}${['assetDb','midiEngine'].includes(name)?'':'.js'}'`,`'${new URL('../src/lib/'+name+'.js',import.meta.url).href}'`);
const {mixdownWavDetailed,mixdownWav}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const project={bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{id:'c',assetId:'a',startBar:1,durationSec:2}]}]};
const bytes=async blob=>new Uint8Array(await blob.arrayBuffer());

test('Step46 legacy mixdown bytes equal explicitly disabled dither',async()=>{
 assert.deepEqual(await bytes(await mixdownWav(project)),await bytes(await mixdownWav(project,{dither16:false})));
});
test('Step46 enabled dither reaches actual 16-bit WAV output',async()=>{
 const a=await bytes(await mixdownWav(project)),b=await bytes(await mixdownWav(project,{dither16:true}));
 assert.notDeepEqual(a,b);assert.deepEqual(a.subarray(0,44),b.subarray(0,44));
});
test('Step46 enabled dither remains deterministic through mixdown',async()=>{
 const a=await bytes(await mixdownWav(project,{dither16:true}));
 const b=await bytes(await mixdownWav(project,{dither16:true}));assert.deepEqual(a,b);
});
test('Step46 24-bit rejects dither before creating offline renderer',async()=>{
 await assert.rejects(mixdownWav(project,{dither16:true,bitDepth:24}),/16비트 PCM/);
});
test('Step46 invalid option types fail early',async()=>{
 for(const dither16 of [1,0,'true',null,{},[]])await assert.rejects(mixdownWav(project,{dither16}),/디더 옵션/);
});
test('Step46 16-bit mono 48kHz trim fade and normalize combine with dither',async()=>{
 const o={dither16:true,channels:1,sampleRate:48000,bitDepth:16,trimSilence:true,edgeFade:true,normalizePeak:true};
 const {blob,trimReport,normalizationReport}=await mixdownWavDetailed(project,o);
 const v=new DataView(await blob.arrayBuffer());assert.equal(v.getUint16(22,true),1);
 assert.equal(v.getUint16(34,true),16);assert.equal(v.getUint32(24,true),48000);
 assert.equal(v.getUint32(40,true),900*2);assert.equal(trimReport.startFrame,100);
 assert.ok(normalizationReport.gain>1);
});
test('Step46 16-bit stereo 44.1kHz peak protection combines with dither',async()=>{
 const {blob,peakReport}=await mixdownWavDetailed(project,{dither16:true,peakProtection:true});
 const v=new DataView(await blob.arrayBuffer());assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(24,true),44100);assert.ok(peakReport);
});
test('Step46 dither does not mutate project state',async()=>{
 const before=JSON.stringify(project);await mixdownWav(project,{dither16:true});assert.equal(JSON.stringify(project),before);
});
