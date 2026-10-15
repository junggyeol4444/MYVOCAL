import test from 'node:test';
import assert from 'node:assert/strict';
import {composeStyleSketch} from '../src/lib/styleComposition.js';
import {arrangeStyleSketch,exportArrangementMidi} from '../src/lib/styleArrangement.js';
const profile={schemaVersion:1,type:'my-music-style',trainingPerformed:false,id:'my-style',sources:[{musicId:'mine',sha256:'a'.repeat(64)}],descriptors:{meanPeak:.72,meanRms:.24,activeFraction:.7}};
const sketch=composeStyleSketch({profile,seed:11,bars:4,bpm:107,rootMidi:60,scale:'minor'});
const arrange=(options={})=>arrangeStyleSketch({sketch,profile,...options});
function chunks(midi) {
 const b=Buffer.from(midi); let i=14; const tracks=[];
 while(i<b.length){assert.equal(b.toString('ascii',i,i+4),'MTrk');const len=b.readUInt32BE(i+4);tracks.push(b.subarray(i+8,i+8+len));i+=8+len;}
 assert.equal(i,b.length);return tracks;
}
test('default arrangement preserves melody exactly',()=>assert.deepEqual(arrange().tracks[0].notes,sketch.notes));
test('provides four separately editable parts in standard order',()=>assert.deepEqual(arrange().tracks.map(x=>x.part),['melody','bass','chords','drums']));
test('deterministic with identical source and options',()=>assert.deepEqual(arrange(),arrange()));
test('no model inference and preset origin explicitly declared',()=>{const a=arrange();assert.equal(a.patternSource,'preset-only');assert.equal(a.modelInferencePerformed,false);assert.equal(a.styleTrainingPerformed,false)});
test('bass and chord notes within MIDI pitch range',()=>{for(const t of arrange().tracks)for(const n of t.notes)assert.ok(n.midiNote>=0&&n.midiNote<=127)});
test('unwanted accompaniment can be omitted',()=>assert.deepEqual(arrange({parts:['chords','melody']}).tracks.map(t=>t.part),['melody','chords']));
test('simple and full arrangements use different densities',()=>assert.ok(arrange({complexity:'full'}).tracks[3].notes.length>arrange({complexity:'simple'}).tracks[3].notes.length));
test('GM drums route to channel 10 (zero-based nine)',()=>assert.equal(arrange().tracks[3].channel,9));
test('all accompaniment begins on quantized musical steps',()=>{for(const t of arrange().tracks.slice(1))for(const n of t.notes)assert.equal(n.startTick%240,0)});
test('rejects fake profile provenance',()=>assert.throws(()=>arrange({profile:{...profile,id:'not-the-source'}})));
test('rejects training performed profile',()=>assert.throws(()=>arrange({profile:{...profile,trainingPerformed:true}})));
test('rejects reference-only or empty evidence',()=>assert.throws(()=>arrange({profile:{...profile,sources:[]}})));
test('rejects duplicate and unknown parts',()=>{assert.throws(()=>arrange({parts:['melody','melody']}));assert.throws(()=>arrange({parts:['none']}))});
test('rejects mutated source sketch',()=>{assert.throws(()=>arrange({sketch:{...sketch,notes:[{startTick:-1,durationTicks:1,midiNote:60,velocity:100}]}}))});
test('rejects invalid descriptor values',()=>assert.throws(()=>arrange({profile:{...profile,descriptors:{...profile.descriptors,meanRms:NaN}}})));
test('format 1 MIDI header and track count matches parts+conductor',()=>{const midi=Buffer.from(exportArrangementMidi(arrange()));assert.equal(midi.toString('ascii',0,4),'MThd');assert.equal(midi.readUInt16BE(8),1);assert.equal(midi.readUInt16BE(10),5);assert.equal(chunks(midi).length,5)});
test('MIDI conductor contains tempo and time signature',()=>{const c=chunks(exportArrangementMidi(arrange()))[0];assert.ok(c.includes(Buffer.from([255,81,3])));assert.ok(c.includes(Buffer.from([255,88,4,4,2,24,8])))});
test('every MIDI track ends with MIDI end-of-track',()=>{for(const c of chunks(exportArrangementMidi(arrange())))assert.deepEqual(Array.from(c.subarray(-4)),[0,255,47,0])});
test('percussion stream contains channel 10 note-on status',()=>assert.ok(chunks(exportArrangementMidi(arrange()))[4].includes(0x99)));
test('single-track selection produces conductor plus one track',()=>{const a=arrange({parts:['melody']});assert.equal(chunks(exportArrangementMidi(a)).length,2)});
test('rejects malformed exported note and channel',()=>{const a=arrange();assert.throws(()=>exportArrangementMidi({...a,tracks:[{...a.tracks[0],channel:8}]}));assert.throws(()=>exportArrangementMidi({...a,tracks:[{...a.tracks[0],notes:[{startTick:0,durationTicks:0,midiNote:60,velocity:80}]}]}))});
test('supports 64-bar bounds without truncated track chunks',()=>{const long=composeStyleSketch({profile,bars:64,seed:29});const a=arrange({sketch:long,complexity:'full'});assert.equal(chunks(exportArrangementMidi(a)).length,5)});
test('source notes are detached so mutation cannot rewrite sketch',()=>{const a=arrange();assert.notEqual(a.tracks[0].notes[0],sketch.notes[0]);assert.ok(Object.isFrozen(a.tracks[0].notes[0]))});
