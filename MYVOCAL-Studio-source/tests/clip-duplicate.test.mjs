import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duplicateClip,duplicateClipInTracks} from '../src/lib/clipArrangement.js';
import {clipWindow,clipPlaybackPlan} from '../src/lib/clipTiming.js';

const sample=()=>({id:'clip-1',assetId:'audio-1',fileName:'guide.wav',durationSec:10,startBar:2,
 sourceOffsetSec:2,playDurationSec:3,fadeInSec:.5,fadeOutSec:.25,
 fadeInCurve:'smooth',fadeOutCurve:'equalPower',gainPercent:73,clipMuted:false,panPercent:-35});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('duplicate after uses the audible end, not full source length',()=>{
 const clip=sample(),before=structuredClone(clip),copy=duplicateClip(clip,120,'clip-2');
 near(clipWindow(copy,120).startSec,5);
 assert.equal(copy.id,'clip-2');assert.equal(copy.assetId,clip.assetId);
 assert.equal(copy.playDurationSec,3);assert.equal(copy.sourceOffsetSec,2);
 assert.deepEqual(clip,before);
});
test('duplicate at playhead supports fractional bar positions and zero',()=>{
 near(clipWindow(duplicateClip(sample(),137,'clip-2','cursor',.55),137).startSec,.55);
 near(clipWindow(duplicateClip(sample(),120,'clip-2','cursor',0),120).startSec,0);
});
test('duplicate copies non-destructive fade, level, mute and pan metadata',()=>{
 const clip=sample(),copy=duplicateClip(clip,120,'clip-2');
 for(const key of ['assetId','fileName','durationSec','sourceOffsetSec','playDurationSec','fadeInSec','fadeOutSec','fadeInCurve','fadeOutCurve','gainPercent','clipMuted','panPercent'])
  assert.equal(copy[key],clip[key]);
 assert.equal(clipPlaybackPlan(copy,120,5)?.sourceOffsetSec,2);
 assert.equal(JSON.parse(JSON.stringify(copy)).panPercent,-35);
});
test('legacy clips with no optional fields duplicate unchanged',()=>{
 const legacy={id:'a',assetId:'b',durationSec:4,startBar:1};
 assert.deepEqual(duplicateClip(legacy,120,'c'),{...legacy,id:'c',startBar:3});
});
test('immutable insertion happens next to source, not end of track',()=>{
 const clip=sample(),other={id:'clip-3',assetId:'audio-3',durationSec:1,startBar:1};
 const tracks=[{id:'t1',clips:[clip,other],volume:80},{id:'t2',clips:[]}];
 const before=structuredClone(tracks),result=duplicateClipInTracks(tracks,'t1','clip-1','clip-2',120);
 assert.deepEqual(result[0].clips.map(c=>c.id),['clip-1','clip-2','clip-3']);
 assert.equal(result[0].clips[1].assetId,'audio-1');
 assert.equal(result[1],tracks[1]);assert.deepEqual(tracks,before);
});
test('duplicate on a second track leaves first track untouched',()=>{
 const tracks=[{id:'t1',clips:[sample()]},{id:'t2',clips:[{...sample(),id:'clip-3'}]}];
 const result=duplicateClipInTracks(tracks,'t2','clip-3','clip-4',120,'cursor',1.25);
 assert.equal(result[0],tracks[0]);near(clipWindow(result[1].clips[1],120).startSec,1.25);
});
test('rejects invalid source, missing asset, ID collisions and invalid BPM',()=>{
 for(const c of [null,{}, {...sample(),assetId:''},{...sample(),durationSec:0}])
  assert.throws(()=>duplicateClip(c,120,'new'),/클립|재생/);
 assert.throws(()=>duplicateClip(sample(),120,'clip-1'),/ID/);
 for(const bpm of [0,-1,NaN,Infinity,'120',null])assert.throws(()=>duplicateClip(sample(),bpm,'new'),/BPM/);
});
test('rejects invalid cursor positions and unsupported modes',()=>{
 for(const sec of [-1,NaN,Infinity,'1',null])
  assert.throws(()=>duplicateClip(sample(),120,'new','cursor',sec),/커서/);
 assert.throws(()=>duplicateClip(sample(),120,'new','unsupported',1),/위치/);
});
test('rejects clip placements beyond editor bar limit',()=>{
 assert.throws(()=>duplicateClip(sample(),120,'new','cursor',2000),/999/);
});
test('track duplication rejects missing track, missing clip and duplicate IDs',()=>{
 const tracks=[{id:'t1',clips:[sample()]},{id:'t2',clips:[]}];
 assert.throws(()=>duplicateClipInTracks(tracks,'missing','clip-1','new',120),/트랙/);
 assert.throws(()=>duplicateClipInTracks(tracks,'t1','missing','new',120),/찾을 수/);
 assert.throws(()=>duplicateClipInTracks(tracks,'t1','clip-1','clip-1',120),/중복/);
 assert.throws(()=>duplicateClipInTracks(null,'t1','clip-1','new',120),/트랙/);
});
test('editor exposes both actions and uses current cursor reference',()=>{
 const ui=readFileSync(new URL('../src/components/AudioWorkstation.jsx',import.meta.url),'utf8');
 assert.match(ui,/duplicateClipInTracks\(projectRef\.current\.tracks,trackId,clipId,genId\('clip'\),projectRef\.current\.bpm,mode,positionRef\.current\)/);
 assert.match(ui,/aria-label=\{`\$\{c\.fileName\} 뒤에 복제`\}/);
 assert.match(ui,/aria-label=\{`\$\{c\.fileName\} 커서에 복제`\}/);
});
test('shared asset ID means no IndexedDB file copy or deletion',()=>{
 const source=readFileSync(new URL('../src/lib/clipArrangement.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:putFile|deleteFile|forgetAudio|removeItem)\s*\(/);
 assert.equal(duplicateClip(sample(),120,'new').assetId,sample().assetId);
});
