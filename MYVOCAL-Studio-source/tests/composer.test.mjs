import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {generateOfflineDraft,normalizeRemoteProposal,applyComposition,COMPOSER_PARTS} from '../src/lib/composer.js';

const input={title:'다시 만나는 밤',prompt:'오래 헤어져 있던 친구를 다시 만나는 이야기',genre:'Rock',mood:'웅장한',key:'G Major',bpm:128,bars:24,variation:0};
const notes=d=>d.midiTracks.reduce((n,t)=>n+t.midiNotes.length,0);
test('offline song draft includes editable original MIDI on multiple instruments',()=>{
 const result=generateOfflineDraft(input);
 assert.equal(result.source,'offline-rules');
 assert.equal(result.chords.length,12);assert.equal(result.sections.reduce((s,e)=>s+e.bars,0),24);
 assert.deepEqual(result.midiTracks.map(t=>t.role),COMPOSER_PARTS);assert.ok(notes(result)>200);assert.ok(result.lyrics.includes('[Final Chorus]'));
 for(const t of result.midiTracks){
  for(const n of t.midiNotes){assert.ok(n.pitch>=0&&n.pitch<=127);assert.ok(n.startBeat>=0&&n.startBeat<24*4);assert.ok(n.length>0&&n.velocity>0&&n.velocity<=127);}
 }
});
test('reproducible draft with same inputs; variation creates different melody',()=>{
 const a=generateOfflineDraft(input),b=generateOfflineDraft(input),c=generateOfflineDraft({...input,variation:1});
 assert.deepEqual(a.midiTracks,b.midiTracks);assert.notDeepEqual(a.midiTracks[3].midiNotes,c.midiTracks[3].midiNotes);
});
test('import/apply preserves manually edited track, wave clip, image assets and storyboard',()=>{
 const project=newProject({title:'기존 프로젝트'}),id=project.tracks[0].id;
 project.tracks[0].clips=[{id:'clip1',assetId:'old-music',durationSec:10,startBar:1}];
 const sceneId=project.scenes[0].id;
 const draft=generateOfflineDraft(input);
 const result=applyComposition(project,draft);
 assert.equal(project.tracks.length,4);assert.equal(result.tracks.length,4+COMPOSER_PARTS.length);
 assert.equal(result.tracks[0].id,id);assert.deepEqual(result.tracks[0].clips,project.tracks[0].clips);
 assert.equal(result.scenes[0].id,sceneId);assert.equal(result.tracks.filter(t=>t.generatedBy==='composer-v04').length,COMPOSER_PARTS.length);
 const updated=applyComposition(result,generateOfflineDraft({...input,variation:2}));
 assert.equal(updated.tracks.length,4+COMPOSER_PARTS.length);assert.equal(updated.tracks[0].id,id);assert.equal(updated.compositionHistory.length,2);
});
test('remote result is normalized, unsupported chord symbols do not enter project',()=>{
 const proposal=normalizeRemoteProposal({title:'창작 노래',lyrics:'[Verse 1]\n우리 노래',bpm:118,key:'A Minor',chords:['Am','F','C','G','x','E7']},input);
 assert.equal(proposal.source,'openai-lyrics');assert.equal(proposal.bpm,118);assert.equal(proposal.key,'A Minor');
 assert.ok(proposal.chords.length>=4);assert.equal(proposal.chords.some(c=>c.symbol==='x'),false);
 assert.ok(notes(proposal)>100);
});
test('lyrics must be non-empty; offline draft will not magically claim AI',()=>{
 assert.throws(()=>normalizeRemoteProposal({lyrics:''},input));
 assert.equal(generateOfflineDraft(input).source,'offline-rules');
});
