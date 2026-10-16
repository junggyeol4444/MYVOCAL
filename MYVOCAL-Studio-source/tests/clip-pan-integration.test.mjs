// Simulated Web Audio + IndexedDB test of production play() and mixdownWav().
// Uses deterministic mono PCM; not a real Windows or browser speaker test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installAudioIndexedDB} from './helpers/audio-indexeddb.mjs';
import {duplicateClipInTracks,splitClipInTracks} from '../src/lib/clipArrangement.js';
import {createClipHistory,recordClipChange,applyClipHistory} from '../src/lib/clipHistory.js';
const rate=44100,mono=Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*220*i/rate));
const decoded={duration:1,sampleRate:rate,numberOfChannels:1,getChannelData:()=>mono};
const file={arrayBuffer:async()=>new ArrayBuffer(4)};
installAudioIndexedDB(file);
class Param{
 constructor(){this.value=1;this.events=[];}
 setValueAtTime(value,time){this.value=value;this.events.push({value,time});}
 linearRampToValueAtTime(value,time){this.value=value;this.events.push({value,time});}
 setTargetAtTime(value){this.value=value;}
 at(time){if(!this.events.length)return this.value;const e=this.events;
  if(time<=e[0].time)return e[0].value;
  for(let i=1;i<e.length;i++)if(time<=e[i].time){const a=e[i-1],b=e[i];return a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);}
  return e.at(-1).value;}
}
class Node{constructor(){this.next=null;}connect(x){this.next=x;}disconnect(){this.next=null;}}
class Gain extends Node{constructor(){super();this.gain=new Param();}}
class Panner extends Node{constructor(){super();this.pan=new Param();}}
class Source extends Node{constructor(){super();this.started=null;}start(when,offset,duration){this.started={when,offset,duration};}stop(){}}
class Context{
 constructor(){this.currentTime=0;this.destination={};this.sources=[];}
 decodeAudioData(){return Promise.resolve(decoded);}
 createBufferSource(){const n=new Source();this.sources.push(n);return n;}
 createGain(){return new Gain();}
 createStereoPanner(){return new Panner();}
 resume(){return Promise.resolve();}
}
class Offline extends Context{
 constructor(channels,length,sampleRate){super();this.length=length;this.sampleRate=sampleRate;}
 async startRendering(){const left=new Float32Array(this.length),right=new Float32Array(this.length);
  for(const src of this.sources){const {when,offset,duration}=src.started;
   for(let i=Math.ceil(when*rate);i<Math.min(this.length,Math.ceil((when+duration)*rate));i++){
    const from=Math.floor((i/rate-when+offset)*rate);if(from<0||from>=mono.length)continue;
    let l=mono[from],r=mono[from],node=src.next;
    while(node && node!==this.destination){
     if(node instanceof Gain){l*=node.gain.at(i/rate);r*=node.gain.at(i/rate);}
     if(node instanceof Panner){const angle=(node.pan.at(i/rate)+1)*Math.PI/4;l*=Math.cos(angle);r*=Math.sin(angle);}
     node=node.next;
    }
    left[i]+=l;right[i]+=r;
   }
  }
  return {length:this.length,sampleRate:rate,numberOfChannels:2,getChannelData:channel=>channel===0?left:right};
 }
}
globalThis.window={AudioContext:Context,OfflineAudioContext:Offline};
const url=new URL('../src/lib/audioEngine.js',import.meta.url);
let code=readFileSync(url,'utf8');
for(const name of ['assetDb','midiEngine'])code=code.replace(`'./${name}'`,`'${new URL(`../src/lib/${name}.js`,import.meta.url).href}'`);
code=code.replace("'./clipTiming.js'",`'${new URL('../src/lib/clipTiming.js',import.meta.url).href}'`);
code=code.replace("'./wavNormalize.js'",`'${new URL('../src/lib/wavNormalize.js',import.meta.url).href}'`);
code=code.replace("'./wavExportRange.js'",`'${new URL('../src/lib/wavExportRange.js',import.meta.url).href}'`);
code=code.replace("'./mixPeak.js'",`'${new URL('../src/lib/mixPeak.js',import.meta.url).href}'`);
code=code.replace("'./wavTrim.js'",`'${new URL('../src/lib/wavTrim.js',import.meta.url).href}'`);
code=code.replace("'./wavPcm.js'",`'${new URL('../src/lib/wavPcm.js',import.meta.url).href}'`);
code=code.replace("'./wavExportMeter.js'",`'${new URL('../src/lib/wavExportMeter.js',import.meta.url).href}'`);
const {AudioEngine,mixdownWav}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const project=(panPercent,extras={})=>({bpm:120,tracks:[{id:'t',volume:100,mute:false,solo:false,midiNotes:[],clips:[{id:'c',assetId:'sample',startBar:1,durationSec:1,panPercent,...extras}]}]});
async function channels(blob){const bytes=await blob.arrayBuffer(),v=new DataView(bytes);assert.equal(v.getUint16(22,true),2);let a=0,b=0;
 for(let i=44;i<v.byteLength;i+=4){const l=v.getInt16(i,true)/32768,r=v.getInt16(i+2,true)/32768;a+=l*l;b+=r*r;}
 return [Math.sqrt(a/(v.byteLength-44)*4),Math.sqrt(b/(v.byteLength-44)*4)];}
