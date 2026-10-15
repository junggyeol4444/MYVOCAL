import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavPcm,WAV_PCM_BITS,WAV_EXPORT_SAMPLE_RATES} from '../src/lib/wavPcm.js';

function buffer(left,right=left,rate=44100){return {length:left.length,sampleRate:rate,numberOfChannels:left===right?1:2,
 getChannelData:i=>i===0?left:right};}
async function wav(buf,options){return new DataView(await encodeWavPcm(buf,options).arrayBuffer());}
function signed24(v,off){const u=v.getUint8(off)|(v.getUint8(off+1)<<8)|(v.getUint8(off+2)<<16);return u&0x800000?u-0x1000000:u;}
const data=Float32Array.from([-1,-.5,0,.5,1]);
test('Step40 supports only 16- and 24-bit integer PCM',()=>assert.deepEqual(WAV_PCM_BITS,[16,24]));
test('Step40 24-bit WAV has valid RIFF PCM header, block alignment and byte rate',async()=>{
 const v=await wav(buffer(data),{bitDepth:24});
 const ascii=(a,b)=>Array.from({length:b},(_,i)=>String.fromCharCode(v.getUint8(a+i))).join('');
 assert.equal(ascii(0,4),'RIFF');assert.equal(ascii(8,4),'WAVE');assert.equal(ascii(12,4),'fmt ');
 assert.equal(ascii(36,4),'data');assert.equal(v.getUint32(4,true),36+data.length*6);
 assert.equal(v.getUint16(20,true),1);assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(28,true),264600);
 assert.equal(v.getUint16(32,true),6);assert.equal(v.getUint16(34,true),24);
 assert.equal(v.getUint32(40,true),data.length*6);assert.equal(v.byteLength,44+data.length*6);
});
test('Step40 24-bit mono duplicates channels and preserves negative/positive limits',async()=>{
 const v=await wav(buffer(data),{bitDepth:24});
 const expected=[-8388608,-4194304,0,4194303,8388607];
 for(let i=0;i<data.length;i++){
  assert.equal(signed24(v,44+i*6),expected[i]);assert.equal(signed24(v,47+i*6),expected[i]);
 }
});
test('Step40 24-bit stereo keeps left and right samples separate',async()=>{
 const v=await wav(buffer(Float32Array.from([1,0]),Float32Array.from([-1,.5])),{bitDepth:24});
 assert.equal(signed24(v,44),8388607);assert.equal(signed24(v,47),-8388608);
 assert.equal(signed24(v,50),0);assert.equal(signed24(v,53),4194303);
});
test('Step40 24-bit gain and saturation match peak-protection export semantics',async()=>{
 const v=await wav(buffer(Float32Array.from([2,-2,.5])),{bitDepth:24,exportGain:.5});
 assert.equal(signed24(v,44),8388607);assert.equal(signed24(v,50),-8388608);
 assert.equal(signed24(v,56),2097151);
});
test('Step40 legacy 16-bit WAV remains identical to previous PCM encoding',async()=>{
 const v=await wav(buffer(data));
 assert.equal(v.getUint16(34,true),16);assert.equal(v.byteLength,44+data.length*4);
 for(let i=0;i<data.length;i++){
  const sample=Math.max(-1,Math.min(1,data[i]));const expected=Math.trunc(sample<0?sample*32768:sample*32767);
  assert.equal(v.getInt16(44+i*4,true),expected);assert.equal(v.getInt16(46+i*4,true),expected);
 }
});
test('Step40 encoder does not change original float samples',async()=>{
 const left=Float32Array.from([.7,-.2]);const right=Float32Array.from([.2,-.8]);
 await wav(buffer(left,right),{bitDepth:24,exportGain:.5});
 assert.deepEqual([...left],[...Float32Array.from([.7,-.2])]);
 assert.deepEqual([...right],[...Float32Array.from([.2,-.8])]);
});
test('Step40 rejects unsupported PCM bit depths',()=>{
 for(const bitDepth of [8,64,0,'24',NaN,null])assert.throws(()=>encodeWavPcm(buffer(data),{bitDepth}),/16\/24비트 PCM 또는 32비트 float/);
});
test('Step40 rejects invalid gain values',()=>{
 for(const exportGain of [-1,NaN,Infinity,-Infinity])assert.throws(()=>encodeWavPcm(buffer(data),{bitDepth:24,exportGain}),/배율/);
});
test('Step40 rejects missing or malformed audio buffers',()=>{
 for(const b of [null,{},buffer(new Float32Array()),{...buffer(data),getChannelData:()=>null},
  {...buffer(data),getChannelData:()=>new Float32Array(1)}])
  assert.throws(()=>encodeWavPcm(b,{bitDepth:24}),/버퍼|길이/);
});
test('Step40 rejects RIFF sizes beyond 32-bit limits before allocating',()=>{
 const b={length:800_000_000,sampleRate:44100,numberOfChannels:2,getChannelData:()=>data};
 assert.throws(()=>encodeWavPcm(b,{bitDepth:24}),/한도/);
});
test('Step40 keeps 24-bit output silent for zero-valued samples',async()=>{
 const v=await wav(buffer(new Float32Array(4)),{bitDepth:24});
 for(let i=44;i<v.byteLength;i++)assert.equal(v.getUint8(i),0);
});

test('Step41: only 44.1/48 kHz are offered by the export UI',()=>{
 assert.deepEqual(WAV_EXPORT_SAMPLE_RATES,[44100,48000]);
});
test('Step41: 48kHz PCM RIFF headers are correct for both 16 and 24 bits',async()=>{
 for(const bitDepth of [16,24]){
  const v=await wav(buffer(data,data,48000),{bitDepth});
  const blockAlign=bitDepth/8*2;
  assert.equal(v.getUint32(24,true),48000);
  assert.equal(v.getUint32(28,true),48000*blockAlign);
  assert.equal(v.getUint16(32,true),blockAlign);
  assert.equal(v.getUint32(40,true),data.length*blockAlign);
  assert.equal(v.byteLength,44+data.length*blockAlign);
 }
});
