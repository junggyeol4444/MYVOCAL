import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWavExport} from '../src/lib/wavExportMeter.js';
const make=(left,right=left,rate=1000)=>({length:left.length,sampleRate:rate,numberOfChannels:left===right?1:2,getChannelData:i=>i?right:left});
const approx=(actual,expected,eps=1e-6)=>assert.ok(Math.abs(actual-expected)<eps,`${actual} vs ${expected}`);

test('Step49 meter computes stereo sample peak, RMS and frame counts',()=>{
 const r=analyzeWavExport(make(new Float32Array([0,1]),new Float32Array([0,-1])));
 assert.equal(r.frames,2);assert.equal(r.channels,2);assert.equal(r.samplePeak,1);
 approx(r.rms,Math.SQRT1_2);approx(r.rmsDbfs,20*Math.log10(Math.SQRT1_2));
 assert.equal(r.overRangeSamples,0);assert.equal(r.overRangeFrames,0);
});
test('Step49 mono output meters post-downmix cancellation',()=>{
 const r=analyzeWavExport(make(new Float32Array([1,1]),new Float32Array([-1,-1])),{channels:1});
 assert.equal(r.samplePeak,0);assert.equal(r.rms,0);assert.equal(r.samplePeakDbfs,-Infinity);
 assert.equal(r.rmsDbfs,-Infinity);assert.equal(r.frames,2);
});
test('Step49 counts over-range samples and frames separately',()=>{
 const r=analyzeWavExport(make(new Float32Array([1.5,-2,0]),new Float32Array([1.25,.5,0])));
 assert.equal(r.overRangeSamples,3);assert.equal(r.overRangeFrames,2);assert.equal(r.samplePeak,2);
 approx(r.samplePeakDbfs,20*Math.log10(2));
});
test('Step49 exact full-scale values are not counted as over-range',()=>{
 const r=analyzeWavExport(make(new Float32Array([1,-1,0])));
 assert.equal(r.overRangeSamples,0);assert.equal(r.overRangeFrames,0);
});
test('Step49 reports gain before integer quantization and does not mutate input',()=>{
 const samples=new Float32Array([.25,-.5]);const r=analyzeWavExport(make(samples),{exportGain:3,channels:1});
 assert.equal(r.samplePeak,1.5);assert.equal(r.overRangeSamples,1);assert.deepEqual([...samples],[.25,-.5]);
});
test('Step49 selection excludes samples outside chosen frame range',()=>{
 const r=analyzeWavExport(make(new Float32Array([4,.25,.5,8])),{startFrame:1,endFrame:3});
 assert.equal(r.frames,2);assert.equal(r.durationSec,.002);assert.equal(r.samplePeak,.5);
 assert.equal(r.overRangeSamples,0);
});
test('Step49 5ms boundary fade meters actual output boundaries',()=>{
 const samples=new Float32Array(20).fill(2);const r=analyzeWavExport(make(samples),{edgeFadeMs:5,channels:1});
 assert.equal(r.samplePeak,2);assert.equal(r.overRangeSamples,14);
 assert.equal(samples[0],2); // non-destructive
});
test('Step49 one-frame edge fade produces silence',()=>{
 const r=analyzeWavExport(make(new Float32Array([2])),{edgeFadeMs:5});
 assert.equal(r.samplePeak,0);assert.equal(r.overRangeSamples,0);
});
test('Step49 detects nonfinite samples and mirrors encoder zero substitution',()=>{
 const r=analyzeWavExport(make(new Float32Array([NaN,Infinity,-Infinity,.25])),{channels:1});
 assert.equal(r.nonFiniteSamples,3);assert.equal(r.samplePeak,.25);
 approx(r.rms,.125);
});
test('Step49 rejects invalid channel selection',()=>assert.throws(()=>analyzeWavExport(make(new Float32Array([0])),{channels:3}),/채널/));
test('Step49 rejects invalid gain',()=>assert.throws(()=>analyzeWavExport(make(new Float32Array([0])),{exportGain:-1}),/배율/));
test('Step49 rejects invalid fade',()=>assert.throws(()=>analyzeWavExport(make(new Float32Array([0])),{edgeFadeMs:7}),/페이드/));
test('Step49 rejects invalid selection range',()=>assert.throws(()=>analyzeWavExport(make(new Float32Array([0])),{startFrame:1}),/범위/));
test('Step49 rejects empty buffer',()=>assert.throws(()=>analyzeWavExport(make(new Float32Array(0))),/버퍼/));
test('Step49 rejects unequal channel lengths',()=>assert.throws(()=>analyzeWavExport({length:2,sampleRate:1000,numberOfChannels:2,getChannelData:i=>new Float32Array(i?1:2)}),/길이/));
test('Step49 silent signal stays finite and reports negative infinity dBFS',()=>{
 const r=analyzeWavExport(make(new Float32Array(100)));assert.equal(r.rms,0);assert.equal(r.rmsDbfs,-Infinity);
});
