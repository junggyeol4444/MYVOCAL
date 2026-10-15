// Step47: actual production mixdown entrypoint with deterministic local Web Audio mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fakeFile={arrayBuffer:async()=>new ArrayBuffer(4)};
globalThis.indexedDB={open(){const request={result:{createObjectStore(){},transaction(){return {objectStore(){return {get(){const result={};queueMicrotask(()=>{result.result=fakeFile;result.onsuccess?.()});return result}}}}},close(){}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
class Param{setValueAtTime(){}linearRampToValueAtTime(){}setValueCurveAtTime(){}}
class Node{connect(){}disconnect(){}start(){}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
let renders=0;
class Offline{
 constructor(channels,length,sampleRate){this.length=length;this.sampleRate=sampleRate;this.destination={};}
 createBufferSource(){return new Node();}createGain(){return new Gain();}
 async startRendering(){
  renders++;
  const l=new Float32Array(this.length),r=new Float32Array(this.length),rate=this.sampleRate;
  for(let i=0;i<this.length;i++){
   if(i<rate/2){l[i]=1.2;r[i]=.8;}
   else if(i<rate){l[i]=.25;r[i]=.25;}
   else if(i<rate*1.5){l[i]=0;r[i]=0;}
   else {l[i]=.6;r[i]=.4;}
  }
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
const header=async blob=>new DataView(await blob.arrayBuffer());

test('Step47 full mixdown remains byte-identical when selection disabled',async()=>{
 const a=await bytes(await mixdownWav(project));
 const b=await bytes(await mixdownWav(project,{}));
 assert.deepEqual(a,b);
 const detail=await mixdownWavDetailed(project);assert.equal(detail.selectionReport,null);
});
test('Step47 selected 0.5-1.0 second outputs exactly half a second of PCM',async()=>{
 const {blob,selectionReport}=await mixdownWavDetailed(project,{startSec:.5,endSec:1});
 const v=await header(blob);assert.equal(v.getUint32(40,true),22050*4);
 assert.deepEqual([selectionReport.startFrame,selectionReport.endFrame],[22050,44100]);
 assert.equal(v.getInt16(44,true),8191);assert.equal(v.getInt16(46,true),8191);
});
test('Step47 selected output excludes louder audio from peak protection',async()=>{
 const selected=await mixdownWavDetailed(project,{startSec:.5,endSec:1,peakProtection:true});
 const whole=await mixdownWavDetailed(project,{peakProtection:true});
 assert.equal(selected.peakReport.attenuated,false);assert.equal(whole.peakReport.attenuated,true);
 assert.equal((await header(selected.blob)).getInt16(44,true),8191);
});
test('Step47 selected output is normalized based on selected peak only',async()=>{
 const selected=await mixdownWavDetailed(project,{startSec:.5,endSec:1,normalizePeak:true});
 assert.ok(selected.normalizationReport.gain>1);
 const whole=await mixdownWavDetailed(project,{normalizePeak:true});
 assert.ok(whole.normalizationReport.gain<1);
});
test('Step47 trim only removes silence inside selection',async()=>{
 const {blob,trimReport,selectionReport}=await mixdownWavDetailed(project,{startSec:.5,endSec:1.5,trimSilence:true});
 assert.equal(selectionReport.durationSec,1);
 assert.equal(trimReport.removedStartFrames,0);assert.equal(trimReport.removedEndFrames,22050);
 assert.equal((await header(blob)).getUint32(40,true),22050*4);
});
test('Step47 silent selected region stays at selected duration',async()=>{
 const {blob,trimReport}=await mixdownWavDetailed(project,{startSec:1,endSec:1.5,trimSilence:true});
 assert.equal(trimReport.silent,true);assert.equal((await header(blob)).getUint32(40,true),22050*4);
});
test('Step47 48kHz mono 24bit trim and edge fade work together',async()=>{
 const o={startSec:.25,endSec:1.5,sampleRate:48000,channels:1,bitDepth:24,trimSilence:true,edgeFade:true};
 const {blob,trimReport}=await mixdownWavDetailed(project,o);
 const v=await header(blob);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(24,true),48000);assert.equal(trimReport.removedEndFrames,24000);
 assert.equal(v.getUint32(40,true),36000*3);
 assert.equal(v.getUint8(44),0);assert.equal(v.getUint8(45),0);assert.equal(v.getUint8(46),0);
});
test('Step47 selected 16-bit dither remains deterministic',async()=>{
 const opts={startSec:.5,endSec:1,channels:1,dither16:true};
 const a=await bytes(await mixdownWav(project,opts));const b=await bytes(await mixdownWav(project,opts));
 assert.deepEqual(a,b);
});
test('Step47 rejects missing/reversed/oversized range before rendering',async()=>{
 for(const opts of [{startSec:0},{endSec:1},{startSec:1,endSec:.5},{startSec:0,endSec:3},{startSec:0,endSec:0},{startSec:'0',endSec:1}]){
  const before=renders;await assert.rejects(mixdownWav(project,opts),/선택 구간/);assert.equal(renders,before);
 }
});
test('Step47 range export does not mutate project or source assets',async()=>{
 const before=JSON.stringify(project);
 await mixdownWav(project,{startSec:.5,endSec:1.5,trimSilence:true,edgeFade:true,normalizePeak:true});
 assert.equal(JSON.stringify(project),before);
});
