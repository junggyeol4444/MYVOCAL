import test from 'node:test';
import assert from 'node:assert/strict';
import {clipFades,clipFadeGain,clipFadeAutomation,scheduleClipFade,clipWindow,clipPlaybackPlan,editClipTiming,resetClipTiming} from '../src/lib/clipTiming.js';

const legacy=()=>({id:'legacy',assetId:'original-wav',durationSec:4,startBar:2});
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('legacy clips render at full gain and never require a schema migration',()=>{
 const c=legacy(),copy=structuredClone(c);
 assert.deepEqual(clipFades(c,4),{fadeInSec:0,fadeOutSec:0});
 assert.equal(clipFadeGain(c,4,0),1);
 assert.equal(clipFadeGain(c,4,2),1);
 assert.equal(clipFadeGain(c,4,4),1);
 assert.deepEqual(c,copy);
});

test('fades linearly increase and decrease independently in audible window',()=>{
 const c={...legacy(),fadeInSec:1,fadeOutSec:.5};
 for (const [t,level] of [[0,0],[.25,.25],[.5,.5],[1,1],[2,1],[3.5,1],[3.75,.5],[4,0]]) approx(clipFadeGain(c,4,t),level);
});

test('non-finite, invalid and negative legacy metadata are ignored rather than crashing',()=>{
 for (const invalid of [NaN,Infinity,-Infinity,-1,'invalid',null,'1']) {
  const c={...legacy(),fadeInSec:invalid,fadeOutSec:invalid};
  assert.deepEqual(clipFades(c,4),{fadeInSec:0,fadeOutSec:0});
  assert.equal(clipFadeGain(c,4,2),1);
 }
});

test('overlapping saved fades fit shortened window without modifying any clip fields',()=>{
 const c={...legacy(),fadeInSec:3,fadeOutSec:3,playDurationSec:2};
 const before=structuredClone(c),timing=clipWindow(c,120);
 assert.equal(timing.durationSec,2);
 assert.deepEqual(clipFades(c,2),{fadeInSec:1,fadeOutSec:1});
 approx(clipFadeGain(c,2,.5),.5);approx(clipFadeGain(c,2,1),1);approx(clipFadeGain(c,2,1.5),.5);
 assert.deepEqual(c,before);
});

test('fade metadata roundtrips JSON without modifying original audio asset',()=>{
 const c=editClipTiming(editClipTiming(legacy(),'fadeInSec',.32),'fadeOutSec',.48);
 const saved=JSON.parse(JSON.stringify({tracks:[{clips:[c]}]})).tracks[0].clips[0];
 assert.equal(saved.fadeInSec,.32);assert.equal(saved.fadeOutSec,.48);
 assert.equal(saved.assetId,'original-wav');assert.equal(saved.durationSec,4);
 assert.equal(legacy().fadeInSec,undefined);
});

test('fade edits reject invalid and overlong values and preserve input object',()=>{
 const c=legacy(),copy=structuredClone(c);
 for (const value of [-1,-.01,4.01,Infinity,NaN,'','bad',null])
  for (const field of ['fadeInSec','fadeOutSec'])assert.throws(()=>editClipTiming(c,field,value),/페이드|입력/);
 assert.throws(()=>editClipTiming(c,'fadeOutSec',3e200),/입력|페이드/);
 assert.deepEqual(c,copy);
});

test('trimmed clip validates fades against its visible duration, not original WAV',()=>{
 const c=editClipTiming(legacy(),'playDurationSec',.6);
 assert.throws(()=>editClipTiming(c,'fadeInSec',.61),/페이드/);
 assert.equal(editClipTiming(c,'fadeInSec',.5).fadeInSec,.5);
});

test('editing trim does not delete previously saved fades, even when shortening the clip',()=>{
 const c=editClipTiming(editClipTiming(legacy(),'fadeInSec',2),'fadeOutSec',1.5);
 const t=editClipTiming(c,'playDurationSec',1);
 assert.equal(t.fadeInSec,2);assert.equal(t.fadeOutSec,1.5);
 const fades=clipFades(t,1);approx(fades.fadeInSec+fades.fadeOutSec,1);
});

