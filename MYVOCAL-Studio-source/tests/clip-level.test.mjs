import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clipLevel,editClipLevel,scheduleClipLevel,clipFadeAutomation,clipWindow,clipFadeGain} from '../src/lib/clipTiming.js';

const old=()=>({id:'old',assetId:'audio-1',fileName:'original.wav',durationSec:4,startBar:2,fadeInSec:1,fadeOutSec:1});
const approx=(got,want)=>assert.ok(Math.abs(got-want)<1e-9,`${got} != ${want}`);

test('legacy clips without new metadata remain audible at unity gain',()=>{
 const clip=old(),copy=structuredClone(clip);
 assert.equal(clipLevel(clip),1);
 assert.deepEqual(clip,copy);
});
test('clip gain percentages map to linear amplitudes, including boost and silence',()=>{
 for(const [percent,expected] of [[0,0],[1,.01],[25,.25],[50,.5],[100,1],[150,1.5],[200,2]])
  approx(clipLevel({...old(),gainPercent:percent}),expected);
});
test('muted clips are silent regardless of saved gain and remain unmodified',()=>{
 const clip={...old(),gainPercent:200,clipMuted:true};
 assert.equal(clipLevel(clip),0);
 assert.equal(clip.gainPercent,200);
 assert.equal(clipLevel({...clip,clipMuted:false}),2);
});
test('malformed saved gain metadata defaults safely to unity',()=>{
 for(const bad of [-1,201,Infinity,-Infinity,NaN,'50',null,{},[],true])
  assert.equal(clipLevel({...old(),gainPercent:bad}),1);
 assert.equal(clipLevel({...old(),clipMuted:'true'}),1);
 assert.equal(clipLevel(null),1);
});
test('gain edits accept numeric input and preserve original asset and timing',()=>{
 const clip=old();
 const changed=editClipLevel(clip,'gainPercent','67.5');
 assert.equal(changed.gainPercent,67.5);
 assert.equal(changed.assetId,clip.assetId);
 assert.equal(changed.durationSec,clip.durationSec);
 assert.equal(changed.startBar,clip.startBar);
 assert.deepEqual(clip,old());
 assert.equal(JSON.parse(JSON.stringify(changed)).gainPercent,67.5);
});
test('gain edits validate 0..200 and reject empty, boolean, nonfinite and unknown fields',()=>{
 for(const bad of ['', '  ',null,undefined,-.01,200.01,'bad',NaN,Infinity,-Infinity,true,false,[],{}])
  assert.throws(()=>editClipLevel(old(),'gainPercent',bad),/음량/);
 assert.throws(()=>editClipLevel(old(),'wrong',50),/지원하지/);
 assert.throws(()=>editClipLevel(null,'gainPercent',100),/음량/);
 assert.throws(()=>editClipLevel({durationSec:0},'gainPercent',100),/음량/);
});
test('mute edits require booleans, are immutable and survive JSON round-trip',()=>{
 const clip=old(),muted=editClipLevel(clip,'clipMuted',true);
 assert.equal(muted.clipMuted,true);
 assert.equal(clip.clipMuted,undefined);
 assert.equal(clipLevel(JSON.parse(JSON.stringify(muted))),0);
 assert.equal(clipLevel(editClipLevel(muted,'clipMuted',false)),1);
 for(const bad of ['true',1,0,null,undefined,{}])
  assert.throws(()=>editClipLevel(clip,'clipMuted',bad),/참\/거짓/);
});
test('clip level is independent of fade automation and clip trimming',()=>{
 const clip={...old(),gainPercent:50,fadeInCurve:'smooth',fadeOutCurve:'equalPower'};
 const before=clipFadeAutomation(clip,4);
 const after=clipFadeAutomation(editClipLevel(clip,'gainPercent',200),4);
 assert.deepEqual(before,after);
 approx(clipFadeGain(clip,4,.5),.5);
 assert.equal(clipWindow(clip,120).durationSec,4);
 assert.equal(clipLevel(clip),.5);
});
test('scheduling the gain stage at an absolute time is deterministic',()=>{
 const calls=[],param={setValueAtTime:(...args)=>calls.push(args)};
 assert.equal(scheduleClipLevel(param,{...old(),gainPercent:75},4.25),.75);
 assert.deepEqual(calls,[[.75,4.25]]);
 assert.equal(scheduleClipLevel(param,{...old(),gainPercent:200,clipMuted:true},9),0);
 assert.deepEqual(calls.at(-1),[0,9]);
});
test('invalid scheduling times or missing Web Audio parameters fail safely',()=>{
 for(const bad of [-1,NaN,Infinity,'1',null])
  assert.throws(()=>scheduleClipLevel({setValueAtTime(){}},old(),bad),/시각/);
 assert.throws(()=>scheduleClipLevel(null,old(),0),/시각/);
 assert.throws(()=>scheduleClipLevel({},old(),0),/시각/);
});
test('live playback and offline mixdown both schedule the same clip level helper',()=>{
 const src=readFileSync(new URL('../src/lib/audioEngine.js',import.meta.url),'utf8');
 assert.equal((src.match(/scheduleClipLevel\(clipGain\.gain,/g)||[]).length,2);
 assert.ok(src.includes('scheduleClipLevel(clipGain.gain,item.clip,when)'));
 assert.ok(src.includes('scheduleClipLevel(clipGain.gain,c,timing.startSec)'));
 assert.equal((src.match(/connectClipAudio\(/g)||[]).length,3); // shared helper + two call sites
 assert.ok(src.includes('source.connect(fade);fade.connect(clipGain)'));
 assert.ok(src.includes('return [...nodes,trackGain]'));
});
test('clip level UI exposes accessible volume and mute controls',()=>{
 const src=readFileSync(new URL('../src/components/AudioWorkstation.jsx',import.meta.url),'utf8');
 assert.match(src,/aria-label=\{`\$\{c\.fileName\} 클립 음량 퍼센트`\}/);
 assert.match(src,/aria-label=\{`\$\{c\.fileName\} 클립 음소거`\}/);
 assert.ok(src.includes("editLevel(t.id,c.id,'clipMuted',e.target.checked)"));
 assert.ok(src.includes('c.gainPercent,c.clipMuted,c.panPercent,c.assetId'));
});
