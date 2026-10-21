import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClipHistory,recordClipChange,applyClipHistory,CLIP_HISTORY_LIMIT} from '../src/lib/clipHistory.js';
import {splitClipInTracks,duplicateClipInTracks} from '../src/lib/clipArrangement.js';
import {clipWindow,editClipTiming,editClipLevel,clipFadeGain} from '../src/lib/clipTiming.js';

const clip=()=>({id:'c1',assetId:'wav1',fileName:'song.wav',durationSec:8,startBar:1,
 sourceOffsetSec:1,playDurationSec:4,fadeInSec:1,fadeOutSec:1,gainPercent:90});
const tracks=()=>[
 {id:'t1',name:'Vocal',volume:80,midiNotes:[{id:'m',pitch:60}],clips:[clip()]},
 {id:'t2',name:'Drums',volume:40,midiNotes:[{id:'d',pitch:36}],clips:[]}
];
function record(h,prev,next,trackId='t1',label='수정'){
 return recordClipChange(h,'prj1',prev,next,trackId,label);
}

test('undo and redo split preserve original source timing and fade envelope',()=>{
 const original=tracks(),split=splitClipInTracks(original,'t1','c1','c2',120,2.25);
 let h=record(createClipHistory('prj1'),original,split,'t1','분할');
 assert.equal(h.past.length,1);assert.equal(split[0].clips.length,2);
 const u=applyClipHistory(h,'prj1',split,'undo');
 assert.deepEqual(u.tracks,original);assert.equal(u.history.future.length,1);
 const r=applyClipHistory(u.history,'prj1',u.tracks,'redo');
 assert.deepEqual(r.tracks,split);assert.equal(r.history.past.length,1);
 assert.equal(r.tracks[0].clips[0].assetId,'wav1');
 assert.equal(r.tracks[0].clips[1].assetId,'wav1');
 assert.equal(clipWindow(r.tracks[0].clips[1],120).startSec,2.25);
 assert.ok(Math.abs(clipFadeGain(r.tracks[0].clips[1],1.75,.1)-clipFadeGain(clip(),4,2.35))<1e-9);
});

test('undo and redo clip duplication without altering other track',()=>{
 const original=tracks(),next=duplicateClipInTracks(original,'t1','c1','copy',120,'after');
 const h=record(createClipHistory('prj1'),original,next);
 const undone=applyClipHistory(h,'prj1',next,'undo');
 assert.deepEqual(undone.tracks[0].clips,original[0].clips);
 assert.equal(undone.tracks[1],next[1]);
 assert.equal(applyClipHistory(undone.history,'prj1',undone.tracks,'redo').tracks[0].clips[1].id,'copy');
});

test('clip edits and deletion are reversible while mixer/MIDI changes are preserved',()=>{
 const original=tracks();
 const changed=original.map(t=>t.id==='t1'?{...t,clips:[editClipLevel(editClipTiming(t.clips[0],'startBar',2),'gainPercent',60)]}:t);
 let h=record(createClipHistory('prj1'),original,changed);
 const external=changed.map(t=>t.id==='t1'?{...t,volume:15,midiNotes:[{id:'changed',pitch:72}]}:{...t,volume:99});
 const undone=applyClipHistory(h,'prj1',external,'undo');
 assert.deepEqual(undone.tracks[0].clips,original[0].clips);
 assert.equal(undone.tracks[0].volume,15);
 assert.deepEqual(undone.tracks[0].midiNotes,[{id:'changed',pitch:72}]);
 assert.equal(undone.tracks[1].volume,99);
 h=undone.history;
 const deleted=undone.tracks.map(t=>t.id==='t1'?{...t,clips:[]}:t);
 h=record(h,undone.tracks,deleted,'t1','제거');
 assert.equal(h.future.length,0);
 assert.equal(applyClipHistory(h,'prj1',deleted,'undo').tracks[0].clips.length,1);
});

test('multi-step undo/redo works across independent tracks',()=>{
 const start=tracks();
 const a=start.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:2}]}:t);
 const b=a.map(t=>t.id==='t2'?{...t,clips:[{...clip(),id:'drumclip'}]}:t);
 let h=record(createClipHistory('prj1'),start,a,'t1');
 h=record(h,a,b,'t2');
 const undoB=applyClipHistory(h,'prj1',b,'undo');
 const undoA=applyClipHistory(undoB.history,'prj1',undoB.tracks,'undo');
 assert.deepEqual(undoA.tracks,start);
 const redoA=applyClipHistory(undoA.history,'prj1',undoA.tracks,'redo');
 const redoB=applyClipHistory(redoA.history,'prj1',redoA.tracks,'redo');
 assert.deepEqual(redoB.tracks,b);
});

