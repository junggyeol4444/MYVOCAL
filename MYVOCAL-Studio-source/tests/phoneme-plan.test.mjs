import test from 'node:test';
import assert from 'node:assert/strict';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {syllableHint,buildPhonemePlan,validatePhonemePlan,isPhonemePlanStale,planAsCsv,planAsJson} from '../src/lib/phonemePlan.js';
import {buildSingingRequest} from '../src/lib/singingBridge.js';
function fixture(lyrics='안녕'){let p={id:'p1',title:'친구',bpm:120,lyrics,tracks:[{id:'v',type:'vocal',name:'내 목소리',instrument:'synth',midiNotes:[{pitch:69,startBeat:0,length:1},{pitch:71,startBeat:1,length:1}]}]};return {p,a:alignLyricNotes(p)}}
test('Hangul jamo hints have onset, vowel, final consonant',()=>{
 assert.deepEqual(syllableHint('안'),{onset:'ㅇ',nucleus:'ㅏ',coda:'ㄴ'});
 assert.deepEqual(syllableHint('꽃'),{onset:'ㄲ',nucleus:'ㅗ',coda:'ㅊ'});
 assert.deepEqual(syllableHint('a'),null);
});
test('first syllable silent ㅇ onset omitted, nucleus/coda retained',()=>{const {a}=fixture(),r=buildPhonemePlan(a);assert.deepEqual(r.segments.filter(s=>s.cueIndex===1).map(s=>s.token),['ㅏ','ㄴ']);});
test('second syllable ㄴㅕㅇ maps to 3 nonoverlapping segments',()=>{const {a}=fixture(),r=buildPhonemePlan(a);const q=r.segments.filter(s=>s.cueIndex===2);assert.deepEqual(q.map(s=>s.token),['ㄴ','ㅕ','ㅇ']);assert.ok(q[0].endSec<=q[1].startSec);assert.equal(q.at(-1).endSec,1);});
test('manual changes to valid phoneme labels survive roundtrip',()=>{const {a}=fixture();const r=buildPhonemePlan(a);r.segments[0].token='a';assert.equal(validatePhonemePlan(r,a),true);assert.equal(JSON.parse(planAsJson(r,a)).segments[0].token,'a');assert.match(planAsCsv(r,a),/"a"/);});
test('stale after MIDI, lyrics or alignment changes',()=>{const {p,a}=fixture();const r=buildPhonemePlan(a);assert.equal(isPhonemePlanStale(a,r),false);a.cues[0].lyric='아';assert.equal(isPhonemePlanStale(a,r),true);assert.throws(()=>validatePhonemePlan(r,a),/다시 생성/);});
test('reject out-of-note times and overlapping phonemes',()=>{const {a}=fixture();const r=buildPhonemePlan(a);r.segments[0].startSec=-1;assert.throws(()=>validatePhonemePlan(r,a),/잘못/);r.segments[0].startSec=0;r.segments[1].startSec=0;assert.throws(()=>validatePhonemePlan(r,a),/겹치거나/);});
test('reject empty phoneme token',()=>{const {a}=fixture();const r=buildPhonemePlan(a);r.segments[0].token='';assert.throws(()=>validatePhonemePlan(r,a),/잘못/);});
test('Latin text not forced to Korean phonemes',()=>{const {a}=fixture('Hi 안');const r=buildPhonemePlan(a);assert.ok(r.segments.some(s=>s.kind==='text'));assert.ok(r.warnings.length>0);});
test('unfilled — lyrics skipped and error if no lyrics at all',()=>{const {a}=fixture('안');const r=buildPhonemePlan(a);assert.ok(r.segments.every(s=>s.cueIndex===1));const empty=fixture('').a;assert.throws(()=>buildPhonemePlan(empty),/가사가 없습니다/);});
test('phoneme hints are optional in v1-compatible request',()=>{const {p,a}=fixture(),voice={id:'mine',rights:'self',name:'나'};const old=buildSingingRequest(7867,p,a,voice,null);assert.equal('phonemes' in old,false);const r=buildPhonemePlan(a);const req=buildSingingRequest(7867,p,a,voice,null,r);assert.equal(req.version,1);assert.equal(req.phonemes.length,r.segments.length);assert.equal(req.phonemes[0].token,'ㅏ');});
test('invalid/stale phoneme plan cannot reach external inference request',()=>{const {p,a}=fixture(),voice={id:'me',rights:'self'};const r=buildPhonemePlan(a);r.segments[0].startSec=10;assert.throws(()=>buildSingingRequest(7867,p,a,voice,null,r),/잘못|범위 밖/);});
test('multiple syllables on one note split evenly',()=>{const {a}=fixture();a.cues[0].lyric='안녕';const r=buildPhonemePlan(a);const q=r.segments.filter(s=>s.cueIndex===1);assert.ok(q.some(s=>s.syllable==='안'));assert.ok(q.some(s=>s.syllable==='녕'));assert.equal(q.at(-1).endSec,a.cues[0].endSec);});
test('portable project import retains phoneme plan after id remapping',async()=>{
 const {p,a}=fixture();p.sections=[{id:'sec1',name:'Verse',bars:8}];p.vocalAlignment=a;p.phonemePlan=buildPhonemePlan(a);
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');
 const input=new File([JSON.stringify({format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:p,profiles:{voices:[],characters:[]},assets:{}})],'myvocal.json',{type:'application/json'});
 const {project}=await importProjectBundle(input);
 assert.notEqual(project.id,p.id);assert.notEqual(project.tracks[0].id,p.tracks[0].id);
 assert.equal(isPhonemePlanStale(project.vocalAlignment,project.phonemePlan),false);
 assert.equal(validatePhonemePlan(project.phonemePlan,project.vocalAlignment),true);
});
