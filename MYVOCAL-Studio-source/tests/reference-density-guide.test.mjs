import test from 'node:test';
import assert from 'node:assert/strict';
import {composeStyleSketch} from '../src/lib/styleComposition.js';
import {arrangeStyleSketch,exportArrangementMidi} from '../src/lib/styleArrangement.js';
import {createReferenceReport,referenceRights} from '../src/lib/referenceMusicAnalysis.js';
import {applyReferenceEnergyGuide} from '../src/lib/referenceArrangementGuide.js';
import {applyReferenceDensityGuide} from '../src/lib/referenceDensityGuide.js';

const profile={schemaVersion:1,type:'my-music-style',trainingPerformed:false,id:'owned-style',sources:[{musicId:'my-song',sha256:'e'.repeat(64)}],descriptors:{meanPeak:.8,meanRms:.3,activeFraction:.75}};
const sketch=composeStyleSketch({profile,seed:12,bars:8,bpm:110,rootMidi:60,scale:'minor'});
const base=arrangeStyleSketch({sketch,profile,complexity:'full'});
const analysis={analysisType:'signal-energy-only',durationSeconds:8,peak:1,rms:.5,
  windows:Array.from({length:32},(_,i)=>({startSeconds:i/4,endSeconds:(i+1)/4,rms:i<16?.03:.85})),activeRegions:[{startSeconds:0,endSeconds:8}]};
const report=createReferenceReport({label:'Reference only music',rights:referenceRights('reference'),analysis});
const guide=(opts={})=>applyReferenceDensityGuide({arrangement:base,referenceReport:report,...opts});
const notes=(arr,part)=>arr.tracks.find(t=>t.part===part)?.notes||[];

