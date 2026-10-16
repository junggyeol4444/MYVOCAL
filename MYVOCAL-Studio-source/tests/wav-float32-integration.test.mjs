// Step48: test the real WAV mixdown entrypoint with a local deterministic Web Audio mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installAudioIndexedDB} from './helpers/audio-indexeddb.mjs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
installAudioIndexedDB(fakeFile);
class Param{setValueAtTime(){}linearRampToValueAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
let renders=0;
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};}
 createBufferSource(){return new Node();}createGain(){return new Gain();}
 async startRendering(){renders++;
  const left=new Float32Array(this.length).fill(1.5),right=new Float32Array(this.length).fill(-0.5);
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:i=>i?right:left};
 }
}
globalThis.window={OfflineAudioContext:Offline,AudioContext:class{decodeAudioData(){return Promise.resolve({duration:1,numberOfChannels:1});}}};
let src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
for(const name of ['assetDb','midiEngine','clipTiming','mixPeak','wavPcm','wavTrim','wavNormalize','wavExportRange','wavExportMeter'])
 src=src.replace(`'./${name}${['assetDb','midiEngine'].includes(name)?'':'.js'}'`,`'${new URL('../src/lib/'+name+'.js',import.meta.url).href}'`);
const {mixdownWavDetailed}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const project={bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{assetId:'a',startBar:1,durationSec:1}]}]};
const view=async blob=>new DataView(await blob.arrayBuffer());
test('Step48 real mixdown supports 32-bit float without peak protection',async()=>{
 const {blob}=await mixdownWavDetailed(project,{bitDepth:32});const v=await view(blob);
 assert.equal(v.getUint16(20,true),3);assert.equal(v.getUint32(46,true),44100);
 assert.equal(v.getFloat32(58,true),1.5);assert.equal(v.getFloat32(62,true),-0.5);
});
test('Step48 float peak protection reduces samples above 0 dBFS',async()=>{
 const {blob,peakReport}=await mixdownWavDetailed(project,{bitDepth:32,peakProtection:true});
 assert.equal(peakReport.attenuated,true);
 const v=await view(blob);assert.ok(v.getFloat32(58,true)<1);assert.ok(v.getFloat32(58,true)>.88);
});
test('Step48 float mono, selected range and trim use correct output frame count',async()=>{
 const {blob,selectionReport}=await mixdownWavDetailed(project,{bitDepth:32,channels:1,sampleRate:48000,startSec:.25,endSec:.75,trimSilence:true});
 const v=await view(blob);assert.equal(v.getUint16(22,true),1);
 assert.equal(v.getUint32(46,true),24000);assert.equal(v.getUint32(54,true),96000);
 assert.equal(v.getFloat32(58,true),0.5);assert.equal(selectionReport.startFrame,12000);
});
test('Step48 float and TPDF conflict fails before offline rendering',async()=>{
 const before=renders;
 await assert.rejects(mixdownWavDetailed(project,{bitDepth:32,dither16:true}),/16비트/);
 assert.equal(renders,before);
});
test('Step48 float normalization applies to selected channels and is non-destructive',async()=>{
 const before=JSON.stringify(project);
 const {blob,normalizationReport}=await mixdownWavDetailed(project,{bitDepth:32,channels:1,normalizePeak:true});
 assert.ok(normalizationReport.gain>1);
 assert.ok((await view(blob)).getFloat32(58,true)>.8);
 assert.equal(JSON.stringify(project),before);
});
