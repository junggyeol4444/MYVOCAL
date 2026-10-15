// Step45 production mixdown path using a deterministic mocked Web Audio renderer.
// This is not a real Windows/WebView2/audio-hardware test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
globalThis.indexedDB={open(){const request={result:{createObjectStore(){},transaction(){return {objectStore(){return {get(){const result={};queueMicrotask(()=>{result.result=fakeFile;result.onsuccess?.()});return result}}}}},close(){}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
class Param{setValueAtTime(){}linearRampToValueAtTime(){}setValueCurveAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};}
 createBufferSource(){return new Node();}createGain(){return new Gain();}
 async startRendering(){
  const l=new Float32Array(this.length),r=new Float32Array(this.length);
  for(let i=100;i<1000;i++){l[i]=.25;r[i]=.5;}
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
const near=(a,b,eps=.0002)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('Step45: disabled normalization preserves the exact old default WAV bytes',async()=>{
 const a=await mixdownWav(project),b=await mixdownWav(project,{normalizePeak:false});
 assert.deepEqual(new Uint8Array(await a.arrayBuffer()),new Uint8Array(await b.arrayBuffer()));
});
test('Step45: normalization amplifies 16-bit stereo to -1 dBFS',async()=>{
 const {blob,normalizationReport,peakReport}=await mixdownWavDetailed(project,{normalizePeak:true});
 assert.equal(peakReport,null);near(normalizationReport.peakBefore,.5);
 const v=await view(blob);near(v.getInt16(44+200*4+2,true)/32767,10**(-1/20));
});
test('Step45: normalization supersedes attenuation-only peak protection',async()=>{
 const both=await mixdownWavDetailed(project,{normalizePeak:true,peakProtection:true});
 const norm=await mixdownWavDetailed(project,{normalizePeak:true,peakProtection:false});
 assert.equal(both.peakReport,null);
 assert.deepEqual(new Uint8Array(await both.blob.arrayBuffer()),new Uint8Array(await norm.blob.arrayBuffer()));
});
test('Step45: mono 48kHz 24-bit trim and fade normalize after boundary fade',async()=>{
 const {blob,normalizationReport,trimReport}=await mixdownWavDetailed(project,{normalizePeak:true,channels:1,sampleRate:48000,bitDepth:24,trimSilence:true,edgeFade:true});
 const v=await view(blob);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint32(40,true),900*3);
 assert.equal(v.getUint8(44),0);assert.equal(v.getUint8(44+899*3),0);
 assert.equal(trimReport.startFrame,100);near(normalizationReport.peakBefore,.375);
 assert.equal(normalizationReport.boosted,true);
});
test('Step45: invalid normalizePeak types fail before allocating audio',async()=>{
 for(const normalizePeak of ['true',1,null,{},[],0])
  await assert.rejects(mixdownWavDetailed(project,{normalizePeak}),/정규화 옵션/);
});
test('Step45: export does not mutate project state',async()=>{
 const before=JSON.stringify(project);
 await mixdownWavDetailed(project,{normalizePeak:true,trimSilence:true,edgeFade:true});
 assert.equal(JSON.stringify(project),before);
});
