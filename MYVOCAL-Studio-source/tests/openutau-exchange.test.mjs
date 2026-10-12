import test from 'node:test';
import assert from 'node:assert/strict';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {makeOpenUtauUstx,prepareUstxNotes,ustxOutputName} from '../src/lib/openUtauExchange.js';
const proj=()=>({id:'project-1',title:'우리의 노래',bpm:120,lyrics:'안녕',tracks:[{id:'v1',name:'Lead Vocal',instrument:'synth',type:'vocal',midiNotes:[
 {id:'n1',pitch:60,startBeat:0,length:1,velocity:100},{id:'n2',pitch:62,startBeat:1,length:0.5,velocity:100}
]}]});
test('OpenUtau valid USTX structure and note placement',()=>{const p=proj(),a=alignLyricNotes(p),x=makeOpenUtauUstx(p,a);assert.equal(x.noteCount,2);assert.equal(x.missingLyrics,0);assert.match(x.text,/ustx_version: "0.6"/);assert.match(x.text,/resolution: 480/);assert.match(x.text,/position: 480/);assert.match(x.text,/duration: 240/);assert.match(x.text,/lyric: "안"/);assert.match(x.text,/lyric: "녕"/);});
test('custom singer name, renderer and phonemizer are escaped',()=>{const p=proj(),x=makeOpenUtauUstx(p,alignLyricNotes(p),{singer:'a: "b"',phonemizer:'OpenUtau.Core.CustomPhonemizer',renderer:'DIFFSINGER'});assert.match(x.text,/singer: "a: \\"b\\""/);assert.match(x.text,/renderer: DIFFSINGER/);});
test('source changes invalidate export',()=>{const p=proj(),a=alignLyricNotes(p);p.bpm=118;assert.throws(()=>makeOpenUtauUstx(p,a),/오래됐습니다/);});
test('MIDI overlap is caught and not silently dropped',()=>{const p=proj();p.tracks[0].midiNotes[1].startBeat=.5;const a=alignLyricNotes(p);assert.throws(()=>prepareUstxNotes(p,a),/겹쳐/);});
test('missing lyrics are explicitly counted',()=>{const p=proj();p.lyrics='안';const a=alignLyricNotes(p),x=makeOpenUtauUstx(p,a);assert.equal(x.missingLyrics,1);assert.match(x.text,/lyric: "a"/);});
test('unsafe control chars and unsupported renderer rejected',()=>{const p=proj(),a=alignLyricNotes(p);assert.throws(()=>makeOpenUtauUstx(p,a,{singer:'bad\ntracks:'}),/입력/);assert.throws(()=>makeOpenUtauUstx(p,a,{renderer:'NEURAL-MAGIC'}),/지원하지 않는/);});
test('title is sanitized for filename',()=>{assert.equal(ustxOutputName('내 노래 /: test'),'MYVOCAL-내_노래____test.ustx');});
test('does not embed any external binary or voice profile',()=>{const p=proj(),x=makeOpenUtauUstx(p,alignLyricNotes(p));assert.doesNotMatch(x.text,/checkpoint|voiceModelBinary|rawAudio/);});
