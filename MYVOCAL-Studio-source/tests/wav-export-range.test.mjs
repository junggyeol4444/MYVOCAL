// Step47: sample-accurate, non-destructive WAV range selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWavExportRange} from '../src/lib/wavExportRange.js';
import {findWavAudibleRange} from '../src/lib/wavTrim.js';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
import {analyzeMixPeak} from '../src/lib/mixPeak.js';
import {analyzeWavPeakNormalization} from '../src/lib/wavNormalize.js';
const make=(left,right=left,rate=10)=>({length:left.length,sampleRate:rate,numberOfChannels:left===right?1:2,getChannelData:i=>i?right:left});
const arr=async(blob)=>new DataView(await blob.arrayBuffer());
const left=Float32Array.from([0,.25,.5,0,0,.75,0,.5,0,0]);
const b=make(left);

test('Step47 defaults to entire original mix without enabling selection',()=>{
 assert.deepEqual(resolveWavExportRange(b),{selected:false,startFrame:0,endFrame:10,startSec:0,endSec:1,durationSec:1});
});
test('Step47 rounds selected boundaries to output sample indices',()=>{
 const r=resolveWavExportRange(b,{startSec:.24,endSec:.76});
 assert.deepEqual([r.startFrame,r.endFrame,r.durationSec],[2,8,.6]);
});
test('Step47 supports exact single-frame range',()=>{
 const r=resolveWavExportRange(b,{startSec:.4,endSec:.5});assert.equal(r.endFrame-r.startFrame,1);
});
test('Step47 rejects sub-frame selections after rounding',()=>{
 assert.throws(()=>resolveWavExportRange(b,{startSec:.201,endSec:.209}),/1샘플/);
});
test('Step47 rejects missing start or end rather than exporting the whole mix',()=>{
 assert.throws(()=>resolveWavExportRange(b,{startSec:0}),/선택 구간/);
 assert.throws(()=>resolveWavExportRange(b,{endSec:1}),/선택 구간/);
});
test('Step47 rejects non-number, NaN and infinite positions',()=>{
 for(const v of ['0',null,NaN,Infinity,-Infinity,{},[],true]){
  assert.throws(()=>resolveWavExportRange(b,{startSec:v,endSec:1}),/선택 구간/);
  assert.throws(()=>resolveWavExportRange(b,{startSec:0,endSec:v}),/선택 구간/);
 }
});
test('Step47 rejects reversed, equal, negative and over-duration selection',()=>{
 for(const [startSec,endSec] of [[.5,.5],[.7,.2],[-.1,.2],[0,1.001],[0,0]])
  assert.throws(()=>resolveWavExportRange(b,{startSec,endSec}),/선택 구간/);
});
test('Step47 rejects malformed buffers and options',()=>{
 for(const buf of [null,{}, {length:0,sampleRate:10},{length:10,sampleRate:0}])
  assert.throws(()=>resolveWavExportRange(buf),/오디오 버퍼/);
 for(const o of [null,[],false])assert.throws(()=>resolveWavExportRange(b,o),/옵션/);
});
test('Step47 preserves exact frame order in 16-bit selected PCM',async()=>{
 const v=await arr(encodeWavPcm(b,{channels:1,...resolveWavExportRange(b,{startSec:.2,endSec:.6})}));
 assert.equal(v.getUint32(40,true),4*2);
 assert.deepEqual(Array.from({length:4},(_,i)=>v.getInt16(44+i*2,true)),[16383,0,0,24575]);
});
test('Step47 preserves exact frame order in 24-bit stereo selected PCM',async()=>{
 const r=Float32Array.from({length:10},(_,i)=>-left[i]);const s=make(left,r);
 const v=await arr(encodeWavPcm(s,{bitDepth:24,channels:2,...resolveWavExportRange(s,{startSec:.1,endSec:.3})}));
 assert.equal(v.getUint32(40,true),2*2*3);assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint8(44),0xff);assert.equal(v.getUint8(47),0x00);
});
test('Step47 trim checks only the selected interval, not outside audio',()=>{
 const selection=resolveWavExportRange(b,{startSec:.3,endSec:.9});
 const report=findWavAudibleRange(b,{channels:1,...selection});
 assert.deepEqual([report.startFrame,report.endFrame,report.removedStartFrames,report.removedEndFrames],[5,8,2,1]);
});
test('Step47 trim silent selection preserves selection length (not full mix)',()=>{
 const selection=resolveWavExportRange(b,{startSec:.3,endSec:.5});
 const r=findWavAudibleRange(b,{channels:1,...selection});
 assert.equal(r.silent,true);assert.equal(r.trimmed,false);assert.deepEqual([r.startFrame,r.endFrame],[3,5]);
});
test('Step47 trim rejects invalid selected frame ranges',()=>{
 for(const o of [{startFrame:-1},{startFrame:4,endFrame:4},{startFrame:4,endFrame:11},{startFrame:.5,endFrame:9}])
  assert.throws(()=>findWavAudibleRange(b,o),/프레임 범위/);
});
test('Step47 sample peak guard only analyzes selected output',()=>{
 const s=make(Float32Array.from([1.5,1.5,.2,.2,.2]));
 const whole=analyzeMixPeak(s);const sel=analyzeMixPeak(s,undefined,{startFrame:2,endFrame:5});
 assert.ok(whole.attenuated);assert.equal(sel.attenuated,false);
});
test('Step47 normalization only analyzes selected output',()=>{
 const s=make(Float32Array.from([1.5,1.5,.2,.2,.2]));
 const whole=analyzeWavPeakNormalization(s,{channels:1});
 const sel=analyzeWavPeakNormalization(s,{channels:1,startFrame:2,endFrame:5});
 assert.ok(whole.gain<1);assert.ok(sel.gain>1);
});
test('Step47 selection plus trim and fade changes only output, never source',async()=>{
 const original=left.slice();const sel=resolveWavExportRange(b,{startSec:.1,endSec:.9});
 const trim=findWavAudibleRange(b,{...sel,channels:1});
 const v=await arr(encodeWavPcm(b,{...trim,channels:1,edgeFadeMs:5}));
 assert.equal(v.getUint32(40,true),(trim.endFrame-trim.startFrame)*2);
 assert.deepEqual(left,original);
});
test('Step47 default encoder bytes remain identical to explicit whole-range selection',async()=>{
 const a=new Uint8Array(await encodeWavPcm(b).arrayBuffer());
 const c=new Uint8Array(await encodeWavPcm(b,resolveWavExportRange(b)).arrayBuffer());
 assert.deepEqual(a,c);
});
