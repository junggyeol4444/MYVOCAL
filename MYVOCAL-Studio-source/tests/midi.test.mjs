import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {newProject} from '../src/lib/schema.js';
import {midiEnd,pitchName,chordPitches} from '../src/lib/midiEngine.js';
import {createMidiFile,parseMidiFile} from '../src/lib/midiFile.js';

test('project begins with editable MIDI-capable tracks',()=>{
 const p=newProject({title:'Unit test'});
 assert.ok(p.tracks.some(t=>t.instrument==='piano'));
 assert.equal(p.chords.length,4);
});
test('chord voicings and pitch names',()=>{
 assert.deepEqual(chordPitches('C',4),[60,64,67]);
 assert.deepEqual(chordPitches('Am',4),[69,72,76]);
 assert.deepEqual(chordPitches('Fmaj7',4),[65,69,72,76]);
 assert.equal(pitchName(60),'C4');
 assert.throws(()=>chordPitches('xyz',4),/지원하지/);
});
test('MIDI notes contribute to project duration, 2 seconds per 4/4 bar at 120 BPM',()=>{
 const p=newProject();p.tracks[3].midiNotes=[{pitch:60,startBeat:8,length:4,velocity:95}];
 assert.equal(midiEnd(p),6);
});
test('Standard MIDI File round trip keeps notes and tempo and track names',async()=>{
 const p=newProject({title:'My MIDI'});
 p.bpm=96;p.tracks[3].name='Main Piano';
 p.tracks[3].midiNotes=[{pitch:60,startBeat:0,length:1,velocity:100},{pitch:67,startBeat:1.5,length:2,velocity:90}];
 const blob=createMidiFile(p);const raw=new Uint8Array(await blob.arrayBuffer());
 assert.equal(Buffer.from(raw.subarray(0,4)).toString(),'MThd');
 assert.equal((raw[8]<<8)|raw[9],1);
 const parsed=await parseMidiFile(new File([blob],'demo.mid'));
 assert.equal(parsed.bpm,96);
 assert.equal(parsed.tracks.length,1);
 assert.equal(parsed.tracks[0].name,'Main Piano');
 assert.deepEqual(parsed.tracks[0].notes.map(({pitch,startBeat,length,velocity})=>({pitch,startBeat,length,velocity})),[
  {pitch:60,startBeat:0,length:1,velocity:100},{pitch:67,startBeat:1.5,length:2,velocity:90}
 ]);
});
test('empty or invalid MIDI file rejected',async()=>{
 await assert.rejects(parseMidiFile(new File([new Uint8Array([0,1,2,3])],'bad.mid')),/표준 MIDI/);
});
