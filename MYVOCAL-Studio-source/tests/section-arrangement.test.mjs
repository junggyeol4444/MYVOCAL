import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {generateOfflineDraft,buildMidiArrangement,applyComposition,sectionMidiStyleMap,COMPOSER_PARTS} from '../src/lib/composer.js';
import {singleSectionGenre,setSectionGenreMix} from '../src/lib/sectionGenre.js';

const ballad=[{name:'Ballad',weight:100}];
const override=[{name:'Rock',weight:100}];
const opts={title:'구간 음악',genreMix:ballad,genre:'Ballad',bars:24,variation:4,key:'C Major',mood:'차분한'};
const inBar=(track,bar)=>track.midiNotes.filter(n=>Math.floor(n.startBeat/4)===bar);
const cloneNotes=(track)=>track.midiNotes.map(n=>({pitch:n.pitch,startBeat:n.startBeat,length:n.length,velocity:n.velocity}));

test('legacy composer tracks remain byte-for-byte note-equivalent without section overrides',()=>{
 const d=generateOfflineDraft(opts);
 const plain=buildMidiArrangement({chords:d.chords,bars:d.bars,key:d.key,genre:d.genre,mood:d.mood,seed:d.seed});
 const inherited=buildMidiArrangement({chords:d.chords,bars:d.bars,key:d.key,genre:d.genre,mood:d.mood,seed:d.seed,
  sections:d.sections,projectMix:ballad});
 assert.deepEqual(inherited,plain);
});

test('explicit Rock chorus makes local drums and bass denser than inherited Ballad',()=>{
 const d=generateOfflineDraft(opts);
 const sections=d.sections.map(s=>s.name==='Chorus'?{...s,genreMix:override}:s);
 const baseline=buildMidiArrangement({...d,sections:d.sections,projectMix:ballad});
 const styled=buildMidiArrangement({...d,sections,projectMix:ballad});
 const drums=styled.find(t=>t.role==='drums'),bass=styled.find(t=>t.role==='bass');
 const baseDrums=baseline.find(t=>t.role==='drums'),baseBass=baseline.find(t=>t.role==='bass');
 assert.equal(inBar(drums,0).length,inBar(baseDrums,0).length);
 assert.ok(inBar(drums,9).length>inBar(baseDrums,9).length);
 assert.ok(inBar(bass,9).length>inBar(baseBass,9).length);
 assert.ok(inBar(drums,9).every(n=>n.velocity>=1&&n.velocity<=127));
});

test('per-section style map uses weighted majority; inheritance creates no override',()=>{
 const sections=[{name:'Intro',bars:2},{name:'Chorus',bars:4,genreMix:[{name:'Rock',weight:45},{name:'Ballad',weight:55}]},{name:'Outro',bars:2,genreMix:ballad}];
 const styles=sectionMidiStyleMap(sections,8,ballad,'Ballad');
 assert.equal(styles[0],null);
 assert.equal(styles[1],null);
 assert.equal(styles[2].hatStep,.5);
 assert.equal(styles[2].bassStep,1);
 assert.equal(styles[6].hatStep,1);
 assert.equal(styles[6].bassStep,2);
});

test('composer applied to existing project uses retained section overrides for actual MIDI',()=>{
 const project=newProject({title:'User',genreMix:ballad,voiceId:'voice',characterId:'character',withVideo:true});
 const chorus=project.sections.find(x=>x.name==='Chorus');
 project.sections=setSectionGenreMix(project.sections,chorus.id,override);
 project.tracks[0].clips=[{id:'untouched',assetId:'personal-audio',startBar:1}];
 const before=structuredClone(project);
 const d=generateOfflineDraft(opts);
 const applied=applyComposition(project,d);
 const midi=applied.tracks.filter(t=>t.generatedBy==='composer-v04');
 assert.equal(midi.length,COMPOSER_PARTS.length);
 assert.ok(inBar(midi.find(t=>t.instrument==='drums'),9).length>inBar(d.midiTracks.find(t=>t.role==='drums'),9).length);
 assert.deepEqual(applied.tracks[0].clips,before.tracks[0].clips);
 assert.equal(applied.voiceId,'voice');
 assert.equal(applied.characterId,'character');
 assert.deepEqual(project,before);
 assert.deepEqual(applied.sections.find(s=>s.name==='Chorus').genreMix,override);
});

test('composition still preserves existing tracks if MIDI option disabled',()=>{
 const project=newProject({genreMix:ballad});
 project.sections=setSectionGenreMix(project.sections,project.sections.find(s=>s.name==='Chorus').id,override);
 const original=structuredClone(project.tracks);
 const applied=applyComposition(project,generateOfflineDraft(opts),{midi:false});
 assert.deepEqual(applied.tracks,original);
 assert.deepEqual(applied.sections.find(s=>s.name==='Chorus').genreMix,override);
});

test('inherit mode has exactly original output after composition',()=>{
 const project=newProject({genreMix:ballad});
 const d=generateOfflineDraft(opts);
 const result=applyComposition(project,d);
 const imported=result.tracks.filter(t=>t.generatedBy==='composer-v04');
 assert.deepEqual(imported.map(cloneNotes),d.midiTracks.map(cloneNotes));
});

test('same seed and sections create deterministic procedural notes',()=>{
 const d=generateOfflineDraft(opts);
 const sections=d.sections.map(x=>x.name==='Final Chorus'?{...x,genreMix:override}:x);
 const a=buildMidiArrangement({...d,sections,projectMix:ballad});
 const b=buildMidiArrangement({...d,sections,projectMix:ballad});
 assert.deepEqual(a,b);
 assert.notDeepEqual(a.find(x=>x.role==='drums').midiNotes,d.midiTracks.find(x=>x.role==='drums').midiNotes);
});

test('invalid section mix or invalid bar width rejects before adding any MIDI',()=>{
 const d=generateOfflineDraft(opts);
 const mk=sections=>()=>buildMidiArrangement({...d,sections,projectMix:ballad});
 assert.throws(mk([{id:'a',bars:1,genreMix:[{name:'Rock',weight:80}]}]),/합|비율/);
 assert.throws(mk([{id:'a',bars:0,genreMix:override}]),/마디/);
 assert.throws(mk([{id:'a',bars:NaN,genreMix:override}]),/마디/);
 assert.throws(mk({genreMix:override}),/구간/);
});

test('remote/manual draft MIDI is not re-rendered or overwritten by section style',()=>{
 const project=newProject({genreMix:ballad});
 project.sections=setSectionGenreMix(project.sections,project.sections.find(s=>s.name==='Chorus').id,override);
 const draft=generateOfflineDraft(opts);
 draft.midiTracks=[{role:'custom',name:'User import',instrument:'piano',volume:80,midiNotes:[{id:'untouched',pitch:69,startBeat:12,length:1,velocity:88}]}];
 const applied=applyComposition(project,draft);
 assert.deepEqual(applied.tracks.at(-1).midiNotes,draft.midiTracks[0].midiNotes);
});
