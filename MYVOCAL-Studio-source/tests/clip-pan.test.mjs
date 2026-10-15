import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clipPan,editClipPan,scheduleClipPan,monoPanCompensation,clipWindow,clipLevel} from '../src/lib/clipTiming.js';
const original=()=>({id:'one',assetId:'media',durationSec:4,startBar:2,fadeInSec:1,gainPercent:65});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`);

test('legacy clips remain centered without pan metadata or mutation',()=>{
 const clip=original(),before=structuredClone(clip);
 assert.equal(clipPan(clip),0);assert.deepEqual(clip,before);
});
test('pan percent maps -100 to -1 and +100 to +1',()=>{
 for(const [input,want] of [[-100,-1],[-25,-.25],[0,0],[25,.25],[100,1]])
  near(clipPan({...original(),panPercent:input}),want);
});
test('malformed persisted pan falls back to centered safely',()=>{
 for(const invalid of [NaN,Infinity,-Infinity,-101,101,'50',null,true,{},[]])
  assert.equal(clipPan({...original(),panPercent:invalid}),0);
 assert.equal(clipPan(null),0);
});
test('pan editing is immutable and survives JSON serialization',()=>{
 const clip=original(),edited=editClipPan(clip,'-47.5');
 assert.equal(edited.panPercent,-47.5);assert.equal(clip.panPercent,undefined);
 assert.equal(JSON.parse(JSON.stringify(edited)).panPercent,-47.5);
 assert.equal(edited.assetId,clip.assetId);assert.equal(edited.startBar,clip.startBar);
});
test('pan input accepts boundaries and center',()=>{
 for(const n of [-100,0,100])assert.equal(editClipPan(original(),n).panPercent,n);
});
test('pan editing rejects invalid or empty values',()=>{
 for(const invalid of ['', ' ',null,undefined,true,false,-100.01,100.01,NaN,Infinity,'hello',{},[]])
  assert.throws(()=>editClipPan(original(),invalid),/좌우 위치/);
 assert.throws(()=>editClipPan(null,0),/좌우 위치/);
 assert.throws(()=>editClipPan({durationSec:0},0),/좌우 위치/);
});
test('pan scheduling uses exact absolute start time',()=>{
 const events=[],param={setValueAtTime:(...args)=>events.push(args)};
 assert.equal(scheduleClipPan(param,{...original(),panPercent:60},2.125),.6);
 assert.deepEqual(events,[[.6,2.125]]);
});
test('pan scheduling rejects invalid time and absent parameter',()=>{
 for(const invalid of [-1,NaN,Infinity,null,'2'])
  assert.throws(()=>scheduleClipPan({setValueAtTime(){}},original(),invalid),/시각/);
 assert.throws(()=>scheduleClipPan(null,original(),0),/시각/);
 assert.throws(()=>scheduleClipPan({},original(),0),/시각/);
});
test('mono pan compensation preserves unity dominant channel',()=>{
 for(const pan of [-1,-.5,-.01,0,.01,.5,1]){
  const angle=(pan+1)*Math.PI/4,comp=monoPanCompensation(pan);
  near(Math.max(Math.cos(angle),Math.sin(angle))*comp,1);
  assert.ok(comp>=1 && comp<=Math.SQRT2+1e-9);
 }
});
test('mono pan compensation rejects invalid values',()=>{
 for(const invalid of [-1.1,1.1,NaN,Infinity,'0',null])
  assert.throws(()=>monoPanCompensation(invalid),/좌우 위치/);
});
test('pan is independent of trim, fades and clip gain',()=>{
 const clip=original(),edited=editClipPan(clip,75);
 assert.deepEqual(clipWindow(clip,120),clipWindow(edited,120));
 assert.equal(clipLevel(clip),clipLevel(edited));
 assert.equal(edited.fadeInSec,clip.fadeInSec);
});
test('clip pan UI is accessible and included in live-change guard',()=>{
 const src=readFileSync(new URL('../src/components/AudioWorkstation.jsx',import.meta.url),'utf8');
 assert.match(src,/aria-label=\{`\$\{c\.fileName\} 클립 좌우 위치`\}/);
 assert.ok(src.includes('editPan(t.id,c.id,e.target.value)'));
 assert.ok(src.includes('c.gainPercent,c.clipMuted,c.panPercent,c.assetId'));
});
test('live and offline rendering share a single pan routing helper',()=>{
 const src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
 assert.equal((src.match(/connectClipAudio\(/g)||[]).length,3);
 assert.ok(src.includes('scheduleClipPan(panner.pan,clip,startTime)'));
 assert.ok(src.includes('monoPanCompensation(pan)'));
});
