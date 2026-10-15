import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIP_FADE_CURVES,clipFadeCurve,clipFadeGain,clipFadeAutomation,
 editClipFadeCurve,clipFades,clipWindow,scheduleClipFade,editClipTiming} from '../src/lib/clipTiming.js';

const old=()=>({id:'legacy',fileName:'voice.wav',assetId:'audio-001',durationSec:4,startBar:2,fadeInSec:1,fadeOutSec:1});
const approx=(actual,want,eps=1e-9)=>assert.ok(Math.abs(actual-want)<=eps,`${actual} != ${want}`);

test('old projects retain linear curves and exact linear scheduling',()=>{
 const clip=old(),copy=structuredClone(clip);
 assert.deepEqual(CLIP_FADE_CURVES,['linear','smooth','equalPower']);
 assert.equal(clipFadeCurve(clip,'in'),'linear');
 assert.equal(clipFadeCurve(clip,'out'),'linear');
 assert.deepEqual(clipFadeAutomation(clip,4),[
  {delaySec:0,gain:0},{delaySec:1,gain:1},{delaySec:3,gain:1},{delaySec:4,gain:0}
 ]);
 assert.deepEqual(clip,copy);
});

test('new curve values are saved as optional non-destructive clip metadata',()=>{
 const base=old();
 const inCurve=editClipFadeCurve(base,'in','smooth');
 const next=editClipFadeCurve(inCurve,'out','equalPower');
 assert.equal(next.fadeInCurve,'smooth');assert.equal(next.fadeOutCurve,'equalPower');
 assert.equal(next.assetId,base.assetId);assert.equal(next.durationSec,base.durationSec);
 assert.deepEqual(base,old());
 assert.deepEqual(JSON.parse(JSON.stringify(next)),next);
});

test('curve edits reject unknown values and directions; unknown saved curves fail closed to linear',()=>{
 const base=old();
 for(const bad of ['','Sine','exponential','__proto__',null,NaN,Infinity,{},1])
  assert.throws(()=>editClipFadeCurve(base,'in',bad),/곡선/);
 for(const bad of ['left','IN','',null])assert.throws(()=>editClipFadeCurve(base,bad,'smooth'),/곡선/);
 assert.throws(()=>editClipFadeCurve(null,'in','linear'),/곡선/);
 assert.equal(clipFadeCurve({...base,fadeInCurve:'unknown'},'in'),'linear');
 assert.equal(clipFadeCurve({...base,fadeOutCurve:123},'out'),'linear');
 assert.deepEqual(base,old());
});

test('smoothstep curve eases in/out with exact midpoint and endpoint values',()=>{
 const c={...old(),fadeInCurve:'smooth',fadeOutCurve:'smooth'};
 for(const [sec,level] of [[0,0],[.25,.15625],[.5,.5],[.75,.84375],[1,1],[2,1],[3,1],[3.25,.84375],[3.5,.5],[3.75,.15625],[4,0]])
  approx(clipFadeGain(c,4,sec),level);
});

test('equal-power curve uses sine amplitude at each independent fade',()=>{
 const c={...old(),fadeInCurve:'equalPower',fadeOutCurve:'equalPower'};
 approx(clipFadeGain(c,4,.5),Math.SQRT1_2);
 approx(clipFadeGain(c,4,3.5),Math.SQRT1_2);
 for(const t of [0,1,2,3,4])assert.ok(clipFadeGain(c,4,t)>=0&&clipFadeGain(c,4,t)<=1);
});

