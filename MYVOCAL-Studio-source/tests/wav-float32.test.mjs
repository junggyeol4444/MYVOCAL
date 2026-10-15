// Step48: IEEE 754 float32 WAV interchange, with explicit WAVEFORMATEX + fact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavPcm,WAV_PCM_BITS,WAV_EXPORT_BITS} from '../src/lib/wavPcm.js';
const buffer=(left,right=left,sampleRate=48000)=>({length:left.length,sampleRate,numberOfChannels:2,getChannelData:i=>i?right:left});
const read=async blob=>new DataView(await blob.arrayBuffer());
const text=(v,offset,length)=>Array.from({length},(_,i)=>String.fromCharCode(v.getUint8(offset+i))).join('');
const floatAt=(v,frame,channel=0,channels=2)=>v.getFloat32(58+(frame*channels+channel)*4,true);
const l=new Float32Array([0,0.25,-0.5,1.5,-1.25,0.0000001]);
const r=new Float32Array([1,-1,0.5,-0.25,0.75,0]);
test('Step48 legacy integer PCM format options remain unchanged',()=>assert.deepEqual(WAV_PCM_BITS,[16,24]));
test('Step48 supported export depths include 32-bit IEEE float',()=>assert.deepEqual(WAV_EXPORT_BITS,[16,24,32]));
test('Step48 float WAV has correct RIFF/WAVE and WAVEFORMATEX format 3',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32}));
 assert.equal(text(v,0,4),'RIFF');assert.equal(text(v,8,4),'WAVE');assert.equal(text(v,12,4),'fmt ');
 assert.equal(v.getUint32(4,true),v.byteLength-8);assert.equal(v.getUint32(16,true),18);
 assert.equal(v.getUint16(20,true),3);assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint32(28,true),384000);
 assert.equal(v.getUint16(32,true),8);assert.equal(v.getUint16(34,true),32);assert.equal(v.getUint16(36,true),0);
});
test('Step48 float WAV fact and data chunks declare exact frame count',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32}));
 assert.equal(text(v,38,4),'fact');assert.equal(v.getUint32(42,true),4);
 assert.equal(v.getUint32(46,true),6);assert.equal(text(v,50,4),'data');
 assert.equal(v.getUint32(54,true),6*8);assert.equal(v.byteLength,58+6*8);
});
test('Step48 float output preserves positive samples above 0 dBFS',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32}));
 assert.equal(floatAt(v,3),1.5);
});
test('Step48 float output preserves negative samples below -1',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32}));
 assert.equal(floatAt(v,4),-1.25);
});
test('Step48 float output preserves small values and channel ordering',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32}));
 assert.equal(floatAt(v,1),l[1]);assert.equal(floatAt(v,1,1),r[1]);
 assert.equal(floatAt(v,5),l[5]);
});
test('Step48 mono float uses arithmetic L/R average',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32,channels:1}));
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(32,true),4);
 assert.equal(v.getUint32(54,true),l.length*4);
 assert.equal(v.getFloat32(58+2*4,true),0);
});
test('Step48 44.1 kHz mono float byte rate is correct',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r,44100),{bitDepth:32,channels:1}));
 assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(28,true),176400);
});
test('Step48 float selection only writes requested frames and fact agrees',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32,startFrame:2,endFrame:5}));
 assert.equal(v.getUint32(46,true),3);assert.equal(v.getUint32(54,true),24);
 assert.equal(floatAt(v,0),-0.5);assert.equal(floatAt(v,2),-1.25);
});
test('Step48 float output gain is applied without integer clipping',async()=>{
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32,exportGain:2}));
 assert.equal(floatAt(v,3),3);assert.equal(floatAt(v,4),-2.5);
});
test('Step48 float edge fade applies only to output samples',async()=>{
 const original=Array.from(l);
 const v=await read(encodeWavPcm(buffer(l,r),{bitDepth:32,edgeFadeMs:5}));
 assert.equal(floatAt(v,0),0);assert.equal(floatAt(v,5),0);
 assert.ok(Math.abs(floatAt(v,2)-(-0.5*2/3))<1e-7);
 assert.deepEqual(Array.from(l),original);
});
test('Step48 float converts NaN/Infinity DSP samples to silence',async()=>{
 const bad=Float32Array.from([NaN,Infinity,-Infinity,0.25]);
 const v=await read(encodeWavPcm(buffer(bad),{bitDepth:32,channels:1}));
 for(let i=0;i<3;i++)assert.equal(v.getFloat32(58+i*4,true),0);
 assert.equal(v.getFloat32(70,true),0.25);
});
test('Step48 float rejects 16-bit-only TPDF dither',()=>{
 assert.throws(()=>encodeWavPcm(buffer(l),{bitDepth:32,dither16:true}),/16비트/);
});
test('Step48 integer PCM remains byte-identical to the default',async()=>{
 for(const bits of [16,24]){
  const a=await encodeWavPcm(buffer(l,r),{bitDepth:bits}).arrayBuffer();
  const b=await encodeWavPcm(buffer(l,r),{bitDepth:bits,edgeFadeMs:0,dither16:false}).arrayBuffer();
  assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
  const v=new DataView(a);assert.equal(v.getUint16(20,true),1);assert.equal(text(v,36,4),'data');
 }
});