test('trim reset is backward-compatible and does not reset fades',()=>{
 const c=editClipTiming(editClipTiming(legacy(),'fadeInSec',.7),'fadeOutSec',.4);
 const withTrim=editClipTiming(c,'sourceOffsetSec',1);
 const reset=resetClipTiming(withTrim);
 assert.equal(reset.fadeInSec,.7);assert.equal(reset.fadeOutSec,.4);
 assert.equal(reset.sourceOffsetSec,0);assert.equal(reset.playDurationSec,undefined);
});

test('playback automation starts at proper faded level on seek into fade-in',()=>{
 const c={...legacy(),fadeInSec:1,fadeOutSec:1};
 const when=clipWindow(c,120),plan=clipPlaybackPlan(c,120,2.5);
 const elapsed=plan.sourceOffsetSec-when.sourceOffsetSec;
 const points=clipFadeAutomation(c,when.durationSec,elapsed);
 assert.equal(elapsed,.5);assert.equal(points[0].delaySec,0);approx(points[0].gain,.5);
 approx(points[1].delaySec,.5);approx(points[1].gain,1);
});

test('playback automation starts at proper faded level on seek into fade-out',()=>{
 const c={...legacy(),fadeInSec:1,fadeOutSec:1};
 const window=clipWindow(c,120),plan=clipPlaybackPlan(c,120,5.5);
 const elapsed=plan.sourceOffsetSec-window.sourceOffsetSec;
 const points=clipFadeAutomation(c,window.durationSec,elapsed);
 assert.equal(elapsed,3.5);assert.equal(points[0].delaySec,0);approx(points[0].gain,.5);
 approx(points.at(-1).delaySec,.5);approx(points.at(-1).gain,0);
});

test('future clip has its fade scheduled from its actual start, not the project start',()=>{
 const c={...legacy(),fadeInSec:.5,fadeOutSec:.5},events=[];
 const param={setValueAtTime:(gain,time)=>events.push(['set',gain,time]),linearRampToValueAtTime:(gain,time)=>events.push(['ramp',gain,time])};
 const length=clipWindow(c,120).durationSec;
 scheduleClipFade(param,c,length,0,7);
 assert.deepEqual(events[0],['set',0,7]);
 assert.deepEqual(events[1],['ramp',1,7.5]);
 assert.deepEqual(events.at(-1),['ramp',0,11]);
});

test('live playback seek and offline export use one identical scheduling implementation',()=>{
 const c={...legacy(),fadeInSec:1,fadeOutSec:1},a=[],b=[];
 const events=arr=>({setValueAtTime:(v,t)=>arr.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>arr.push(['ramp',v,t])});
 scheduleClipFade(events(a),c,4,0,2);
 scheduleClipFade(events(b),c,4,0,2);
 assert.deepEqual(a,b);
 assert.deepEqual(a,[['set',0,2],['ramp',1,3],['ramp',1,5],['ramp',0,6]]);
});

test('silent/zero-length or invalid time windows schedule no fade events',()=>{
 const calls=[];const p={setValueAtTime:(...args)=>calls.push(args),linearRampToValueAtTime:(...args)=>calls.push(args)};
 for(const duration of [0,-1,NaN])assert.equal(scheduleClipFade(p,legacy(),duration,0,0),0);
 assert.equal(scheduleClipFade(p,legacy(),1,1,0),0);
 assert.equal(calls.length,0);
 assert.throws(()=>scheduleClipFade(p,legacy(),1,0,-1),/시각/);
});

test('fade envelope never exceeds unity or becomes negative for any sampled position',()=>{
 const c={...legacy(),fadeInSec:4,fadeOutSec:4};
 for(let t=0;t<=4;t+=.025){const gain=clipFadeGain(c,4,t);assert.ok(gain>=0&&gain<=1,`gain at ${t}: ${gain}`);}
});
