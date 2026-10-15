import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitClipAtCursor,splitClipInTracks,duplicateClip} from '../src/lib/clipArrangement.js';
import {clipWindow,clipPlaybackPlan,clipFadeGain,clipFadeAutomation,editClipTiming,editClipFadeCurve,resetClipTiming} from '../src/lib/clipTiming.js';

const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const sample=()=>({id:'a',assetId:'audio-1',fileName:'vocal.wav',durationSec:8,startBar:2,
 sourceOffsetSec:1,playDurationSec:4,fadeInSec:1.5,fadeOutSec:1.3,
 fadeInCurve:'smooth',fadeOutCurve:'equalPower',gainPercent:67,clipMuted:false,panPercent:30});

test('split at project playhead preserves source positions, duration, IDs and metadata',()=>{
 const clip=sample(),before=structuredClone(clip);
 const [left,right]=splitClipAtCursor(clip,120,'b',4.25);
 const l=clipWindow(left,120),r=clipWindow(right,120);
 near(l.startSec,2);near(l.durationSec,2.25);near(r.startSec,4.25);
 near(r.durationSec,1.75);near(r.sourceOffsetSec,3.25);near(l.endSec,r.startSec);
 near(r.endSec,clipWindow(clip,120).endSec);
 assert.equal(left.id,'a');assert.equal(right.id,'b');
 for(const key of ['assetId','fileName','durationSec','gainPercent','clipMuted','panPercent','fadeInCurve','fadeOutCurve']){
  assert.equal(left[key],clip[key]);assert.equal(right[key],clip[key]);
 }
 assert.deepEqual(clip,before);
 assert.equal(clipPlaybackPlan(right,120,4.5)?.sourceOffsetSec,3.5);
 assert.equal(clipPlaybackPlan(left,120,4.5),null);
});

test('fractional bar at other tempos and old untrimmed clips',()=>{
 const clip={id:'a',assetId:'b',durationSec:3,startBar:1};
 const [l,r]=splitClipAtCursor(clip,137,'c',.55);
 near(l.playDurationSec,.55);near(r.sourceOffsetSec,.55);
 near(clipWindow(r,137).startSec,.55);near(clipWindow(r,137).endSec,3);
 assert.equal(l.assetId,r.assetId);
});

test('split envelope retains exact linear, smooth and equal-power original values',()=>{
 for(const [curveIn,curveOut] of [['linear','linear'],['smooth','equalPower'],['equalPower','smooth']]){
  const clip={...sample(),fadeInCurve:curveIn,fadeOutCurve:curveOut};
  const [l,r]=splitClipAtCursor(clip,120,'b',4.25);
  for(let i=0;i<=400;i++){
   const t=i/100;
   const target=clipFadeGain(clip,4,t);
   const actual=t<=2.25 ? clipFadeGain(l,2.25,t) : clipFadeGain(r,1.75,t-2.25);
   near(actual,target,1e-10);
  }
  near(clipFadeGain(l,2.25,2.25),clipFadeGain(r,1.75,0));
  assert.ok(clipFadeAutomation(r,1.75,0).length>=2);
 }
});

test('seek inside split piece begins at the correct original envelope value',()=>{
 const clip=sample(),[,r]=splitClipAtCursor(clip,120,'b',4.25);
 const points=clipFadeAutomation(r,1.75,.6);
 near(points[0].delaySec,0);
 near(points[0].gain,clipFadeGain(clip,4,2.85));
 assert.ok(points.every(p=>p.delaySec>=0&&p.gain>=0&&p.gain<=1));
});

test('repeated split retains the same fade reference across three segments',()=>{
 const clip=sample(),[left,right]=splitClipAtCursor(clip,120,'b',4.25);
 const [middle,last]=splitClipAtCursor(right,120,'c',5.15);
 near(left.playDurationSec+middle.playDurationSec+last.playDurationSec,4);
 near(middle.fadeReference.offsetSec,2.25);
 near(last.fadeReference.offsetSec,3.15);
 for(let i=0;i<=85;i++){
  const t=i/100;
  near(clipFadeGain(last,last.playDurationSec,t),clipFadeGain(clip,4,3.15+t),1e-9);
 }
});

