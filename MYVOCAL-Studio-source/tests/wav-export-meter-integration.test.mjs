// Step49: verify the actual WAV mixdown path returns output diagnostics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
globalThis.indexedDB={open(){const req={result:{createObjectStore(){},transaction(){return {objectStore(){return {get(){const x={};queueMicrotask(()=>{x.result=fakeFile;x.onsuccess?.()});return x}}}}},close(){}}};queueMicrotask(()=>req.onsuccess?.());return req;}};
class Param{setValueAtTime(){}linearRampToValueAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};}
 createBufferSource(){return new Node();}createGain(){return new Gain();}
 async startRendering(){const left=new Float32Array(this.length).fill(1.5),right=new Float32Array(this.length).fill(-.5);
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:i=>i?right:left};}
}
globalThis.window={OfflineAudioContext:Offline,AudioContext:class{decodeAudioData(){return Promise.resolve({duration:1,numberOfChannels:1});}}};
let src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
for(const name of ['assetDb','midiEngine','clipTiming','mixPeak','wavPcm','wavTrim','wavNormalize','wavExportRange','wavExportMeter'])
 src=src.replace(`'./${name}${['assetDb','midiEngine'].includes(name)?'':'.js'}'`,`'${new URL('../src/lib/'+name+'.js',import.meta.url).href}'`);
const {mixdownWavDetailed}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const project={bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{assetId:'a',startBar:1,durationSec:1}]}]};
test('Step49 real export reports unprotected PCM over-range samples',async()=>{
 const {blob,outputReport}=await mixdownWavDetailed(project,{bitDepth:16});
 assert.equal(outputReport.frames,44100);assert.equal(outputReport.overRangeSamples,44100);
 assert.equal(outputReport.overRangeFrames,44100);assert.equal(outputReport.samplePeak,1.5);
 assert.equal(blob.type,'audio/wav');
});
test('Step49 real export protection removes over-range risk',async()=>{
 const {outputReport}=await mixdownWavDetailed(project,{bitDepth:24,peakProtection:true});
 assert.equal(outputReport.overRangeSamples,0);assert.ok(outputReport.samplePeak<1);
});
test('Step49 real mono meter reads downmix rather than source channel peak',async()=>{
 const {outputReport}=await mixdownWavDetailed(project,{bitDepth:32,channels:1});
 assert.equal(outputReport.channels,1);assert.equal(outputReport.samplePeak,.5);
 assert.equal(outputReport.overRangeSamples,0);
});
test('Step49 real selected range reports only exported duration',async()=>{
 const {outputReport}=await mixdownWavDetailed(project,{startSec:.25,endSec:.75,channels:1});
 assert.equal(outputReport.frames,22050);assert.equal(outputReport.durationSec,.5);
});
test('Step49 real float over-range remains in WAV and is reported',async()=>{
 const {blob,outputReport}=await mixdownWavDetailed(project,{bitDepth:32});
 assert.equal(outputReport.overRangeSamples,44100);
 const v=new DataView(await blob.arrayBuffer());assert.equal(v.getFloat32(58,true),1.5);
});
test('Step49 real export diagnostics do not modify project',async()=>{
 const before=JSON.stringify(project);await mixdownWavDetailed(project,{bitDepth:16,normalizePeak:true,edgeFade:true});
 assert.equal(JSON.stringify(project),before);
});
