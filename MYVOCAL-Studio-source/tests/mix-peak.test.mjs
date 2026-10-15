import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMixPeak,DEFAULT_PEAK_CEILING_DB} from '../src/lib/mixPeak.js';
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const make=(...channels)=>({numberOfChannels:channels.length,length:channels[0].length,getChannelData:i=>channels[i]});

test('default ceiling is -1 dBFS',()=>assert.equal(DEFAULT_PEAK_CEILING_DB,-1));
test('stereo guard inspects all channels and chooses the loudest',()=>{
 const data=make(Float32Array.from([0,.25,-.4]),Float32Array.from([0,-1.8,.8]));
 const r=analyzeMixPeak(data);near(r.peakBefore,1.8,1e-6);
 near(r.peakAfter,10**(-1/20));near(r.gain,(10**(-1/20))/1.8);assert.equal(r.attenuated,true);
});
test('quiet audio is never boosted',()=>{
 const r=analyzeMixPeak(make(Float32Array.from([0,-.1,.4])));
 assert.equal(r.gain,1);assert.equal(r.gainDb,0);assert.equal(r.attenuated,false);near(r.peakAfter,.4,1e-6);
});
test('silence remains silence without division by zero',()=>{
 const r=analyzeMixPeak(make(new Float32Array(4),new Float32Array(4)));
 assert.equal(r.peakBefore,0);assert.equal(r.peakAfter,0);assert.equal(r.gain,1);
});
test('gain is common to both stereo channels, preserving their ratio',()=>{
 const r=analyzeMixPeak(make(Float32Array.from([2]),Float32Array.from([.5])));
 near((.5*r.gain)/(2*r.gain),.25);
});
test('a 0 dBFS ceiling is valid and applies only attenuation',()=>{
 const r=analyzeMixPeak(make(Float32Array.from([1.5])),0);
 near(r.gain,2/3);near(r.peakAfter,1);
});
test('custom -6 dBFS ceiling is valid',()=>{
 const r=analyzeMixPeak(make(Float32Array.from([1.2])),-6);
 near(r.peakAfter,10**(-6/20));
});
test('rejects invalid ceiling without silently changing settings',()=>{
 for(const ceiling of [NaN,Infinity,-Infinity,1,-25,'-1'])
  assert.throws(()=>analyzeMixPeak(make(Float32Array.from([.2])),ceiling),/상한/);
});
test('rejects malformed or empty rendered buffers',()=>{
 for(const b of [null,{},make(new Float32Array(0)),{numberOfChannels:0,length:1,getChannelData(){return Float32Array.from([0])}}])
  assert.throws(()=>analyzeMixPeak(b),/올바르지/);
});
test('rejects channel length mismatch',()=>{
 assert.throws(()=>analyzeMixPeak(make(Float32Array.from([1,2]),Float32Array.from([1]))),/길이/);
});
test('rejects non-finite rendered samples instead of emitting corrupted WAV',()=>{
 for(const bad of [NaN,Infinity,-Infinity])
  assert.throws(()=>analyzeMixPeak(make(Float32Array.from([0,bad]))),/유효하지/);
});
test('never modifies rendered PCM',()=>{
 const l=Float32Array.from([.1,2,-.5]),r=Float32Array.from([.4,-.7,.9]);
 const before=[...l,...r];analyzeMixPeak(make(l,r));assert.deepEqual([...l,...r],before);
});
test('peak analysis is deterministic across repeated calls',()=>{
 const b=make(Float32Array.from([.4,1.1,-2.3]));
 assert.deepEqual(analyzeMixPeak(b),analyzeMixPeak(b));
});