test('editing split fades or trim switches only edited piece to local envelope',()=>{
 const clip=sample(),[l,r]=splitClipAtCursor(clip,120,'b',4.25);
 const changed=editClipFadeCurve(r,'out','linear');
 assert.equal(changed.fadeReference,undefined);
 assert.ok(l.fadeReference);
 const changedFade=editClipTiming(l,'fadeInSec',.25);
 assert.equal(changedFade.fadeReference,undefined);
 const changedTrim=editClipTiming(r,'playDurationSec',1.2);
 assert.equal(changedTrim.fadeReference,undefined);
 assert.equal(editClipTiming(r,'startBar',4).fadeReference.offsetSec,r.fadeReference.offsetSec);
 assert.equal(resetClipTiming(r).fadeReference,undefined);
});

test('split result survives JSON project roundtrip and can be duplicated',()=>{
 const [l,r]=splitClipAtCursor(sample(),120,'b',4.25);
 const saved=JSON.parse(JSON.stringify([l,r]));
 near(clipFadeGain(saved[1],1.75,.3),clipFadeGain(r,1.75,.3));
 const copy=duplicateClip(saved[1],120,'c');
 assert.deepEqual(copy.fadeReference,saved[1].fadeReference);
});

test('immutable track insertion keeps other clips and tracks unchanged',()=>{
 const other={id:'x',assetId:'z',durationSec:2,startBar:1};
 const tracks=[{id:'t1',clips:[other,sample()]},{id:'t2',clips:[other]}],before=structuredClone(tracks);
 const next=splitClipInTracks(tracks,'t1','a','b',120,4.25);
 assert.deepEqual(next[0].clips.map(c=>c.id),['x','a','b']);
 assert.equal(next[0].clips[0],other);assert.equal(next[1],tracks[1]);
 assert.deepEqual(tracks,before);
});

test('invalid split locations and identifiers are rejected without mutations',()=>{
 const clip=sample(),before=structuredClone(clip);
 for(const sec of [2,2.001,5.999,6,1,-1,NaN,Infinity,'3',null])
  assert.throws(()=>splitClipAtCursor(clip,120,'b',sec),/커서|분할/);
 for(const bpm of [0,-2,Infinity,NaN,'120'])
  assert.throws(()=>splitClipAtCursor(clip,bpm,'b',3),/BPM/);
 for(const invalid of [null,{}, {...clip,assetId:''},{...clip,id:''},{...clip,playDurationSec:.015}])
  assert.throws(()=>splitClipAtCursor(invalid,120,'b',3),/클립|분할/);
 assert.throws(()=>splitClipAtCursor(clip,120,'a',3),/ID/);
 assert.throws(()=>splitClipAtCursor(clip,120,'',3),/ID/);
 assert.deepEqual(clip,before);
});

test('split refuses bar positions above 999',()=>{
 const c={id:'a',assetId:'b',durationSec:3,startBar:998.9};
 assert.throws(()=>splitClipAtCursor(c,120,'c',1996.5),/999/);
});

test('track insertion rejects missing source, track, or duplicate ID',()=>{
 const tracks=[{id:'t',clips:[sample()]},{id:'other',clips:[{...sample(),id:'c'}]}];
 assert.throws(()=>splitClipInTracks(tracks,'t','missing','b',120,3),/찾을/);
 assert.throws(()=>splitClipInTracks(tracks,'missing','a','b',120,3),/트랙/);
 assert.throws(()=>splitClipInTracks(tracks,'t','a','c',120,3),/중복/);
 assert.throws(()=>splitClipInTracks(null,'t','a','b',120,3),/트랙/);
});

test('editor action uses actual cursor and split never writes media files',()=>{
 const ui=readFileSync(new URL('../src/components/AudioWorkstation.jsx',import.meta.url),'utf8');
 assert.match(ui,/splitClipInTracks\(projectRef\.current\.tracks,trackId,clipId,genId\('clip'\),projectRef\.current\.bpm,positionRef\.current\)/);
 assert.match(ui,/aria-label=\{`\$\{c\.fileName\} 커서에서 분할`\}/);
 const src=readFileSync(new URL('../src/lib/clipArrangement.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\b(?:putFile|deleteFile|forgetAudio|removeItem)\s*\(/);
});

test('malformed saved fade reference safely falls back to the local clip fade',()=>{
 const clip={id:'a',assetId:'b',durationSec:2,startBar:1,fadeInSec:.5,
  fadeReference:{durationSec:.2,offsetSec:2,fadeInSec:200}};
 near(clipFadeGain(clip,2,.25),.5);
 const [left,right]=splitClipAtCursor(clip,120,'c',1);
 near(clipFadeGain(left,1,.25),.5);
 near(clipFadeGain(right,1,.25),1);
});
