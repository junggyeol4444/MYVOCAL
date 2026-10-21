import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSingingNotes} from '../src/lib/localVocalSampler.js';
import {alignLyricNotes,validateAlignment} from '../src/lib/lyricAlignment.js';
import {buildPhonemePlan,validatePhonemePlan} from '../src/lib/phonemePlan.js';
import {planLongSingingChunks} from '../src/lib/longSingingRender.js';

const song=(bpm=120)=>{
 const notes=Array.from({length:720},(_,i)=>({
  pitch:60,velocity:91,startBeat:i*bpm/120,length:bpm/120*.75
 }));
 return {id:'six-minute-original',title:'긴 한국어 곡',bpm,lyrics:'가'.repeat(720),
  tracks:[{id:'lead',name:'내 AI 보컬',type:'vocal',instrument:'synth',midiNotes:notes}]};
};
test('360초 노래는 128개에서 음표를 잘라내지 않고 720개 원본 MIDI를 유지',()=>{
 const project=song(),original=JSON.stringify(project);
 assert.equal(normalizeSingingNotes(project.tracks[0].midiNotes).length,128);
 assert.equal(normalizeSingingNotes(project.tracks[0].midiNotes,{longForm:true}).length,720);
 const a=alignLyricNotes(project,'lead',{longForm:true});
 assert.equal(a.cues.length,720);assert.ok(a.cues[719].startSec>350);
 assert.equal(validateAlignment(a),true);
 assert.equal(JSON.stringify(project),original);
});
test('장편 한국어 가창 720개 음표는 실제 엔진 80초/128음표 단위로 분할',()=>{
 const a=alignLyricNotes(song(),'lead',{longForm:true});
 const plan=planLongSingingChunks(a);
 assert.equal(plan.notes,720);assert.ok(plan.chunks.length>=6);
 assert.ok(plan.chunks.every(chunk=>chunk.cues.length<=128));
 assert.ok(plan.chunks.at(-1).startSec>300);
});
test('고속 240 BPM의 353마디 이후 음표도 360초 가창에서 유지',()=>{
 const a=alignLyricNotes(song(240),'lead',{longForm:true});
 assert.equal(a.cues.length,720);
 assert.ok(a.cues[719].startBeat>1400);
 const p=planLongSingingChunks(a);
 assert.equal(p.notes,720);
});
test('720개 음표와 한국어 음소 1440개 이상을 연동하고 원본 변경 없음',()=>{
 const original=song(),before=JSON.stringify(original);
 const a=alignLyricNotes(original,'lead',{longForm:true});
 const phonemes=buildPhonemePlan(a);
 assert.ok(phonemes.segments.length>=1440);
 assert.equal(validatePhonemePlan(phonemes,a),true);
 assert.equal(JSON.stringify(original),before);
});
