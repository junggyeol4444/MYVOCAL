import test from 'node:test';
import assert from 'node:assert/strict';
import {clipWindow,clipPlaybackPlan,editClipTiming,resetClipTiming,clipsEnd} from '../src/lib/clipTiming.js';

const original=()=>({id:'c1',assetId:'wav-1',fileName:'보컬.wav',startBar:1.625,durationSec:4,size:1024});
const project=(clips,bpm=120)=>({bpm,tracks:[{id:'vocal',clips,midiNotes:[]}]});

test('legacy clip has the same start and duration without any migration',()=>{
 const c=original(),before=structuredClone(c),t=clipWindow(c,120);
 assert.equal(t.startSec,1.25);assert.equal(t.sourceOffsetSec,0);assert.equal(t.durationSec,4);
 assert.deepEqual(c,before);
});
test('non-destructive source trim preserves original metadata and media id',()=>{
 const c=original(),edited=editClipTiming(c,'sourceOffsetSec','1.25');
 assert.equal(edited.sourceOffsetSec,1.25);
 assert.equal(clipWindow(edited,120).durationSec,2.75);
 assert.equal(edited.durationSec,4);assert.equal(edited.assetId,c.assetId);assert.deepEqual(c,original());
});
test('explicit play length shortens audio and project end',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',1),'playDurationSec',.75);
 const t=clipWindow(c,120);
 assert.equal(t.durationSec,.75);assert.equal(t.endSec,2);
 assert.equal(clipsEnd(project([c])),2);
});
test('seek before a clip schedules future start and the trimmed portion',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',.5),'playDurationSec',1.2);
 assert.deepEqual(clipPlaybackPlan(c,120,0),{delaySec:1.25,sourceOffsetSec:.5,durationSec:1.2});
});
test('seek inside a clip skips previously elapsed output but not original trim',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',.5),'playDurationSec',1.2);
 const p=clipPlaybackPlan(c,120,1.7);
 assert.ok(Math.abs(p.sourceOffsetSec-.95)<1e-10);
 assert.ok(Math.abs(p.durationSec-.75)<1e-10);
 assert.equal(p.delaySec,0);
});
test('seek after trimmed end schedules no audio',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',.5),'playDurationSec',1.2);
 assert.equal(clipPlaybackPlan(c,120,2.45),null);
 assert.equal(clipPlaybackPlan(c,120,10),null);
});
test('changing source trim clamps an existing play length to actual remaining media',()=>{
 const a=editClipTiming(original(),'playDurationSec',3.5);
 const b=editClipTiming(a,'sourceOffsetSec',3.25);
 assert.equal(b.playDurationSec,.75);assert.equal(clipWindow(b,120).durationSec,.75);
});
test('reset restores full original clip non-destructively',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',1),'playDurationSec',1);
 const reset=resetClipTiming(c);assert.equal(reset.sourceOffsetSec,0);assert.equal(reset.playDurationSec,undefined);
 assert.equal(clipWindow(reset,120).durationSec,4);assert.equal(reset.assetId,c.assetId);
});
test('start-bar edits support fractional bar placement across tempos',()=>{
 for(const bpm of [60,90,120,180,240]){
  const c=editClipTiming(original(),'startBar',1.375);
  assert.ok(Math.abs(clipWindow(c,bpm).startSec-.375*240/bpm)<1e-9);
 }
});
test('edits reject invalid or out-of-range input without changing source',()=>{
 const c=original(),copy=structuredClone(c);
 for(const bad of [null,'',NaN,Infinity,-Infinity,'hello']){
  for(const field of ['startBar','sourceOffsetSec','playDurationSec'])
   assert.throws(()=>editClipTiming(c,field,bad),/입력|길이|마디/);
 }
 for(const bad of [0,-1,1000])assert.throws(()=>editClipTiming(c,'startBar',bad),/마디/);
 for(const bad of [-.01,3.999,4,5])assert.throws(()=>editClipTiming(c,'sourceOffsetSec',bad),/원본/);
 for(const bad of [0,.001,5])assert.throws(()=>editClipTiming(c,'playDurationSec',bad),/재생/);
 assert.throws(()=>editClipTiming(c,'assetId',123),/지원하지/);
 assert.deepEqual(c,copy);
});
test('decoded media shorter than stale metadata never overreads real audio',()=>{
 const c=editClipTiming(editClipTiming(original(),'sourceOffsetSec',.6),'playDurationSec',3);
 const t=clipWindow(c,120,2);
 assert.equal(t.sourceOffsetSec,.6);
 assert.equal(t.durationSec,1.4);
 assert.equal(clipPlaybackPlan(c,120,2.65,2),null); // decoded audio ends here
});
test('JSON project save and reload retains trim fields with original asset unchanged',()=>{
 const originalProject=project([original()]);const before=JSON.stringify(originalProject);
 const edited=editClipTiming(editClipTiming(original(),'sourceOffsetSec',.8),'playDurationSec',1.75);
 const next={...originalProject,tracks:[{...originalProject.tracks[0],clips:[edited]}]};
 const restored=JSON.parse(JSON.stringify(next));
 assert.equal(restored.tracks[0].clips[0].sourceOffsetSec,.8);
 assert.equal(restored.tracks[0].clips[0].playDurationSec,1.75);
 assert.equal(restored.tracks[0].clips[0].assetId,'wav-1');
 assert.equal(JSON.stringify(originalProject),before);
});
test('project end uses longest clip including trimmed and legacy clips',()=>{
 const x=editClipTiming(editClipTiming(original(),'startBar',1),'playDurationSec',.5);
 const y={...original(),id:'c2',startBar:5,durationSec:2};
 assert.equal(clipsEnd(project([x,y])),10);
});
