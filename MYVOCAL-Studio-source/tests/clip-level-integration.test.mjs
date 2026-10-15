// Deterministic Web Audio/IndexedDB doubles: verifies the actual engine wiring,
// not a browser or Windows GUI test. No external services or installed packages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rate=44100,sourceSamples=Float32Array.from({length:rate*2},(_,i)=>.25*Math.sin(2*Math.PI*440*i/rate));
const decoded={duration:2,sampleRate:rate,getChannelData:()=>sourceSamples};
const file={arrayBuffer:async()=>new ArrayBuffer(4)};
globalThis.indexedDB={open(){
 const req={result:{createObjectStore(){},transaction(){return {
  objectStore(){return {get(){const r={};queueMicrotask(()=>{r.result=file;r.onsuccess?.()});return r}}},
  close(){},
 }} ,close(){} }};
 queueMicrotask(()=>req.onsuccess?.());return req;
}};

class Param{
 constructor(){this.value=1;this.events=[];}
 setValueAtTime(value,time){this.events.push({value,time});this.value=value;}
 linearRampToValueAtTime(value,time){this.events.push({value,time});this.value=value;}
 setTargetAtTime(value){this.value=value;}
 at(t){if(!this.events.length)return this.value;const events=this.events;
  if(t<=events[0].time)return events[0].value;
  for(let i=1;i<events.length;i++)if(t<=events[i].time){
   const a=events[i-1],b=events[i],fraction=(t-a.time)/(b.time-a.time);
   return a.value+(b.value-a.value)*fraction;
  }
  return events.at(-1).value;
 }
}
class Gain{constructor(){this.gain=new Param();this.next=null;}connect(x){this.next=x;}disconnect(){this.next=null;}}
class Source{constructor(){this.buffer=null;this.next=null;this.started=null;}connect(x){this.next=x;}disconnect(){this.next=null;}stop(){}start(when,offset,duration){this.started={when,offset,duration};}}
class FakeAudioContext{
 constructor(){this.currentTime=0;this.destination={};this.sources=[];}
 decodeAudioData(){return Promise.resolve(decoded);}
 createBufferSource(){const x=new Source();this.sources.push(x);return x;}
 createGain(){return new Gain();}
 resume(){return Promise.resolve();}
}
class FakeOfflineAudioContext extends FakeAudioContext{
 constructor(channels,length,sampleRate){super();this.length=length;this.sampleRate=sampleRate;this.numberOfChannels=channels;}
 async startRendering(){
  const output=new Float32Array(this.length);
  for(const source of this.sources){const {when,offset,duration}=source.started;
   for(let i=Math.ceil(when*this.sampleRate);i<Math.min(this.length,Math.ceil((when+duration)*this.sampleRate));i++){
    const sourcePos=(i/this.sampleRate-when+offset)*rate;
    if(sourcePos<0||sourcePos>=sourceSamples.length)continue;
    const lo=Math.floor(sourcePos),hi=Math.min(lo+1,sourceSamples.length-1);
    const sample=sourceSamples[lo]*(1-(sourcePos-lo))+sourceSamples[hi]*(sourcePos-lo);
    let amp=1,node=source.next;
    while(node && node!==this.destination){amp*=node.gain.at(i/this.sampleRate);node=node.next;}
    output[i]+=sample*amp;
   }
  }
  return {length:this.length,sampleRate:this.sampleRate,numberOfChannels:2,getChannelData:()=>output};
 }
}
globalThis.window={AudioContext:FakeAudioContext,OfflineAudioContext:FakeOfflineAudioContext};
// The production browser bundler resolves extensionless imports. For Node's ESM
// test runner, load the same unmodified engine text with resolved file URLs.
const url=new URL('../src/lib/audioEngine.js',import.meta.url);
let engineSource=readFileSync(url,'utf8');
for(const dependency of ['assetDb','midiEngine'])
 engineSource=engineSource.replace(`'./${dependency}'`,`'${new URL(`../src/lib/${dependency}.js`,import.meta.url).href}'`);