// Core behavior and privacy protections.
test('thins at least some secondary accompaniment when energy is low',()=>{const r=guide({strength:100});assert.ok(r.referenceDensityGuidance.removedNotes.drums>0);assert.ok(notes(r,'drums').length<notes(base,'drums').length);});
test('strong energy half retains drum events',()=>{const r=guide({strength:100});const last=t=>notes(t,'drums').filter(n=>n.startTick>=4*1920);assert.deepEqual(last(r),last(base));});
test('never changes melody notes even at strength 100',()=>assert.deepEqual(notes(guide({strength:100}),'melody'),notes(base,'melody')));
test('preserves snare and kick anchors',()=>{const r=guide({strength:100});for(const n of notes(base,'drums').filter(n=>n.midiNote===36||n.midiNote===38))assert.ok(notes(r,'drums').some(x=>JSON.stringify(x)===JSON.stringify(n)));});
test('preserves bass on bar opening',()=>{const r=guide({strength:100});for(const n of notes(base,'bass').filter(n=>n.startTick%1920===0))assert.ok(notes(r,'bass').some(x=>x.startTick===n.startTick&&x.midiNote===n.midiNote));});
test('preserves bar-opening chords',()=>{const r=guide({strength:100});assert.deepEqual(notes(r,'chords').filter(n=>n.startTick%1920===0),notes(base,'chords').filter(n=>n.startTick%1920===0));});
test('retained notes preserve pitch, timing, duration, velocity',()=>{const r=guide({strength:100});for(const t of r.tracks)for(const n of t.notes)assert.ok(notes(base,t.part).some(v=>JSON.stringify(v)===JSON.stringify(n)));});
test('preserves track part and channel order',()=>{const r=guide();assert.deepEqual(r.tracks.map(t=>[t.part,t.channel,t.program]),base.tracks.map(t=>[t.part,t.channel,t.program]));});
test('zero strength changes no notes',()=>assert.deepEqual(guide({strength:0}).tracks.map(t=>t.notes),base.tracks.map(t=>t.notes)));
test('flat report changes no notes',()=>{const flat={...report,descriptors:{...report.descriptors,energyCurve:Array(32).fill(.4)}};assert.deepEqual(guide({referenceReport:flat,strength:100}).tracks.map(t=>t.notes),base.tracks.map(t=>t.notes));});
test('silent report changes no notes',()=>{const silent={...report,descriptors:{...report.descriptors,energyCurve:Array(32).fill(0)}};assert.deepEqual(guide({referenceReport:silent,strength:100}).tracks.map(t=>t.notes),base.tracks.map(t=>t.notes));});
test('no parts selection changes no notes',()=>assert.deepEqual(guide({parts:[],strength:100}).tracks.map(t=>t.notes),base.tracks.map(t=>t.notes)));
test('drum-only selection never affects bass/chords',()=>{const r=guide({parts:['drums'],strength:100});for(const part of ['bass','chords','melody'])assert.deepEqual(notes(r,part),notes(base,part));});
test('bass-only selection never affects other parts',()=>{const r=guide({parts:['bass'],strength:100});for(const part of ['drums','chords','melody'])assert.deepEqual(notes(r,part),notes(base,part));});
test('identical inputs yield identical results',()=>assert.deepEqual(guide({strength:80}),guide({strength:80})));
test('original arrangement stays unmodified',()=>{const snapshot=JSON.stringify(base);guide();assert.equal(JSON.stringify(base),snapshot);});
test('returned output is immutable throughout',()=>{const r=guide();assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.tracks));assert.ok(Object.isFrozen(r.tracks[0]));assert.ok(Object.isFrozen(r.tracks[0].notes));assert.ok(Object.isFrozen(r.tracks[0].notes[0]));assert.ok(Object.isFrozen(r.referenceDensityGuidance));assert.ok(Object.isFrozen(r.referenceDensityGuidance.removedNotes));});
test('metadata expressly disallows training and source audio',()=>{const m=guide().referenceDensityGuidance;assert.equal(m.referenceTrainingAllowed,false);assert.equal(m.sourceAudioIncluded,false);assert.equal(m.melodyPreserved,true);assert.equal(m.coreBeatsPreserved,true);assert.equal('energyCurve' in m,false);});
test('composes with step58 velocity and preserves it for retained notes',()=>{const v=applyReferenceEnergyGuide({arrangement:base,referenceReport:report});const r=guide({arrangement:v,strength:100});assert.deepEqual(r.referenceGuidance,v.referenceGuidance);for(const t of r.tracks)for(const n of t.notes)assert.ok(notes(v,t.part).some(x=>JSON.stringify(x)===JSON.stringify(n)));});
test('both guided and unguided results export to MIDI format 1',()=>{for(const r of [guide({strength:100}),guide({strength:0})]){const midi=Buffer.from(exportArrangementMidi(r));assert.equal(midi.toString('ascii',0,4),'MThd');assert.equal(midi.readUInt16BE(8),1);assert.equal(midi.readUInt16BE(10),5);}});
test('works with one part and no melody',()=>{const a=arrangeStyleSketch({sketch,profile,parts:['drums'],complexity:'full'});const r=guide({arrangement:a,strength:100});assert.equal(r.tracks.length,1);assert.ok(exportArrangementMidi(r).length>40);});
test('rejects training enabled or previously trained reference report',()=>{for(const patch of [{trainingAllowed:true},{trainingPerformed:true},{rightsCategory:'owned'},{audioIncluded:true}])assert.throws(()=>guide({referenceReport:{...report,...patch}}));});
test('rejects invalid reference energy descriptors',()=>{for(const energyCurve of [Array(31).fill(1),[NaN,...Array(31).fill(1)],[-1,...Array(31).fill(1)]])assert.throws(()=>guide({referenceReport:{...report,descriptors:{...report.descriptors,energyCurve}}}));});
test('rejects strengths outside integer 0..100',()=>{for(const strength of [-1,101,12.5,'100',NaN,Infinity])assert.throws(()=>guide({strength}));});
test('rejects malformed optional parts',()=>{for(const parts of [['melody'],['drums','drums'],['drums','melody'],['bass','chords','drums','drums'],'drums',[1]])assert.throws(()=>guide({parts}));});
test('rejects corrupt arrangement',()=>{for(const arrangement of [undefined,{}, {...base,modelInferencePerformed:true},{...base,bars:0},{...base,tracks:[base.tracks[0],base.tracks[0]]}])assert.throws(()=>guide({arrangement}));});
test('rejects unsafe notes and oversized arrays',()=>{const t=base.tracks[0];for(const bad of [{...t.notes[0],startTick:-1},{...t.notes[0],durationTicks:0},{...t.notes[0],midiNote:128},{...t.notes[0],velocity:200}])assert.throws(()=>guide({arrangement:{...base,tracks:[{...t,notes:[bad]}]}}));assert.throws(()=>guide({arrangement:{...base,tracks:[{...t,notes:Array(8193).fill(t.notes[0])}]}}));});
test('reference energy only decreases note count, never adds notes',()=>{const r=guide({strength:100});for(const t of r.tracks)assert.ok(t.notes.length<=notes(base,t.part).length);});
