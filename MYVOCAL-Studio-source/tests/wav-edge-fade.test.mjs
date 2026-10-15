// Step44: exported PCM edge fade, not a destructive source edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWavPcm,wavEdgeGain,WAV_EDGE_FADE_MS} from '../src/lib/wavPcm.js';
const buffer=(l,r=l,rate=1000)=>({length:l.length,sampleRate:rate,numberOfChannels:l===r?1:2,getChannelData:i=>i===0?l:r});
const view=async(b,opts)=>new DataView(await encodeWavPcm(b,opts).arrayBuffer());
const pcm16=(v,i,ch=0,channels=2)=>v.getInt16(44+(i*channels+ch)*2,true);
const pcm24=(v,off)=>{const n=v.getUint8(off)|(v.getUint8(off+1)<<8)|(v.getUint8(off+2)<<16);return n&0x800000?n-0x1000000:n;};
const near=(a,b,eps=2)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);

test('Step44: only a fixed 5ms fade is offered',()=>assert.equal(WAV_EDGE_FADE_MS,5));
test('Step44: disabled gain is exactly one',()=>assert.equal(wavEdgeGain(0,8,0),1));
test('Step44: symmetric 5-frame envelope has silent boundaries',()=>{
 const actual=Array.from({length:12},(_,i)=>wavEdgeGain(i,12,5));
 assert.deepEqual(actual,[0,.2,.4,.6,.8,1,1,.8,.6,.4,.2,0]);
});
test('Step44: one frame fades to zero',()=>assert.equal(wavEdgeGain(0,1,1),0));
test('Step44: two frames fade to zero on both ends',()=>assert.deepEqual([0,1].map(i=>wavEdgeGain(i,2,1)),[0,0]));
test('Step44: three frames retain the middle',()=>assert.deepEqual([0,1,2].map(i=>wavEdgeGain(i,3,1)),[0,1,0]));
test('Step44: invalid envelope indices rejected',()=>{
 for(const args of [[-1,10,5],[10,10,5],[0,0,0],[0,10,-1],[0,10,1.5],[NaN,10,1]])
  assert.throws(()=>wavEdgeGain(...args),/프레임/);
});
test('Step44: default encoding unchanged byte-for-byte',async()=>{
 const b=buffer(Float32Array.from([.2,.5,-.8,1]));
 assert.deepEqual(new Uint8Array(await encodeWavPcm(b).arrayBuffer()),new Uint8Array(await encodeWavPcm(b,{edgeFadeMs:0}).arrayBuffer()));
});
test('Step44: 16-bit PCM edges fade while interior stays unchanged',async()=>{
 const b=buffer(Float32Array.from({length:20},()=>.5));
 const v=await view(b,{edgeFadeMs:5});
 assert.equal(pcm16(v,0),0);assert.equal(pcm16(v,19),0);
 near(pcm16(v,1),32767*.5/5);near(pcm16(v,5),32767*.5);near(pcm16(v,14),32767*.5);
 near(pcm16(v,18),32767*.5/5);
});
test('Step44: trims before fading and preserves PCM length',async()=>{
 const b=buffer(Float32Array.from([.8,.8,.8,.8,.8,.8,.8,.8,.8,.8,.8,.8,.8,.8]));
 const v=await view(b,{startFrame:2,endFrame:12,edgeFadeMs:5});
 assert.equal(v.getUint32(40,true),10*4);assert.equal(pcm16(v,0),0);assert.equal(pcm16(v,9),0);
 assert.ok(pcm16(v,4)>0);assert.ok(pcm16(v,5)>0);
});
test('Step44: 24-bit stereo applies equal envelope to both channels',async()=>{
 const b=buffer(Float32Array.from({length:20},()=>.5),Float32Array.from({length:20},()=>-.25));
 const v=await view(b,{bitDepth:24,edgeFadeMs:5});
 assert.equal(pcm24(v,44),0);assert.equal(pcm24(v,47),0);
 near(pcm24(v,44+5*6),8388607*.5);near(pcm24(v,47+5*6),-8388608*.25);
 near(pcm24(v,44+1*6),8388607*.5/5);near(pcm24(v,47+1*6),-8388608*.25/5);
 assert.equal(pcm24(v,44+19*6),0);assert.equal(pcm24(v,47+19*6),0);
});
test('Step44: mono averages channels before fading',async()=>{
 const b=buffer(Float32Array.from({length:20},()=>.8),Float32Array.from({length:20},()=>.2));
 const v=await view(b,{channels:1,edgeFadeMs:5});
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(40,true),40);
 near(pcm16(v,5,0,1),32767*.5);near(pcm16(v,1,0,1),32767*.1);
});
test('Step44: sample rate determines actual fade frame count',async()=>{
 const b=buffer(Float32Array.from({length:700},()=>.5),undefined,48000);
 const v=await view(b,{edgeFadeMs:5});
 assert.equal(pcm16(v,0),0);near(pcm16(v,120),32767*.25);
 near(pcm16(v,240),32767*.5);near(pcm16(v,459),32767*.5);
 assert.equal(pcm16(v,699),0);
});
test('Step44: short exports do not overlap or exceed unity',async()=>{
 const b=buffer(Float32Array.from({length:4},()=>1));
 const v=await view(b,{edgeFadeMs:5});
 assert.deepEqual([0,1,2,3].map(i=>pcm16(v,i)),[0,16383,16383,0]);
});
test('Step44: 1-frame export fades to silence instead of divide-by-zero',async()=>{
 const v=await view(buffer(Float32Array.from([1])),{edgeFadeMs:5});
 assert.equal(pcm16(v,0),0);assert.equal(v.getUint32(40,true),4);
});
test('Step44: source samples are not modified',async()=>{
 const l=Float32Array.from([.1,.5,.3,-.8]);const before=Array.from(l);
 await view(buffer(l),{edgeFadeMs:5});assert.deepEqual(Array.from(l),before);
});
test('Step44: unsupported fade values are rejected before allocating',()=>{
 const b=buffer(Float32Array.from([.5]));
 for(const edgeFadeMs of [true,false,null,1,-5,5.5,'5',NaN,Infinity,{}])
  assert.throws(()=>encodeWavPcm(b,{edgeFadeMs}),/경계 페이드/);
});
test('Step44: disabled edge fade does not change export gain',async()=>{
 const b=buffer(Float32Array.from([.5,.7]));
 const v=await view(b,{edgeFadeMs:0,exportGain:.5});
 near(pcm16(v,0),32767*.25);near(pcm16(v,1),32767*.35);
});
