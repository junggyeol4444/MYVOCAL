// Step45 deterministic sample-peak normalization tests (no hardware/browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWavPeakNormalization as normalize,WAV_NORMALIZE_MAX_BOOST_DB} from '../src/lib/wavNormalize.js';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
const make=(l,r=l,rate=1000)=>({numberOfChannels:l===r?1:2,length:l.length,sampleRate:rate,getChannelData:i=>i===0?l:r});
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const ceiling=10**(-1/20);
const wavView=async (b,opts)=>new DataView(await encodeWavPcm(b,opts).arrayBuffer());

test('Step45: ceiling is -1 dBFS and boost cap is +12 dB',()=>{
 assert.equal(WAV_NORMALIZE_MAX_BOOST_DB,12);
 assert.equal(normalize(make(Float32Array.of(.5))).ceilingDb,-1);
});
test('Step45: quiet audio is amplified toward -1 dBFS',()=>{
 const r=normalize(make(Float32Array.of(.5)));
 near(r.gain,ceiling/.5);near(r.peakAfter,ceiling);assert.equal(r.boosted,true);assert.equal(r.limited,false);
});
test('Step45: over-ceiling signal is attenuated instead of clipped',()=>{
 const r=normalize(make(Float32Array.of(1.5)));
 near(r.gain,ceiling/1.5);near(r.peakAfter,ceiling);assert.equal(r.attenuated,true);
});
test('Step45: silence stays silent, gain is finite and unity',()=>{
 const r=normalize(make(new Float32Array(30)));
 assert.equal(r.silent,true);assert.equal(r.gain,1);assert.equal(r.gainDb,0);assert.equal(r.peakAfter,0);
});
test('Step45: very quiet audio is capped at +12 dB',()=>{
 const r=normalize(make(Float32Array.of(.00001)));
 near(r.gain,10**(12/20));assert.equal(r.limited,true);assert.ok(r.peakAfter<ceiling);
});
test('Step45: exact target peak stays unity',()=>{
 const r=normalize(make(Float32Array.of(ceiling)));
 near(r.gain,1);assert.equal(r.boosted,false);assert.equal(r.attenuated,false);
});
test('Step45: mono normalization uses (L+R)/2, not stereo peak',()=>{
 const b=make(Float32Array.of(1,1),Float32Array.of(-1,0));
 const mono=normalize(b,{channels:1}),stereo=normalize(b,{channels:2});
 near(mono.peakBefore,.5);near(stereo.peakBefore,1);assert.ok(mono.gain>stereo.gain);
});
test('Step45: opposite phase cancels in mono without division by zero',()=>{
 const r=normalize(make(Float32Array.of(1,-1),Float32Array.of(-1,1)),{channels:1});
 assert.equal(r.peakBefore,0);assert.equal(r.gain,1);
});
test('Step45: stereo common gain preserves channel balance',()=>{
 const b=make(Float32Array.of(.4),Float32Array.of(-.2)),r=normalize(b);
 near((.4*r.gain)/(-.2*r.gain),-2);
});
test('Step45: trim bounds exclude large peaks outside export',()=>{
 const b=make(Float32Array.of(5,.25,.5,.25,7));
 const r=normalize(b,{startFrame:1,endFrame:4});near(r.peakBefore,.5);near(r.peakAfter,ceiling);
});
test('Step45: fade is accounted for before calculating peak',()=>{
 const b=make(Float32Array.from([2,.1,.1,.1,.1,.1,.1,.1,.1,2]));
 const raw=normalize(b),faded=normalize(b,{edgeFadeMs:5});
 near(raw.peakBefore,2);near(faded.peakBefore,.08);assert.ok(faded.gain>raw.gain);
});
test('Step45: one-frame fade becomes silence',()=>{
 const r=normalize(make(Float32Array.of(2)),{edgeFadeMs:5});
 assert.equal(r.peakBefore,0);assert.equal(r.gain,1);
});
test('Step45: 48kHz fade length is 240 frames',()=>{
 const b=make(Float32Array.from({length:700},(_,i)=>i===0?1:.5),undefined,48000);
 const r=normalize(b,{edgeFadeMs:5});near(r.peakBefore,.5);
});
test('Step45: gain actually reaches encoded 16-bit PCM target',async()=>{
 const b=make(Float32Array.of(.5,.25));const r=normalize(b);
 const v=await wavView(b,{exportGain:r.gain});
 assert.ok(v.getInt16(44,true)>=29200 && v.getInt16(44,true)<=29205);
});
test('Step45: gain actually reaches encoded 24-bit mono PCM target',async()=>{
 const b=make(Float32Array.of(.5,.5),Float32Array.of(.25,.25));
 const r=normalize(b,{channels:1}),v=await wavView(b,{channels:1,bitDepth:24,exportGain:r.gain});
 const n=v.getUint8(44)|(v.getUint8(45)<<8)|(v.getUint8(46)<<16);
 near(n/8388607,ceiling,1e-6);
});
test('Step45: normalization never mutates input PCM',async()=>{
 const l=Float32Array.of(.2,-.8,1),r=Float32Array.of(.1,-.2,.4),before=[...l,...r];
 const b=make(l,r),report=normalize(b);
 await wavView(b,{exportGain:report.gain});assert.deepEqual([...l,...r],before);
});
test('Step45: rejects invalid channel counts and fade types',()=>{
 const b=make(Float32Array.of(.5));
 for(const channels of [0,3,'1',null])assert.throws(()=>normalize(b,{channels}),/채널/);
 for(const edgeFadeMs of [true,1,null,-1,5.5,'5'])assert.throws(()=>normalize(b,{edgeFadeMs}),/페이드/);
});
test('Step45: rejects invalid range and empty buffers',()=>{
 const b=make(Float32Array.of(.5,.5));
 for(const opts of [{startFrame:-1},{startFrame:2},{endFrame:0},{endFrame:3},{startFrame:0.5}])
  assert.throws(()=>normalize(b,opts),/프레임/);
 assert.throws(()=>normalize(make(new Float32Array(0))),/버퍼/);
});
test('Step45: rejects NaN and infinity even on a zero-gain fade boundary',()=>{
 for(const bad of [NaN,Infinity,-Infinity])
  assert.throws(()=>normalize(make(Float32Array.of(bad,.1,.2)),{edgeFadeMs:5}),/유효하지/);
});
test('Step45: rejects unequal channel lengths',()=>{
 assert.throws(()=>normalize(make(Float32Array.of(.1,.2),Float32Array.of(.1))),/길이/);
});
test('Step45: repeated analysis is deterministic',()=>{
 const b=make(Float32Array.of(.1,.4,.8));
 assert.deepEqual(normalize(b),normalize(b));
});