test('fade-in and fade-out can have independent shapes',()=>{
 const c={...old(),fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 approx(clipFadeGain(c,4,.25),.15625);
 approx(clipFadeGain(c,4,3.5),Math.SQRT1_2);
});

test('fades with zero times leave gain unchanged even if curve values are set',()=>{
 const c={...old(),fadeInSec:0,fadeOutSec:0,fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 for(const t of [0,.4,2,4])approx(clipFadeGain(c,4,t),1);
 assert.deepEqual(clipFadeAutomation(c,4),[{delaySec:0,gain:1},{delaySec:4,gain:1}]);
});

test('trimmed windows proportionally fit fades without changing the stored curves',()=>{
 const c={...old(),fadeInSec:3,fadeOutSec:3,fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 const shorter=editClipTiming(c,'playDurationSec',2);
 const before=structuredClone(shorter),duration=clipWindow(shorter,120).durationSec;
 assert.equal(duration,2);assert.deepEqual(clipFades(shorter,duration),{fadeInSec:1,fadeOutSec:1});
 approx(clipFadeGain(shorter,duration,.5),.5);
 approx(clipFadeGain(shorter,duration,1.5),Math.SQRT1_2);
 assert.deepEqual(shorter,before);
});

test('seeking into curved fade starts at correct gain and schedules only future points',()=>{
 const c={...old(),fadeInCurve:'equalPower',fadeOutCurve:'smooth'};
 const insideIn=clipFadeAutomation(c,4,.375);
 approx(insideIn[0].delaySec,0);approx(insideIn[0].gain,Math.sin(Math.PI*.375/2));
 assert.ok(insideIn.every(x=>x.delaySec>=0));
 const insideOut=clipFadeAutomation(c,4,3.375);
 approx(insideOut[0].gain,clipFadeGain(c,4,3.375));
 approx(insideOut.at(-1).delaySec,.625);approx(insideOut.at(-1).gain,0);
});

test('nonlinear automation approximates continuous curve accurately, within bounded CPU work',()=>{
 for(const shape of ['smooth','equalPower']){
  const c={...old(),fadeInCurve:shape,fadeOutCurve:shape};
  const points=clipFadeAutomation(c,4);
  assert.ok(points.length<=66);
  assert.ok(points.length>=60);
  for(let i=1;i<points.length;i++)assert.ok(points[i].delaySec>points[i-1].delaySec);
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],mid=(a.delaySec+b.delaySec)/2;
   const estimated=(a.gain+b.gain)/2;
   approx(estimated,clipFadeGain(c,4,mid),.001);
  }
 }
});

test('live playback and offline mixdown use the same curved automation routine',()=>{
 const c={...old(),fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 const calls=()=>{const data=[];return {data,param:{setValueAtTime:(v,t)=>data.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>data.push(['ramp',v,t])}}};
 const playback=calls(),offline=calls();
 scheduleClipFade(playback.param,c,4,0,2);
 scheduleClipFade(offline.param,c,4,0,2);
 assert.deepEqual(playback.data,offline.data);
 assert.deepEqual(playback.data[0],['set',0,2]);
 approx(playback.data.at(-1)[1],0);approx(playback.data.at(-1)[2],6);
});

test('seeking past end, invalid window and legacy formats cannot schedule invalid events',()=>{
 const c={...old(),fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 assert.deepEqual(clipFadeAutomation(c,4,4),[]);
 assert.deepEqual(clipFadeAutomation(c,0),[]);
 const events=[];
 const p={setValueAtTime:(...a)=>events.push(a),linearRampToValueAtTime:(...a)=>events.push(a)};
 assert.equal(scheduleClipFade(p,c,4,4,10),0);
 assert.equal(events.length,0);
 assert.throws(()=>scheduleClipFade(p,c,4,0,-1),/시각/);
});

test('curve envelope remains finite and bounded at all times, including invalid metadata',()=>{
 for(const input of [
  {...old(),fadeInCurve:'smooth',fadeOutCurve:'equalPower'},
  {...old(),fadeInSec:4,fadeOutSec:4,fadeInCurve:'equalPower',fadeOutCurve:'smooth'},
  {...old(),fadeInCurve:[],fadeOutCurve:'invalid'}
 ]){
  for(let i=0;i<=800;i++){
   const v=clipFadeGain(input,4,i/200);
   assert.ok(Number.isFinite(v)&&v>=0&&v<=1,`${i}: ${v}`);
  }
 }
});