test('new edit after undo invalidates redo',()=>{
 const start=tracks(),a=start.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:3}]}:t);
 const h=record(createClipHistory('prj1'),start,a);
 const undone=applyClipHistory(h,'prj1',a,'undo');
 const different=start.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:4}]}:t);
 const next=record(undone.history,start,different);
 assert.equal(next.future.length,0);
 assert.throws(()=>applyClipHistory(next,'prj1',different,'redo'),/다시 실행/);
});

test('external clip edits conflict instead of silently overwriting user data',()=>{
 const start=tracks(),a=start.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:3}]}:t);
 const h=record(createClipHistory('prj1'),start,a);
 const external=a.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:6}]}:t);
 const before=structuredClone(external);
 assert.throws(()=>applyClipHistory(h,'prj1',external,'undo'),/안전하게 복원/);
 assert.deepEqual(external,before);
});

test('missing track is a safe error; project switching rejects history',()=>{
 const start=tracks(),a=start.map(t=>t.id==='t1'?{...t,clips:[]}:t);
 const h=record(createClipHistory('prj1'),start,a);
 assert.throws(()=>applyClipHistory(h,'prj1',a.slice(1),'undo'),/트랙/);
 assert.throws(()=>applyClipHistory(h,'prj2',a,'undo'),/다른 프로젝트/);
 assert.throws(()=>recordClipChange(h,'prj2',start,a,'t1'),/프로젝트/);
 assert.deepEqual(createClipHistory('prj2'),{projectId:'prj2',past:[],future:[]});
});

test('history cap is enforced and snapshots are independent copies',()=>{
 let h=createClipHistory('prj1'),before=tracks();
 for(let i=0;i<CLIP_HISTORY_LIMIT+6;i++){
  const next=before.map(t=>t.id==='t1'?{...t,clips:[{...clip(),startBar:i+2}]}:t);
  h=record(h,before,next);before=next;
 }
 assert.equal(h.past.length,CLIP_HISTORY_LIMIT);
 assert.equal(h.past[0].beforeClips[0].startBar,7);
 before[0].clips[0].startBar=500;
 assert.equal(h.past.at(-1).afterClips[0].startBar,47);
});

test('no-op edits are not recorded',()=>{
 const start=tracks(),h=createClipHistory('prj1');
 assert.equal(record(h,start,structuredClone(start)),h);
});

test('reject missing target track, changed layout, or changes to other track clips',()=>{
 const start=tracks();const changed=start.map(t=>t.id==='t1'?{...t,clips:[]}:t);
 const h=createClipHistory('prj1');
 assert.throws(()=>record(h,start,changed,'missing'),/트랙/);
 assert.throws(()=>record(h,start,changed.slice(0,1)),/트랙 구성/);
 assert.throws(()=>record(h,start,[...changed].reverse()),/트랙 구성/);
 const other=changed.map(t=>t.id==='t2'?{...t,clips:[clip()]}:t);
 assert.throws(()=>record(h,start,other),/다른 트랙/);
});

test('undo/redo reject unsupported directions and empty history',()=>{
 const h=createClipHistory('prj1');
 assert.throws(()=>applyClipHistory(h,'prj1',tracks(),'erase'),/지원하지 않는/);
 assert.throws(()=>applyClipHistory(h,'prj1',tracks(),'undo'),/실행 취소/);
 assert.throws(()=>applyClipHistory(h,'prj1',tracks(),'redo'),/다시 실행/);
});

test('history never calls asset or storage APIs',()=>{
 const source=readFileSync(new URL('../src/lib/clipHistory.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:putFile|deleteFile|forgetAudio|localStorage|indexedDB|fetch)\s*\(/);
});

test('editor wires undo, redo, clip edits, split, duplication, import and removal',()=>{
 const ui=readFileSync(new URL('../src/components/AudioWorkstation.jsx',import.meta.url),'utf8');
 for(const s of ["historyAction('undo')","historyAction('redo')","'클립 분할'","'클립 복제'","'오디오 가져오기'","'클립 제거'","'클립 속성 편집'"])
  assert.ok(ui.includes(s),`missing ${s}`);
 assert.match(ui,/if\(clipHistory\.current\.projectId!==p\.id\)clipHistory\.current=createClipHistory\(p\.id\)/);
 assert.match(ui,/if\(projectRef\.current\.id!==sourceProjectId\)throw/);
  assert.match(ui,/await putFilesAtomic\(assets\)/);
  assert.match(ui,/await deleteFilesAtomic\(assets\.map/);
});
