import test from 'node:test';
import assert from 'node:assert/strict';
import {makeImportedVocalTrack} from '../src/lib/lyricAlignment.js';
const secondsPerBar=bpm=>240/bpm;
import {renderOfflineVocalGuideSelection} from '../src/lib/offlineVocalGuide.js';

const makeProject=(bpm=120)=>({id:'song-1',bpm,tracks:[{id:'old',name:'Original',clips:[{assetId:'old-wav',startBar:1,durationSec:3}]}]});
const file={name:'preview.wav',size:4096};
const clip=(project,start,seconds=0.8)=>makeImportedVocalTrack(project,file,'new-wav',seconds,start).clips[0];

test('selected guide audio is placed at the original second using fractional bars',()=>{
 const p=makeProject(120), c=clip(p,1.25);
 assert.equal(c.startBar,1.625);
 assert.equal((c.startBar-1)*secondsPerBar(p.bpm),1.25);
 assert.equal(c.durationSec,.8);
});
test('second position is invariant across valid project BPMs',()=>{
 for(const bpm of [40,72,90,120,150,240]){
  const p=makeProject(bpm);
  for(const seconds of [0,0.08,.3,1.7,5.125,30.75]){
   const c=clip(p,seconds);
   assert.ok(Math.abs((c.startBar-1)*secondsPerBar(bpm)-seconds)<1e-10,`${bpm} bpm at ${seconds}s`);
  }
 }
});
test('legacy full WAV import still starts at bar one',()=>{
 const p=makeProject();const newTrack=makeImportedVocalTrack(p,file,'new-wav',2);
 assert.equal(newTrack.clips[0].startBar,1);
 assert.equal(newTrack.type,'vocal');
 assert.equal(newTrack.clips[0].assetId,'new-wav');
});
test('creating selection track does not mutate existing tracks or project data',()=>{
 const p=makeProject();const before=structuredClone(p);
 const inserted=makeImportedVocalTrack(p,file,'new-wav',1,1.5);
 assert.deepEqual(p,before);
 assert.notEqual(inserted.id,p.tracks[0].id);
 assert.equal(inserted.clips[0].startBar,1.75);
 assert.deepEqual([...p.tracks,inserted][0],before.tracks[0]);
});
test('real guide selection start is the offset used for music-timeline placement',()=>{
 const a={cues:[{lyric:'아',pitch:60,startSec:.2,endSec:.5,velocity:100},
    {lyric:'사',pitch:64,startSec:1.125,endSec:1.8,velocity:110}]};
 const result=renderOfflineVocalGuideSelection(a,null,2,2);
 const p=makeProject(150);const c=clip(p,result.selection.startSec,result.seconds);
 assert.ok(Math.abs((c.startBar-1)*secondsPerBar(p.bpm)-1.125)<1e-10);
 assert.ok(Math.abs(c.durationSec-result.seconds)<1e-8);
});
test('fractional clip offset plus its duration matches original end time',()=>{
 const p=makeProject();p.tracks=[];
 const track=makeImportedVocalTrack(p,file,'new-wav',.75,2.25);
 const c=track.clips[0];
 assert.ok(Math.abs((c.startBar-1)*secondsPerBar(p.bpm)+c.durationSec-3)<1e-10);
});
test('invalid start positions are rejected before adding any clip',()=>{
 const p=makeProject();
 for(const start of [-.01,NaN,Infinity,-Infinity,481,'2',null])
  assert.throws(()=>makeImportedVocalTrack(p,file,'new-wav',1,start),/위치|길이/);
 assert.throws(()=>makeImportedVocalTrack(p,file,'new-wav',1,480),/위치|길이/);
 assert.throws(()=>makeImportedVocalTrack(p,file,'new-wav',.6,479.6),/위치|길이/);
});
test('invalid project tempos and durations are rejected',()=>{
 for(const bpm of [0,39,241,NaN,Infinity])
  assert.throws(()=>clip(makeProject(bpm),1),/BPM/);
 for(const seconds of [-1,0,NaN,Infinity,481])
  assert.throws(()=>makeImportedVocalTrack(makeProject(),file,'x',seconds,1),/오디오/);
});
test('an explicitly saved selection preserves original complete MIDI timeline',()=>{
 const p=makeProject(120),before=JSON.stringify(p);
 const oldClip=p.tracks[0].clips[0];
 const added=makeImportedVocalTrack(p,file,'selection',.7,2.1);
 const newProject={...p,tracks:[...p.tracks,added]};
 assert.equal(JSON.stringify(p),before);
 assert.equal(newProject.tracks[0].clips[0],oldClip);
 assert.ok(Math.abs((added.clips[0].startBar-1)*2-2.1)<1e-10);
});
