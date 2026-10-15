import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';
import {
  renderOfflineVocalGuide, renderOfflineVocalGuideSelection,
  resolveGuideCueRange,
} from '../src/lib/offlineVocalGuide.js';

const cue=(startSec,endSec,lyric='아',pitch=69,velocity=100)=>({startSec,endSec,lyric,pitch,velocity});
const makeAlignment=(cues=[cue(0,.25),cue(.5,.9,'사',72),cue(1.15,1.45,'이',65)])=>({
  format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,projectId:'offline-selection-test',
  trackId:'vocal-midi',sourceKey:'offline-selection-source',cues,
});
const bytes=async result=>new Uint8Array(await result.blob.arrayBuffer());
const read32=(wav,index)=>new DataView(wav.buffer,wav.byteOffset,wav.byteLength).getUint32(index,true);
const begin=Math.round(.5*22050),end=Math.round(.9*22050);

test('selecting the second cue exports only its PCM with a new WAV header',async()=>{
 const alignment=makeAlignment();
 const original=JSON.stringify(alignment);
 const full=await bytes(renderOfflineVocalGuide(alignment));
 const selected=renderOfflineVocalGuideSelection(alignment,null,2,2);
 const wav=await bytes(selected);
 assert.equal(selected.kind,'offline-formant-guide-selection');
 assert.equal(selected.rendered,1);
 assert.equal(selected.selection.startCue,2);
 assert.equal(selected.selection.endCue,2);
 assert.equal(selected.selection.startFrame,begin);
 assert.equal(selected.selection.endFrame,end);
 assert.equal(wav.length,44+(end-begin)*2);
 assert.equal(read32(wav,40),(end-begin)*2);
 assert.equal(String.fromCharCode(...wav.subarray(0,4)),'RIFF');
 assert.deepEqual(wav.subarray(44),full.subarray(44+begin*2,44+end*2));
 assert.equal(JSON.stringify(alignment),original);
});

test('multiple selected cues keep internal silent gaps and shift time to zero',async()=>{
 const alignment=makeAlignment();
 const result=renderOfflineVocalGuideSelection(alignment,null,1,2);
 const wav=await bytes(result);
 assert.equal(result.rendered,2);
 assert.equal(result.selection.count,2);
 assert.equal(wav.length,44+Math.round(.9*22050)*2);
 const silence=wav.subarray(44+Math.round(.35*22050)*2,44+Math.round(.45*22050)*2);
 assert.ok(silence.every(x=>x===0),'inter-note silence must remain zero');
 assert.ok(wav.subarray(44).some(x=>x!==0));
});

test('notes outside the range never leak into overlapped selected audio',async()=>{
 const alignment=makeAlignment([
  cue(0,.6,'아',60),cue(.1,.4,'사',75),cue(.7,.9,'이',67),
 ]);
 const selected=await bytes(renderOfflineVocalGuideSelection(alignment,null,2,2));
 const isolated=await bytes(renderOfflineVocalGuideSelection(
  makeAlignment([cue(0,.6,'—',60),cue(.1,.4,'사',75),cue(.7,.9,'—',67)]),null,2,2));
 assert.deepEqual(selected,isolated,'another simultaneously sounding MIDI note must not leak');
});

test('valid saved jamo timing is reflected in cropped audio without modifying the plan',async()=>{
 const alignment=makeAlignment([cue(0,.2,'아'),cue(.4,1,'아사'),cue(1.2,1.5,'나')]);
 const plan=buildPhonemePlan(alignment);
 const before=JSON.stringify(plan);
 const normal=await bytes(renderOfflineVocalGuideSelection(alignment,plan,2,2));
 const changed=structuredClone(plan);
 const pieces=changed.segments.filter(s=>s.cueIndex===2);
 assert.deepEqual(pieces.map(s=>s.kind),['nucleus','onset','nucleus']);
 pieces[0].endSec=.60;
 pieces[1].startSec=.60;
 pieces[1].endSec=.65;
 pieces[2].startSec=.65;
 const edited=await bytes(renderOfflineVocalGuideSelection(alignment,changed,2,2));
 assert.notDeepEqual(normal,edited);
 assert.deepEqual(edited,await bytes(renderOfflineVocalGuideSelection(alignment,changed,2,2)));
 assert.equal(JSON.stringify(plan),before);
 assert.equal(renderOfflineVocalGuideSelection(alignment,changed,2,2).timedCues,1);
});

test('a stale or invalid phoneme plan is rejected, not silently ignored',()=>{
 const a=makeAlignment();const plan=buildPhonemePlan(a);
 const stale=structuredClone(a);stale.cues[1].lyric='다';
 assert.throws(()=>renderOfflineVocalGuideSelection(stale,plan,2,2),/다시 생성/);
 const overlap=structuredClone(plan);const segment=overlap.segments.find(s=>s.cueIndex===2);
 segment.endSec=99;
 assert.throws(()=>renderOfflineVocalGuideSelection(a,overlap,2,2),/범위 밖|잘못/);
});

test('selection indices require integers in ascending valid bounds',()=>{
 const a=makeAlignment();
 for(const [start,end] of [[0,1],[1,0],[-1,1],[2,1],[1,4],[4,4],
   [1,3.5],[NaN,1],[Infinity,1],['1',2],[2,'2'],[null,1]]){
  assert.throws(()=>resolveGuideCueRange(a,start,end),/범위/,`${start} ~ ${end}`);
  assert.throws(()=>renderOfflineVocalGuideSelection(a,null,start,end),/범위/);
 }
 assert.deepEqual(resolveGuideCueRange(a,2,3),{
  startCue:2,endCue:3,startSec:.5,endSec:1.45,count:2,
 });
});

test('selection of only a silent/rest cue creates valid silent PCM',async()=>{
 const a=makeAlignment([cue(0,.2,'가'),cue(.3,.5,'—'),cue(.6,.8,'사')]);
 const r=renderOfflineVocalGuideSelection(a,null,2,2);
 const wav=await bytes(r);
 assert.equal(r.rendered,0);
 assert.equal(r.seconds,(Math.round(.5*22050)-Math.round(.3*22050))/22050);
 assert.equal(read32(wav,40),wav.length-44);
 assert.ok(wav.subarray(44).every(x=>x===0));
});

test('preview is read-only and cannot mutate MIDI cue objects',async()=>{
 const a=makeAlignment(),before=structuredClone(a);
 const r1=await bytes(renderOfflineVocalGuideSelection(a,null,2,3));
 const r2=await bytes(renderOfflineVocalGuideSelection(a,null,2,3));
 assert.deepEqual(r1,r2);
 assert.deepEqual(a,before);
});

test('rendering full MIDI after selection remains byte-identical to original full output',async()=>{
 const a=makeAlignment();
 const reference=await bytes(renderOfflineVocalGuide(a));
 await bytes(renderOfflineVocalGuideSelection(a,null,2,3));
 assert.deepEqual(await bytes(renderOfflineVocalGuide(a)),reference);
});

test('a short selected excerpt can render when whole overlapping arrangement exceeds safety budget',async()=>{
 const a=makeAlignment([
  cue(0,41,'사',60),cue(0,41,'아',64),cue(0,41,'나',67),
 ]);
 assert.throws(()=>renderOfflineVocalGuide(a),/120초/);
 const preview=renderOfflineVocalGuideSelection(a,null,2,2);
 assert.equal(preview.rendered,1);
 assert.equal(preview.seconds,41);
 const wav=await bytes(preview);
 assert.equal(read32(wav,40),41*22050*2);
});
