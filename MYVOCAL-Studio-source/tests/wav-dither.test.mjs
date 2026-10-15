// Step46 deterministic, opt-in TPDF dither at the final 16-bit PCM boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavPcm,createWavTpdfDither,WAV_DITHER_SEED} from '../src/lib/wavPcm.js';
const make=(left,right=left,sampleRate=48000)=>({length:left.length,sampleRate,numberOfChannels:left===right?1:2,getChannelData:ch=>ch?right:left});
const read=async(b,o)=>new DataView(await encodeWavPcm(b,o).arrayBuffer());
const pcm=(v)=>Array.from({length:(v.byteLength-44)/2},(_,i)=>v.getInt16(44+i*2,true));
const zeros=n=>new Float32Array(n);

test('Step46 dither seed is fixed and nonzero',()=>assert.equal(WAV_DITHER_SEED,0x4d59564f));
test('Step46 PRNG TPDF is deterministic for equal seeds',()=>{
 const a=createWavTpdfDither(),b=createWavTpdfDither();
 for(let i=0;i<1000;i++)assert.equal(a(),b());
});
test('Step46 TPDF noise lies strictly within +/-1 LSB',()=>{
 const draw=createWavTpdfDither();for(let i=0;i<10000;i++){const x=draw();assert.ok(x>-1&&x<1);}
});
test('Step46 TPDF distribution has approximately zero mean and triangular concentration',()=>{
 const draw=createWavTpdfDither();let sum=0,center=0;const n=100000;
 for(let i=0;i<n;i++){const x=draw();sum+=x;if(Math.abs(x)<.25)center++;}
 assert.ok(Math.abs(sum/n)<.012);assert.ok(center/n>.40&&center/n<.47);
});
test('Step46 PRNG rejects invalid seeds',()=>{
 for(const seed of [0,-1,2**32,1.5,NaN,Infinity,'5',null])assert.throws(()=>createWavTpdfDither(seed),/시드/);
});
test('Step46 disabled option retains exactly the historical bytes',async()=>{
 const b=make(Float32Array.from([-.99,-.1,0,.00001,.1,.99]));
 assert.deepEqual(new Uint8Array(await encodeWavPcm(b).arrayBuffer()),new Uint8Array(await encodeWavPcm(b,{dither16:false}).arrayBuffer()));
});
test('Step46 opt-in dither changes quantization without altering WAV RIFF layout',async()=>{
 const b=make(zeros(4096));const v=await read(b,{dither16:true,channels:1});
 assert.equal(v.getUint16(20,true),1);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);
 assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint32(40,true),4096*2);
 assert.equal(v.byteLength,44+4096*2);
 const samples=pcm(v);assert.ok(samples.some(x=>x!==0));assert.ok(samples.every(x=>Math.abs(x)<=1));
});
test('Step46 silence dither mean stays near zero and produces both signs',async()=>{
 const a=pcm(await read(make(zeros(100000)),{dither16:true,channels:1}));
 assert.ok(a.some(x=>x<0));assert.ok(a.some(x=>x>0));
 assert.ok(Math.abs(a.reduce((sum,x)=>sum+x,0)/a.length)<.025);
});
test('Step46 same input and options always produce identical bytes',async()=>{
 const b=make(Float32Array.from([.12,-.13,0,.4,-.8]));const o={dither16:true,channels:2,exportGain:.75};
 assert.deepEqual(new Uint8Array(await encodeWavPcm(b,o).arrayBuffer()),new Uint8Array(await encodeWavPcm(b,o).arrayBuffer()));
});
test('Step46 different PCM signal changes output',async()=>{
 const a=pcm(await read(make(Float32Array.from([.1])),{dither16:true,channels:1}));
 const b=pcm(await read(make(Float32Array.from([.2])),{dither16:true,channels:1}));
 assert.notDeepEqual(a,b);
});
test('Step46 dither is applied after gain, downmix, and fade',async()=>{
 const b=make(Float32Array.from([.8,.8,.8,.8]),Float32Array.from([-.8,-.8,-.8,-.8]));
 const v=pcm(await read(b,{dither16:true,channels:1,exportGain:.5,edgeFadeMs:5}));
 assert.ok(v.every(x=>Math.abs(x)<=1));
});
test('Step46 dithered output clips safely to signed 16-bit limits',async()=>{
 const b=make(Float32Array.from([-2,-1,1,2]));const a=pcm(await read(b,{dither16:true,channels:1}));
 assert.ok(a.every(x=>x>=-32768&&x<=32767));assert.ok(a[0]>=-32768&&a[0]<=-32767);assert.ok(a[3]>=32766&&a[3]<=32767);
});
test('Step46 dither does not modify Float32Array source',async()=>{
 const l=Float32Array.from([.2,-.3,0]),r=Float32Array.from([.5,.4,-.7]);
 const left=l.slice(),right=r.slice();await read(make(l,r),{dither16:true});
 assert.deepEqual(l,left);assert.deepEqual(r,right);
});
test('Step46 rejects dither option that is not a boolean',()=>{
 for(const dither16 of [0,1,null,'true',{},[],NaN])assert.throws(()=>encodeWavPcm(make(zeros(2)),{dither16}),/디더 옵션/);
});
test('Step46 rejects 24-bit dither rather than silently ignoring it',()=>{
 assert.throws(()=>encodeWavPcm(make(zeros(2)),{bitDepth:24,dither16:true}),/16비트 PCM/);
});
test('Step46 24-bit without dither stays byte-identical',async()=>{
 const b=make(Float32Array.from([-.1,0,.1]));
 assert.deepEqual(new Uint8Array(await encodeWavPcm(b,{bitDepth:24}).arrayBuffer()),new Uint8Array(await encodeWavPcm(b,{bitDepth:24,dither16:false}).arrayBuffer()));
});
test('Step46 44.1kHz and stereo interleaving remain valid',async()=>{
 const v=await read(make(zeros(4),zeros(4),44100),{dither16:true});
 assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(32,true),4);assert.equal(v.getUint32(40,true),16);
});
test('Step46 dither does not consume PRNG state when disabled',async()=>{
 const b=make(zeros(100));
 const a=await read(b,{dither16:true});await read(b,{dither16:false});const c=await read(b,{dither16:true});
 assert.deepEqual(new Uint8Array(a.buffer),new Uint8Array(c.buffer));
});
