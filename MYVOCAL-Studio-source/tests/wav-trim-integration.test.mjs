// Step43: production mixdown routing with a deterministic mocked Web Audio context.
// This is not a browser/Windows device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
globalThis.indexedDB={open(){const request={result:{createObjectStore(){},transaction(){return {objectStore(){return {get(){const result={};queueMicrotask(()=>{result.result=fakeFile;result.onsuccess?.()});return result}}}}},close(){}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
class Param{setValueAtTime(){}linearRampToValueAtTime(){}setValueCurveAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};Offline.last={channels,length,sampleRate};}
 createBufferSource(){return new Node();}
 createGain(){return new Gain();}
 async startRendering(){
  const l=new Float32Array(this.length),r=new Float32Array(this.length);
  // Loud anti-phase at start; only mono cancels it. Gap in the middle.
  l[1]=2;r[1]=-2;l[3]=.5;r[3]=.5;l[5]=2;r[5]=2;
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:i=>i===0?l:r};
 }
}
globalThis.window={OfflineAudioContext:Offline,AudioContext:class{decodeAudioData(){return Promise.resolve({duration:2,numberOfChannels:1});}}};
let src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
for(const name of ['assetDb','midiEngine','clipTiming','mixPeak','wavPcm','wavTrim','wavNormalize','wavExportRange','wavExportMeter'])
 src=src.replace(`'./${name}${['assetDb','midiEngine'].includes(name)?'':'.js'}'`,`'${new URL('../src/lib/'+name+'.js',import.meta.url).href}'`);
const {mixdownWavDetailed,mixdownWav}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const project={bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{id:'c',assetId:'a',startBar:1,durationSec:2}]}]};
const view=async blob=>new DataView(await blob.arrayBuffer());
test('Step43: legacy default remains full length and 44.1kHz/16-bit stereo',async()=>{
 const v=await view(await mixdownWav(project));
 assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(34,true),16);
 assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),Offline.last.length*4);
});
test('Step43: optional stereo trim exports only frames 1..5 including interior gap',async()=>{
 const {blob,trimReport}=await mixdownWavDetailed(project,{trimSilence:true});
 const v=await view(blob);
 assert.deepEqual([trimReport.startFrame,trimReport.endFrame],[1,6]);
 assert.equal(v.getUint32(40,true),5*4);
 assert.equal(v.getInt16(44+1*4,true),0);
});
test('Step43: optional mono trim starts at frame 3 after anti-phase cancellation',async()=>{
 const {blob,trimReport,peakReport}=await mixdownWavDetailed(project,{trimSilence:true,channels:1,bitDepth:24,sampleRate:48000,peakProtection:true});
 const v=await view(blob);
 assert.deepEqual([trimReport.startFrame,trimReport.endFrame],[3,6]);
 assert.equal(v.getUint32(40,true),3*3);assert.equal(v.getUint16(22,true),1);
 assert.equal(v.getUint16(34,true),24);assert.equal(v.getUint32(24,true),48000);
 assert.equal(peakReport.peakBefore,2);assert.ok(peakReport.gain<.5);
 assert.equal(Offline.last.channels,2);
});
test('Step43: omitted trim leaves full WAV and trimReport null',async()=>{
 const result=await mixdownWavDetailed(project,{peakProtection:true});
 assert.equal(result.trimReport,null);
 const v=await view(result.blob);assert.equal(v.getUint32(40,true),Offline.last.length*4);
});
test('Step43: invalid trimSilence type fails before rendering',async()=>{
 for(const trimSilence of ['true',1,null,{},[]])
  await assert.rejects(mixdownWavDetailed(project,{trimSilence}),/무음 제거 옵션/);
});