const near=(a,b,tol=.002)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);

test('live playback inserts mono pan and compensation only for noncenter clips',async()=>{
 const engine=new AudioEngine();assert.equal(await engine.play(project(100)),true);
 const nodes=engine.sources[0].nodes;
 assert.equal(nodes.length,6);assert.ok(nodes[3] instanceof Gain);assert.ok(nodes[4] instanceof Panner);
 assert.equal(nodes[4].pan.events[0].value,1);
 near(nodes[3].gain.value,1,1e-9);engine.stop(0);
 assert.equal(await engine.play(project(0)),true);
 assert.equal(engine.sources[0].nodes.length,4);engine.stop(0);
});
test('offline WAV renders hard left, center and hard right to distinct channels',async()=>{
 const left=await channels(await mixdownWav(project(-100)));
 const center=await channels(await mixdownWav(project(0)));
 const right=await channels(await mixdownWav(project(100)));
 assert.ok(left[0]>.1);near(left[1],0,1e-5);
 near(center[0],center[1],1e-6);
 near(right[0],0,1e-5);assert.ok(right[1]>.1);
 near(left[0],center[0]);near(right[1],center[1]);
});
test('intermediate pan keeps dominant channel level and attenuates the other',async()=>{
 const [l,r]=await channels(await mixdownWav(project(50)));
 const [c]=await channels(await mixdownWav(project(0)));
 near(r,c);assert.ok(l>0 && l<r);
});
test('pan coexists with clip gain, mute and fade on both stereo output channels',async()=>{
 const base=await channels(await mixdownWav(project(100)));
 const half=await channels(await mixdownWav(project(100,{gainPercent:50})));
 const muted=await channels(await mixdownWav(project(100,{clipMuted:true})));
 near(half[1]/base[1],.5);near(muted[0],0,1e-5);near(muted[1],0,1e-5);
 const fade=await channels(await mixdownWav(project(100,{fadeInSec:.5})));
 assert.ok(fade[1]<base[1]);
});
test('seeked live playback preserves pan instead of resetting to center',async()=>{
 const engine=new AudioEngine();assert.equal(await engine.play(project(-65),.35),true);
 const nodes=engine.sources[0].nodes,panner=nodes.find(n=>n instanceof Panner);
 assert.ok(panner);assert.equal(panner.pan.events[0].value,-.65);
 assert.ok(engine.sources[0].source.started.offset>=.35);
 engine.stop(0);
});
test('unsupported live panner fails explicitly and does not mark playback active',async()=>{
 const saved=Context.prototype.createStereoPanner;
 try{
  Context.prototype.createStereoPanner=undefined;
  const engine=new AudioEngine();
  await assert.rejects(engine.play(project(100)),/좌우 위치 조절을 지원하지/);
  assert.equal(engine.playing,false);
  assert.equal(await engine.play(project(0)),true);
  engine.stop(0);
 }finally{Context.prototype.createStereoPanner=saved;}
});
test('unsupported offline panner fails explicitly rather than exporting a centered WAV',async()=>{
 const saved=Offline.prototype.createStereoPanner;
 try{
  Offline.prototype.createStereoPanner=undefined;
  await assert.rejects(mixdownWav(project(-100)),/좌우 위치 조절을 지원하지/);
 }finally{Offline.prototype.createStereoPanner=saved;}
});

// Step36: production live playback and WAV mixdown schedule duplicated metadata
// as independent sources while decoding the same IndexedDB asset.
test('duplicated clip plays twice and renders two successive segments without media copies',async()=>{
 const original=project(0),tracks=duplicateClipInTracks(original.tracks,'t','c','copy',120);
 const doubled={...original,tracks};
 assert.deepEqual(tracks[0].clips.map(c=>c.assetId),['sample','sample']);
 const engine=new AudioEngine();assert.equal(await engine.play(doubled),true);
 assert.equal(engine.sources.length,2);
 near(engine.sources[1].source.started.when-engine.sources[0].source.started.when,1,1e-9);
 assert.equal(engine.sources[1].source.started.offset,0);engine.stop(0);
 const wav=await mixdownWav(doubled),v=new DataView(await wav.arrayBuffer());
 assert.equal((v.byteLength-44)/4,rate*2);
 const rms=(start,end)=>{let sum=0;for(let i=start;i<end;i++){const x=v.getInt16(44+i*4,true)/32768;sum+=x*x;}return Math.sqrt(sum/(end-start));};
 near(rms(0,rate),rms(rate,rate*2),1e-6);
 assert.ok(rms(0,rate)>.1);
});

