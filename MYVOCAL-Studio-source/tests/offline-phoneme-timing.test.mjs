import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';
import {guidePhonemeTiming,renderOfflineVocalGuide} from '../src/lib/offlineVocalGuide.js';

const cue=(lyric='아사',extras={})=>({lyric,pitch:69,startSec:0,endSec:.6,velocity:100,...extras});
const alignment=(lyric='아사',extras={})=>({
 format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,projectId:'local-test-project',
 trackId:'midi-track',sourceKey:'local-source-1',cues:[cue(lyric,extras)],
});
const getBytes=async(a,plan)=>new Uint8Array(await renderOfflineVocalGuide(a,plan).blob.arrayBuffer());
const sample=(wav,frame)=>new DataView(wav.buffer,wav.byteOffset,wav.byteLength).getInt16(44+frame*2,true);

function shortenFirstSyllable(plan){
 const segments=plan.segments;
 // 아: nucleus, 사: onset and nucleus. Keep gaps non-overlapping.
 assert.deepEqual(segments.map(s=>s.kind),['nucleus','onset','nucleus']);
 segments[0].endSec=.20;
 segments[1].startSec=.20;
 segments[1].endSec=.24;
 segments[2].startSec=.24;
 return plan;
}

test('existing projects with no phoneme plan produce the same legacy WAV',async()=>{
 const a=alignment('아사');
 const before=JSON.stringify(a);
 assert.deepEqual(await getBytes(a),await getBytes(a,null));
 assert.equal(renderOfflineVocalGuide(a).timedCues,0);
 assert.equal(JSON.stringify(a),before);
});

test('valid saved phoneme plan maps original syllables to real PCM time',()=>{
 const a=alignment();const plan=buildPhonemePlan(a);
 const layout=guidePhonemeTiming(a,plan)[0];
 assert.deepEqual(layout.map(x=>x.kind),['nucleus','onset','nucleus']);
 assert.equal(layout[0].start,0);
 assert.equal(layout[0].end,Math.round(.3*22050));
 assert.equal(layout[1].start,layout[0].end);
 assert.equal(layout[2].end,Math.round(.6*22050));
});

test('saved onset/nucleus timing changes the offline WAV and is reproducible',async()=>{
 const a=alignment();const plan=buildPhonemePlan(a);
 const original=JSON.stringify(a),saved=JSON.stringify(plan);
 const defaultTimed=await getBytes(a,plan);
 assert.equal(renderOfflineVocalGuide(a,plan).timedCues,1);
 const modified=shortenFirstSyllable(structuredClone(plan));
 const edited=await getBytes(a,modified);
 assert.equal(defaultTimed.length,edited.length);
 assert.deepEqual(defaultTimed.subarray(44+2*1100,44+2*1800),edited.subarray(44+2*1100,44+2*1800));
 assert.notDeepEqual(defaultTimed.subarray(44+2*5300,44+2*7000),edited.subarray(44+2*5300,44+2*7000));
 assert.deepEqual(edited,await getBytes(a,modified));
 assert.equal(JSON.stringify(a),original);
 assert.equal(JSON.stringify(plan),saved);
});

test('manual empty interval between syllables remains silent in WAV',async()=>{
 const a=alignment();const plan=shortenFirstSyllable(buildPhonemePlan(a));
 plan.segments[1].startSec=.23;
 const wav=await getBytes(a,plan);
 const middle=[...Array(300)].map((_,i)=>sample(wav,Math.round(.203*22050)+i));
 assert.ok(middle.every(x=>x===0));
 assert.notEqual(sample(wav,Math.round(.38*22050)),0);
});

test('out-of-range or overlapping manually edited phonemes fail before audio creation',()=>{
 const a=alignment();const plan=buildPhonemePlan(a);
 const outside=structuredClone(plan);outside.segments[0].endSec=1.2;
 assert.throws(()=>renderOfflineVocalGuide(a,outside),/범위 밖|겹치거나/);
 const overlap=structuredClone(plan);overlap.segments[1].startSec=.1;
 assert.throws(()=>renderOfflineVocalGuide(a,overlap),/겹치거나/);
});

test('stale phoneme timing is rejected without overwriting source project',()=>{
 const a=alignment();const plan=buildPhonemePlan(a);
 a.cues[0].lyric='아아';
 assert.throws(()=>renderOfflineVocalGuide(a,plan),/다시 생성/);
});

test('duplicate and reordered segment IDs are rejected before rendering',()=>{
 const a=alignment();const plan=buildPhonemePlan(a);
 const duplicate=structuredClone(plan);duplicate.segments[2].id=duplicate.segments[1].id;
 assert.throws(()=>renderOfflineVocalGuide(a,duplicate),/중복/);
 const swapped=structuredClone(plan);swapped.segments[0].id='c0-u1-p0';swapped.segments[1].id='c0-u0-p0';
 assert.throws(()=>renderOfflineVocalGuide(a,swapped),/일치하지|순서/);
});

test('unsupported Latin and punctuation guide notes keep original even split',async()=>{
 for(const lyric of ['Hello','아!이']){
  const a=alignment(lyric),plan=buildPhonemePlan(a);
  assert.equal(guidePhonemeTiming(a,plan)[0],null);
  assert.deepEqual(await getBytes(a,plan),await getBytes(a));
 }
});

test('zero velocity/rest notes remain silent even with a phoneme plan',async()=>{
 const a=alignment('사', {velocity:0}),plan=buildPhonemePlan(a);
 const result=renderOfflineVocalGuide(a,plan),wav=new Uint8Array(await result.blob.arrayBuffer());
 assert.equal(result.timedCues,0);
 assert.ok(wav.subarray(44).every(x=>x===0));
});

test('saved phoneme text labels do not pretend to be pronunciation audio',async()=>{
 const a=alignment(),plan=buildPhonemePlan(a);
 const original=await getBytes(a,plan);
 plan.segments[1].token='custom onset annotation';
 assert.deepEqual(original,await getBytes(a,plan));
});
