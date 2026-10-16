import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {newProject} from '../src/lib/schema.js';
import {generateOfflineDraft,applyComposition,COMPOSER_PARTS,buildMidiArrangement} from '../src/lib/composer.js';
import {midiEnd,validNotes} from '../src/lib/midiEngine.js';
import {createMidiFile,parseMidiFile} from '../src/lib/midiFile.js';

const opts={title:'내 노래',prompt:'나의 목소리로 부르는 애니메이션 록 발라드',genre:'Rock',key:'G Major',bars:24,mood:'웅장한',variation:1};

test('original plan section 5: editable Lead Melody, Harmony, Bass, Drums, Piano, Guitar, Strings and Synth tracks',()=>{
 const draft=generateOfflineDraft(opts);
 assert.deepEqual(draft.midiTracks.map(t=>t.role),COMPOSER_PARTS);
 assert.deepEqual(COMPOSER_PARTS,['chords','bass','drums','melody','harmony','piano','guitar','strings','synth']);
 assert.deepEqual(draft.midiTracks.map(t=>t.instrument),['guitar','bass','drums','synth','synth','piano','guitar','strings','synth']);
 for(const t of draft.midiTracks){
  assert.ok(t.midiNotes.length>0,t.role+' must have audible/editable notes');
  assert.equal(new Set(t.midiNotes.map(n=>n.id)).size,t.midiNotes.length,t.role+' note IDs must be unique');
  for(const n of t.midiNotes){
   assert.ok(Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127,t.role+' pitch');
   assert.ok(n.startBeat>=0&&n.startBeat<96,t.role+' beat');
   assert.ok(n.length>0&&n.length<=24*4,t.role+' length');
   assert.ok(n.velocity>=1&&n.velocity<=127,t.role+' velocity');
  }
 }
});
test('harmony notes follow melody timing and musical chord tones, not an unrelated melody',()=>{
 const draft=generateOfflineDraft(opts);
 const melody=draft.midiTracks.find(t=>t.role==='melody').midiNotes;
 const harmony=draft.midiTracks.find(t=>t.role==='harmony').midiNotes;
 assert.ok(harmony.length>10);
 for(const n of harmony){
  assert.ok(melody.some(m=>m.startBeat===n.startBeat&&n.pitch<=m.pitch-3),'harmony below a matching lead note');
 }
});
test('same seed produces identical nine-track arrangement, genre/section variations are local',()=>{
 const draft=generateOfflineDraft(opts),again=generateOfflineDraft(opts);
 assert.deepEqual(draft.midiTracks,again.midiTracks);
 const sections=draft.sections.map(s=>s.name==='Chorus'?{...s,genreMix:[{name:'Rock',weight:100}]}:s);
 const baseline=buildMidiArrangement({...draft,sections:draft.sections,projectMix:[{name:'Ballad',weight:100}]});
 const altered=buildMidiArrangement({...draft,sections,projectMix:[{name:'Ballad',weight:100}]});
 assert.equal(baseline.length,COMPOSER_PARTS.length);
 assert.equal(altered.length,COMPOSER_PARTS.length);
 assert.notDeepEqual(altered.find(t=>t.role==='piano').midiNotes,baseline.find(t=>t.role==='piano').midiNotes);
});
test('new project has nine generated MIDI tracks while original recording and scene are preserved',()=>{
 const p=newProject({title:'작업 중인 프로젝트'});
 p.tracks[0].clips=[{id:'own',assetId:'my-recorded-voice',durationSec:8,startBar:1}];
 const before=structuredClone(p),draft=generateOfflineDraft(opts);
 const updated=applyComposition(p,draft);
 const stems=updated.tracks.filter(t=>t.generatedBy==='composer-v04');
 assert.equal(stems.length,COMPOSER_PARTS.length);
 assert.deepEqual(p,before,'do not mutate original workspace');
 assert.deepEqual(updated.tracks[0].clips,before.tracks[0].clips);
 assert.deepEqual(updated.scenes,before.scenes);
 assert.ok(midiEnd(updated)>0);
 assert.equal(stems.every(t=>validNotes(t).length>0),true);
 // Every instrument layer can be independently changed without modifying peers.
 const changed={...updated,tracks:updated.tracks.map(t=>t===stems[5]?{...t,volume:25}:t)};
 assert.equal(changed.tracks.find(t=>t.id===stems[5].id).volume,25);
 assert.equal(updated.tracks.find(t=>t.id===stems[5].id).volume,stems[5].volume);
});
test('GM percussion remains on channel 10 and re-import restores all generated instruments',async()=>{
 const p=applyComposition(newProject(),generateOfflineDraft(opts));
 const b=createMidiFile(p);
 const raw=new Uint8Array(await b.arrayBuffer());
 assert.equal(Buffer.from(raw.subarray(0,4)).toString(),'MThd');
 assert.ok(raw.includes(0x99),'MIDI note-on must use channel ten for drums');
 const parsed=await parseMidiFile(new File([b],'myvocal.mid'));
 assert.equal(parsed.tracks.length,COMPOSER_PARTS.length);
 assert.ok(parsed.tracks.some(t=>t.instrument==='drums'&&t.notes.length>0));
 for(const role of ['piano','guitar','bass','strings','synth'])assert.ok(parsed.tracks.some(t=>t.instrument===role));
 assert.equal(parsed.bpm,p.bpm);
});
test('legacy four-track drafts remain four tracks when applied to user section genre overrides',()=>{
 const draft=generateOfflineDraft(opts);
 draft.midiTracks=draft.midiTracks.slice(0,4);
 const p=newProject();
 p.sections[1].genreMix=[{name:'Rock',weight:100}];
 const applied=applyComposition(p,draft);
 assert.equal(applied.tracks.filter(t=>t.generatedBy==='composer-v04').length,4);
});