// Step37: split playback and WAV export exercise production audioEngine code.
test('split live playback schedules two source segments at the correct playhead',async()=>{
 const original=project(0,{fadeInSec:.4,fadeOutSec:.4,fadeInCurve:'smooth',fadeOutCurve:'equalPower'});
 const tracks=splitClipInTracks(original.tracks,'t','c','c-right',120,.5);
 const split={...original,tracks};
 const engine=new AudioEngine();assert.equal(await engine.play(split),true);
 assert.equal(engine.sources.length,2);
 near(engine.sources[0].source.started.duration,.5,1e-9);
 near(engine.sources[1].source.started.offset,.5,1e-9);
 near(engine.sources[1].source.started.when-engine.sources[0].source.started.when,.5,1e-9);
 engine.stop(0);
 assert.equal(await engine.play(split,.75),true);
 assert.equal(engine.sources.length,1);
 near(engine.sources[0].source.started.offset,.75,1e-9);
 near(engine.sources[0].source.started.duration,.25,1e-9);
 engine.stop(0);
});

test('split WAV mix preserves original linear fade PCM to quantization tolerance',async()=>{
 const original=project(0,{fadeInSec:.4,fadeOutSec:.3});
 const split={...original,tracks:splitClipInTracks(original.tracks,'t','c','c-right',120,.5)};
 const before=new DataView(await (await mixdownWav(original)).arrayBuffer());
 const after=new DataView(await (await mixdownWav(split)).arrayBuffer());
 assert.equal(before.byteLength,after.byteLength);
 let maxDifference=0;
 for(let i=44;i<before.byteLength;i+=2){
  maxDifference=Math.max(maxDifference,Math.abs(before.getInt16(i,true)-after.getInt16(i,true)));
 }
 assert.ok(maxDifference<=2,`linear fade max PCM difference: ${maxDifference}`);
});

test('split WAV mix retains nonlinear envelope without an audible-level discontinuity',async()=>{
 const original=project(0,{fadeInSec:.65,fadeOutSec:.25,fadeInCurve:'smooth',fadeOutCurve:'equalPower',gainPercent:55,panPercent:-50});
 const split={...original,tracks:splitClipInTracks(original.tracks,'t','c','c-right',120,.5)};
 const before=new DataView(await (await mixdownWav(original)).arrayBuffer());
 const after=new DataView(await (await mixdownWav(split)).arrayBuffer());
 assert.equal(before.byteLength,after.byteLength);
 let mse=0,maxDifference=0,count=0;
 for(let i=44;i<before.byteLength;i+=2){
  const difference=(before.getInt16(i,true)-after.getInt16(i,true))/32768;
  mse+=difference*difference;maxDifference=Math.max(maxDifference,Math.abs(difference));count++;
 }
 assert.ok(Math.sqrt(mse/count)<.0005,`split nonlinear RMS difference ${Math.sqrt(mse/count)}`);
 assert.ok(maxDifference<.002,`split nonlinear peak difference ${maxDifference}`);
});

// Step38: a real production mixdown after undo must restore the original audio.
test('undo and redo split restore production live source count and WAV PCM',async()=>{
 const base={...project(0,{fadeInSec:.3,fadeOutSec:.3}),id:'prj1'};
 const split=splitClipInTracks(base.tracks,'t','c','right',120,.45);
 const history=recordClipChange(createClipHistory('prj1'),'prj1',base.tracks,split,'t','분할');
 const undone=applyClipHistory(history,'prj1',split,'undo');
 const redone=applyClipHistory(undone.history,'prj1',undone.tracks,'redo');
 const baseline=new Uint8Array(await (await mixdownWav(base)).arrayBuffer());
 const restored=new Uint8Array(await (await mixdownWav({...base,tracks:undone.tracks})).arrayBuffer());
 assert.deepEqual(restored,baseline);
 const engine=new AudioEngine();
 assert.equal(await engine.play({...base,tracks:undone.tracks}),true);
 assert.equal(engine.sources.length,1);engine.stop(0);
 assert.equal(await engine.play({...base,tracks:redone.tracks}),true);
 assert.equal(engine.sources.length,2);engine.stop(0);
 const redoneWav=new Uint8Array(await (await mixdownWav({...base,tracks:redone.tracks})).arrayBuffer());
 const directWav=new Uint8Array(await (await mixdownWav({...base,tracks:split})).arrayBuffer());
 assert.deepEqual(redoneWav,directWav);
});
