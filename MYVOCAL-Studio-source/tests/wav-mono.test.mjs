// Step42: WAV mono PCM channel layout, deterministic downmix and peak protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavPcm,WAV_EXPORT_CHANNELS} from '../src/lib/wavPcm.js';
import {analyzeMixPeak} from '../src/lib/mixPeak.js';
const b=(left,right=left,rate=44100)=>({length:left.length,sampleRate:rate,numberOfChannels:left===right?1:2,getChannelData:i=>i===0?left:right});
const pcm=async (buffer,options)=>new DataView(await encodeWavPcm(buffer,options).arrayBuffer());
const pcm24=(v,at)=>{const u=v.getUint8(at)|(v.getUint8(at+1)<<8)|(v.getUint8(at+2)<<16);return u&0x800000?u-0x1000000:u;};
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('Step42: only 1- and 2-channel output is supported',()=>assert.deepEqual(WAV_EXPORT_CHANNELS,[1,2]));
test('Step42: mono RIFF headers, frame counts, block alignment and byte rate for 16/24 bit and 44.1/48kHz',async()=>{
 for(const rate of [44100,48000])for(const bitDepth of [16,24]){
  const v=await pcm(b(Float32Array.from([0,.2,-.4]),Float32Array.from([.5,0,.6]),rate),{bitDepth,channels:1});
  const align=bitDepth/8;
  assert.equal(v.getUint32(4,true),36+3*align);
  assert.equal(v.getUint16(20,true),1);assert.equal(v.getUint16(22,true),1);
  assert.equal(v.getUint32(24,true),rate);assert.equal(v.getUint32(28,true),rate*align);
  assert.equal(v.getUint16(32,true),align);assert.equal(v.getUint16(34,true),bitDepth);
  assert.equal(v.getUint32(40,true),3*align);assert.equal(v.byteLength,44+3*align);
 }
});
test('Step42: mono uses arithmetic average of left/right, not their sum or just left',async()=>{
 const left=Float32Array.from([1,0,-1,1]);const right=Float32Array.from([0,1,0,-1]);
 const v=await pcm(b(left,right),{channels:1});
 assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt16(44+i*2,true)),[16383,16383,-16384,0]);
});
test('Step42: 24-bit mono downmix uses signed 24-bit PCM with gain',async()=>{
 const v=await pcm(b(Float32Array.from([-1,1,.5]),Float32Array.from([-1,0,-.5])),{channels:1,bitDepth:24,exportGain:.5});
 assert.deepEqual([pcm24(v,44),pcm24(v,47),pcm24(v,50)],[-4194304,2097151,0]);
});
test('Step42: single-channel source is not halved by mono output',async()=>{
 const input=Float32Array.from([1,-1,.25]);const v=await pcm(b(input),{channels:1});
 assert.deepEqual([v.getInt16(44,true),v.getInt16(46,true),v.getInt16(48,true)],[32767,-32768,8191]);
});
test('Step42: anti-phase stereo cancels in mono, but remains stereo by default',async()=>{
 const input=b(Float32Array.from([.9,-.7]),Float32Array.from([-.9,.7]));
 const mono=await pcm(input,{channels:1});const stereo=await pcm(input);
 assert.equal(mono.getInt16(44,true),0);assert.equal(mono.getInt16(46,true),0);
 assert.notEqual(stereo.getInt16(44,true),0);assert.notEqual(stereo.getInt16(46,true),0);
});
test('Step42: mono export does not mutate source PCM',async()=>{
 const l=Float32Array.from([.5,-.2]),r=Float32Array.from([.7,.9]);const before=[[...l],[...r]];
 await pcm(b(l,r),{channels:1,bitDepth:24,exportGain:.7});assert.deepEqual([[...l],[...r]],before);
});
test('Step42: invalid output channels fail explicitly',()=>{
 for(const channels of [0,3,-1,1.5,'1',null,NaN,Infinity])
  assert.throws(()=>encodeWavPcm(b(Float32Array.from([.2])),{channels}),/채널/);
});
test('Step42: mono peak guard analyzes actual output channel instead of pre-downmix stereo peak',()=>{
 const input=b(Float32Array.from([2,-2]),Float32Array.from([-2,2]));
 assert.ok(analyzeMixPeak(input).gain<.5);
 const r=analyzeMixPeak(input,undefined,{mono:true});
 assert.equal(r.peakBefore,0);assert.equal(r.gain,1);assert.equal(r.attenuated,false);
});
test('Step42: mono peak guard limits the downmix to -1 dBFS without boosting',async()=>{
 const input=b(Float32Array.from([2,0]),Float32Array.from([1,0]));
 const r=analyzeMixPeak(input,undefined,{mono:true});
 near(r.peakBefore,1.5);near(r.peakAfter,10**(-1/20));
 const v=await pcm(input,{channels:1,exportGain:r.gain});
 near(v.getInt16(44,true)/32768,10**(-1/20),.00005);
});
test('Step42: mono peak guard detects invalid samples even when other channel could cancel',()=>{
 const input=b(Float32Array.from([NaN,Infinity]),Float32Array.from([0,0]));
 assert.throws(()=>analyzeMixPeak(input,undefined,{mono:true}),/유효하지/);
});
test('Step42: mono peak guard rejects missing channels and malformed option',()=>{
 assert.throws(()=>analyzeMixPeak(b(Float32Array.from([.1]),Float32Array.from([.1,.2])),undefined,{mono:true}),/길이/);
 assert.throws(()=>analyzeMixPeak(b(Float32Array.from([.1])),undefined,{mono:'yes'}),/옵션/);
});