engineSource=engineSource.replace("'./clipTiming.js'",`'${new URL('../src/lib/clipTiming.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./wavNormalize.js'",`'${new URL('../src/lib/wavNormalize.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./wavExportRange.js'",`'${new URL('../src/lib/wavExportRange.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./mixPeak.js'",`'${new URL('../src/lib/mixPeak.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./wavTrim.js'",`'${new URL('../src/lib/wavTrim.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./wavPcm.js'",`'${new URL('../src/lib/wavPcm.js',import.meta.url).href}'`);
engineSource=engineSource.replace("'./wavExportMeter.js'",`'${new URL('../src/lib/wavExportMeter.js',import.meta.url).href}'`);
const {AudioEngine,mixdownWav,mixdownWavDetailed}=await import('data:text/javascript;base64,'+Buffer.from(engineSource).toString('base64'));
const project=(gainPercent,clipMuted=false)=>({bpm:120,tracks:[{id:'track',name:'Voice',volume:80,mute:false,solo:false,
 clips:[{id:'clip',assetId:'sample',durationSec:2,startBar:1,gainPercent,clipMuted}],midiNotes:[]} ]});
async function rms(wav){const arr=await wav.arrayBuffer(),view=new DataView(arr);assert.equal(view.getUint16(22,true),2);
 let sum=0,count=0;for(let off=44;off<view.byteLength;off+=4){const s=view.getInt16(off,true)/32768;sum+=s*s;count++;}
 return Math.sqrt(sum/count);
}

test('real AudioEngine.play builds independent fade/clip/track gain chain',async()=>{
 const engine=new AudioEngine();
 assert.equal(await engine.play(project(50)),true);
 assert.equal(engine.sources.length,1);
 const {nodes}=engine.sources[0];
 assert.equal(nodes.length,4);
 assert.equal(nodes[0].next,nodes[1]);
 assert.equal(nodes[1].next,nodes[2]);
 assert.equal(nodes[2].next,nodes[3]);
 assert.equal(nodes[2].gain.events[0].value,.5);
 assert.equal(nodes[3].gain.value,.8);
 engine.stop(0);
});
test('actual mixdownWav engine path applies per-clip gain and mute to PCM',async()=>{
 const normal=await rms(await mixdownWav(project(100)));
 const half=await rms(await mixdownWav(project(50)));
 const silent=await rms(await mixdownWav(project(100,true)));
 assert.ok(normal>.13 && normal<.15,`normal=${normal}`);
 assert.ok(Math.abs(half/normal-.5)<.001,`half ratio=${half/normal}`);
 assert.equal(silent,0);
});

function maxPcm(blob){return blob.arrayBuffer().then(data=>{const v=new DataView(data);let peak=0;for(let i=44;i<v.byteLength;i+=2)peak=Math.max(peak,Math.abs(v.getInt16(i,true)/32768));return peak;});}
test('Step39: peak guard prevents PCM clipping from four overlapping boosted clips',async()=>{
 const p=project(200);p.tracks[0].volume=100;
 p.tracks[0].clips=Array.from({length:4},(_,i)=>({...p.tracks[0].clips[0],id:'loud'+i}));
 const raw=await mixdownWav(p),{blob,peakReport}=await mixdownWavDetailed(p,{peakProtection:true});
 assert.ok(peakReport.peakBefore>1.9,`peak=${peakReport.peakBefore}`);
 assert.ok(peakReport.gain<.5);assert.ok(peakReport.gainDb<0);
 assert.ok(await maxPcm(raw)>.99);
 assert.ok(await maxPcm(blob)<.893,`guarded peak=${await maxPcm(blob)}`);
 assert.ok(await maxPcm(blob)>.889);
});
test('Step39: optional protection does not modify legacy WAV bytes when disabled',async()=>{
 const p=project(100);
 const old=new Uint8Array(await (await mixdownWav(p)).arrayBuffer());
 const disabled=await mixdownWavDetailed(p,{peakProtection:false});
 assert.equal(disabled.peakReport,null);
 assert.deepEqual(new Uint8Array(await disabled.blob.arrayBuffer()),old);
});
test('Step39: peak guard leaves quiet WAV output byte-for-byte unchanged',async()=>{
 const p=project(100);
 const old=new Uint8Array(await (await mixdownWav(p)).arrayBuffer());
 const {blob,peakReport}=await mixdownWavDetailed(p,{peakProtection:true});
 assert.equal(peakReport.attenuated,false);
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),old);
});

test('Step40: production mixdown exports 24-bit PCM WAV without changing duration',async()=>{
 const p=project(100);
 const original=await mixdownWav(p);
 const {blob,peakReport}=await mixdownWavDetailed(p,{bitDepth:24});
 assert.equal(peakReport,null);
 const v=new DataView(await blob.arrayBuffer());
 assert.equal(v.getUint16(20,true),1);
 assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint16(32,true),6);
 assert.equal(v.getUint32(28,true),44100*6);
 assert.equal(blob.size,44+Math.ceil(2*rate)*6);
 assert.equal(original.size,44+Math.ceil(2*rate)*4);
});
test('Step40: 24-bit PCM works together with sample-peak guard',async()=>{
 const p=project(200);p.tracks[0].volume=100;
 p.tracks[0].clips=Array.from({length:4},(_,i)=>({...p.tracks[0].clips[0],id:'loud'+i}));
 const {blob,peakReport}=await mixdownWavDetailed(p,{bitDepth:24,peakProtection:true});
 assert.ok(peakReport.attenuated);
 const v=new DataView(await blob.arrayBuffer());let peak=0;
 for(let i=44;i<v.byteLength;i+=3){const n=v.getUint8(i)|(v.getUint8(i+1)<<8)|(v.getUint8(i+2)<<16);
  peak=Math.max(peak,Math.abs((n&0x800000?n-0x1000000:n)/8388608));}
 assert.ok(peak<.893 && peak>.889,`24-bit peak=${peak}`);
});
test('Step40: production mixdown rejects unsupported bit depth instead of silently falling back',async()=>{
 await assert.rejects(()=>mixdownWavDetailed(project(100),{bitDepth:64}),/16\/24비트 PCM 또는 32비트 float/);
});

// Step41: exercise the real production mixer with both OfflineAudioContext rates.
test('Step41: default WAV remains 44.1kHz and 48kHz changes render length and RIFF headers',async()=>{
 const p=project(100);
 const defaultBytes=new Uint8Array(await (await mixdownWav(p)).arrayBuffer());
 const explicitBytes=new Uint8Array(await (await mixdownWav(p,{sampleRate:44100})).arrayBuffer());
 assert.deepEqual(explicitBytes,defaultBytes,'default 44.1kHz WAV must be byte-identical');
 const v=new DataView(await (await mixdownWav(p,{sampleRate:48000})).arrayBuffer());
 assert.equal(v.getUint32(24,true),48000);
 assert.equal(v.getUint32(28,true),48000*4);
 assert.equal(v.getUint32(40,true),2*48000*4);
 assert.equal(v.byteLength,44+2*48000*4);
 assert.equal(new DataView(defaultBytes.buffer).getUint32(24,true),44100);
});
test('Step41: 48kHz and 24-bit PCM can be combined without changing project or decoded source',async()=>{
 const p=project(100),snapshot=structuredClone(p);
 const {blob,peakReport}=await mixdownWavDetailed(p,{sampleRate:48000,bitDepth:24,peakProtection:true});
 const v=new DataView(await blob.arrayBuffer());
 assert.equal(v.getUint32(24,true),48000);
 assert.equal(v.getUint32(28,true),48000*6);
 assert.equal(v.getUint16(32,true),6);
 assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(40,true),2*48000*6);
 assert.equal(peakReport.attenuated,false);
 assert.deepEqual(p,snapshot);
 assert.equal(decoded.sampleRate,44100);
});
test('Step41: 48kHz sample peak guard attenuates a loud mix before PCM encoding',async()=>{
 const p=project(200);p.tracks[0].volume=100;
 p.tracks[0].clips=Array.from({length:4},(_,i)=>({...p.tracks[0].clips[0],id:'loud48-'+i}));
 const {blob,peakReport}=await mixdownWavDetailed(p,{sampleRate:48000,peakProtection:true});
 assert.ok(peakReport.attenuated);
 assert.ok(peakReport.peakBefore>1.9);
 assert.ok(peakReport.gain<.5);
 assert.ok(await maxPcm(blob)<.893);
});
test('Step41: unsupported sample rates fail explicitly, without silently falling back',async()=>{
 for(const sampleRate of [0,-1,96000,22050,44100.5,'48000',NaN,Infinity,null])
  await assert.rejects(()=>mixdownWavDetailed(project(100),{sampleRate}),/44.1kHz 또는 48kHz/);
});
