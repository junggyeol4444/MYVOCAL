// Step42 production audioEngine export routing with mocked Web Audio rendering.
// Not a real browser/Windows audio device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installAudioIndexedDB} from './helpers/audio-indexeddb.mjs';
const rate=44100;
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
installAudioIndexedDB(fakeFile);
class Param{setValueAtTime(){}linearRampToValueAtTime(){}setValueCurveAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};Offline.last={channels,length,sampleRate};}
 createBufferSource(){return new Node();}
 createGain(){return new Gain();}
 async startRendering(){
  const l=new Float32Array(this.length),r=new Float32Array(this.length);
  l[0]=2;r[0]=-2;l[1]=2;r[1]=0;
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:i=>i===0?l:r};
 }
}
globalThis.window={OfflineAudioContext:Offline,AudioContext:class{decodeAudioData(){return Promise.resolve({duration:2,numberOfChannels:1});}}};
let src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
for(const name of ['assetDb','midiEngine','clipTiming','mixPeak','wavPcm','wavTrim','wavNormalize','wavExportRange','wavExportMeter'])
 src=src.replace(`'./${name}${['assetDb','midiEngine'].includes(name)?'':'.js'}'`,`'${new URL('../src/lib/'+name+'.js',import.meta.url).href}'`);
const {mixdownWav,mixdownWavDetailed}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const project={bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{id:'c',assetId:'a',startBar:1,durationSec:2}]}]};
const view=async blob=>new DataView(await blob.arrayBuffer());
test('Step42: production mixer defaults to 2-channel PCM and 44.1kHz/16-bit',async()=>{
 const v=await view(await mixdownWav(project));
 assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(34,true),16);
 assert.equal(v.getUint32(24,true),44100);assert.equal(Offline.last.channels,2);
});
test('Step42: production mixer routes mono/48kHz/24-bit to a 1-channel RIFF header',async()=>{
 const v=await view(await mixdownWav(project,{channels:1,bitDepth:24,sampleRate:48000}));
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint16(32,true),3);
 assert.equal(v.getUint32(40,true),Offline.last.length*3);
 assert.equal(Offline.last.channels,2); // Stereo rendering preserves panning before downmix.
});
test('Step42: mono peak protection uses post-downmix signal; stereo uses independent channel peaks',async()=>{
 const mono=await mixdownWavDetailed(project,{channels:1,peakProtection:true});
 const stereo=await mixdownWavDetailed(project,{channels:2,peakProtection:true});
 assert.ok(Math.abs(mono.peakReport.peakBefore-1)<1e-8);
 assert.ok(Math.abs(stereo.peakReport.peakBefore-2)<1e-8);
 assert.ok(mono.peakReport.gain>stereo.peakReport.gain);
 const v=await view(mono.blob);
 assert.equal(v.getInt16(44,true),0); // Opposite phase at frame 0 cancels.
 assert.ok(v.getInt16(46,true)>29000 && v.getInt16(46,true)<29300);
});
test('Step42: unsupported channels are rejected before allocating an offline context',async()=>{
 for(const channels of [0,3,'1',null])await assert.rejects(mixdownWavDetailed(project,{channels}),/채널/);
});
