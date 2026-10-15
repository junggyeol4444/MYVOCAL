// Step43: real PCM encoder, channel-aware -60 dBFS trim and sample-peak guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {findWavAudibleRange,WAV_TRIM_THRESHOLD_DB} from '../src/lib/wavTrim.js';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
import {analyzeMixPeak} from '../src/lib/mixPeak.js';
const buf=(left,right=left,rate=48000)=>({length:left.length,numberOfChannels:left===right?1:2,sampleRate:rate,getChannelData:i=>i===0?left:right});
const make=(l,r=l,rate=48000)=>buf(Float32Array.from(l),l===r?undefined:Float32Array.from(r),rate);
const view=async (buffer,options)=>new DataView(await encodeWavPcm(buffer,options).arrayBuffer());
const samples=(v,bitDepth=16)=>Array.from({length:v.getUint32(40,true)/(bitDepth/8)/v.getUint16(22,true)},(_,i)=>v.getInt16(44+i*2,true));

test('Step43: threshold is exactly -60 dBFS and default output is unchanged',async()=>{
 assert.equal(WAV_TRIM_THRESHOLD_DB,-60);
 const b=make([0,0,.5,0,0]);
 const v=await view(b);assert.equal(v.getUint32(40,true),5*4);
 const r=findWavAudibleRange(b);assert.deepEqual([r.startFrame,r.endFrame,r.trimmed,r.silent],[2,3,true,false]);
});
test('Step43: 16-bit stereo trims only edges and preserves interior silence',async()=>{
 const b=make([0,0,.5,0,-.5,0,0],[0,0,.25,0,-.25,0,0]);
 const r=findWavAudibleRange(b);
 assert.deepEqual([r.startFrame,r.endFrame,r.removedStartFrames,r.removedEndFrames],[2,5,2,2]);
 const v=await view(b,{startFrame:r.startFrame,endFrame:r.endFrame});
 assert.equal(v.getUint32(40,true),3*4);assert.equal(v.getUint32(4,true),36+3*4);
 assert.equal(v.getInt16(44+4,true),0);assert.equal(v.getInt16(44+6,true),0);
});
test('Step43: 24-bit mono and 48kHz RIFF sizes reflect selected frames',async()=>{
 const b=make([0,.5,0,-.5,0],[0,.5,0,-.5,0]);
 const r=findWavAudibleRange(b,{channels:1});const v=await view(b,{bitDepth:24,channels:1,...r});
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint16(32,true),3);
 assert.equal(v.getUint32(40,true),9);assert.equal(v.byteLength,53);
});
test('Step43: mono trims based on post-downmix cancellation, stereo does not',()=>{
 const b=make([.8,.4,0,0],[ -.8,.4,0,0]);
 assert.deepEqual([findWavAudibleRange(b,{channels:1}).startFrame,findWavAudibleRange(b,{channels:2}).startFrame],[1,0]);
});
test('Step43: mono entirely canceled mix is preserved as silent output',async()=>{
 const b=make([.5,-.4,0],[-.5,.4,0]);const r=findWavAudibleRange(b,{channels:1});
 assert.equal(r.silent,true);assert.equal(r.trimmed,false);
 assert.deepEqual([r.startFrame,r.endFrame],[0,3]);
 const v=await view(b,{channels:1,...r});assert.equal(v.getUint32(40,true),6);
});
test('Step43: below threshold edge is removed but exact threshold survives',()=>{
 const b=make([.0009,.001,.01,.0009]);const r=findWavAudibleRange(b);
 assert.deepEqual([r.startFrame,r.endFrame],[1,3]);
});
test('Step43: silent or sub-threshold mix does not create invalid zero-frame WAV',()=>{
 for(const b of [make([0,0,0]),make([.00001,-.00001])]){
  const r=findWavAudibleRange(b);assert.equal(r.silent,true);assert.equal(r.endFrame,b.length);
 }
});
test('Step43: selected range peak analysis excludes samples outside the exported window',()=>{
 const b=make([3,.2,.3,4]);
 const all=analyzeMixPeak(b),part=analyzeMixPeak(b,undefined,{startFrame:1,endFrame:3});
 assert.equal(all.peakBefore,4);assert.ok(part.peakBefore<.31&&part.peakBefore>.29);
 assert.equal(part.gain,1);assert.ok(all.gain<.25);
});
test('Step43: mono selected range peak uses downmix and does not alter samples',async()=>{
 const b=make([3,2,0,0],[ -3,2,0,0]);const before=[...b.getChannelData(0)];
 const r=findWavAudibleRange(b,{channels:1});assert.equal(r.startFrame,1);
 const peak=analyzeMixPeak(b,undefined,{mono:true,...r});
 assert.equal(peak.peakBefore,2);
 const v=await view(b,{channels:1,bitDepth:16,exportGain:peak.gain,...r});
 assert.equal(v.getUint32(40,true),2);
 assert.ok(v.getInt16(44,true)>29000&&v.getInt16(44,true)<29300);
 assert.deepEqual([...b.getChannelData(0)],before);
});
test('Step43: sample count and data bytes match at 44.1/48kHz, mono/stereo, 16/24-bit',async()=>{
 for(const rate of [44100,48000])for(const channels of [1,2])for(const bitDepth of [16,24]){
  const b=make([0,.2,.3,0],[0,.2,.3,0],rate),r=findWavAudibleRange(b,{channels});
  const v=await view(b,{...r,channels,bitDepth});const size=2*channels*bitDepth/8;
  assert.equal(v.getUint32(40,true),size);assert.equal(v.byteLength,44+size);
  assert.equal(v.getUint32(28,true),rate*channels*bitDepth/8);
 }
});
test('Step43: invalid trim channels, threshold, buffers, samples fail clearly',()=>{
 const b=make([0,.5]);
 for(const channels of [0,3,'1',null])assert.throws(()=>findWavAudibleRange(b,{channels}),/채널/);
 for(const thresholdDb of [1,-121,NaN,Infinity,'-60'])assert.throws(()=>findWavAudibleRange(b,{thresholdDb}),/임계값/);
 assert.throws(()=>findWavAudibleRange(null),/버퍼/);
 assert.throws(()=>findWavAudibleRange(make([0,NaN])),/유효하지/);
 assert.throws(()=>findWavAudibleRange(make([0,Infinity])),/유효하지/);
 assert.throws(()=>findWavAudibleRange(buf(Float32Array.of(.5),Float32Array.of(.5,.3))),/길이/);
});
test('Step43: invalid output frame ranges reject instead of corrupting WAV',()=>{
 const b=make([.1,.2,.3]);
 for(const range of [{startFrame:-1},{startFrame:1,endFrame:1},{startFrame:2,endFrame:4},{startFrame:.5},{endFrame:null},{startFrame:NaN},{startFrame:3}]){
  assert.throws(()=>encodeWavPcm(b,range),/프레임 범위/);
  assert.throws(()=>analyzeMixPeak(b,undefined,range),/프레임 범위/);
 }
});
test('Step43: frame window keeps original PCM bytes exactly for interior segment',async()=>{
 const b=make([0,.2,-.4,0,.5,0]);
 const full=new Uint8Array(await encodeWavPcm(b).arrayBuffer());
 const cut=new Uint8Array(await encodeWavPcm(b,{startFrame:1,endFrame:5}).arrayBuffer());
 assert.deepEqual([...cut.slice(44)],[...full.slice(44+4,44+5*4)]);
});
