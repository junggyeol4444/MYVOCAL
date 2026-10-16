import test from 'node:test';import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {auditMvStoryboard} from '../src/lib/mvStoryboard.js';
import {buildMvAnimatic,findMvAnimaticFrame} from '../src/lib/mvAnimatic.js';
import {canReplaceDefaultStoryboard,storyboardFromSongSections} from '../src/lib/songStoryboard.js';
import {planCreateSongVideo97,applyCreateSongVideo97,CREATE97_ORDER} from '../src/lib/createSongVideo97.js';
test('STEP97 plan order is exactly user pipeline',()=>assert.deepEqual(CREATE97_ORDER,['lyrics','composition','arrangement','singing','mix','master','storyboard','musicVideo']));
test('STEP97 composes MIDI/lyrics and scenes while preserving original manual tracks',()=>{const p=newProject({prompt:'친구와 다시 만남'});const plan=planCreateSongVideo97(p,{lyrics:true,composition:true,arrangement:true,storyboard:true,singing:true,musicVideo:true});const n=applyCreateSongVideo97(p,plan);assert.ok(n.tracks.length>p.tracks.length);assert.ok(n.lyrics.includes('Chorus'));assert.equal(p.lyrics,'');assert.equal(n.scenes.length,n.sections.length);assert.equal(p.scenes.length,1);assert.ok(n.tracks.some(t=>t.id===p.tracks[0].id));assert.equal(n.createPipeline97.tasks.find(t=>t.key==='singing').status,'requires-local-model');assert.equal(n.createPipeline97.tasks.find(t=>t.key==='musicVideo').status,'requires-local-model');});
test('STEP97 preserves custom storyboard and assets',()=>{let p=newProject();p={...p,scenes:[{...p.scenes[0],title:'기존 장면',imageAssetId:'original-photo'}]};const plan=planCreateSongVideo97(p,{storyboard:true});const n=applyCreateSongVideo97(p,plan);assert.deepEqual(n.scenes,p.scenes);assert.equal(n.createPipeline97.tasks[0].status,'manual-existing-scenes');});
test('STEP97 cannot apply stale plan',()=>{const p=newProject();const plan=planCreateSongVideo97(p,{lyrics:true});assert.throws(()=>applyCreateSongVideo97({...p,lyrics:'사용자가 수정'},plan));});
test('STEP97 rejects empty action',()=>assert.throws(()=>planCreateSongVideo97(newProject(),{})));

test('generated storyboard scenes match actual composed Intro, Verse, Chorus, Final Chorus and Outro boundaries',()=>{
 const p=newProject({prompt:'다시 만난 친구'});
 const plan=planCreateSongVideo97(p,{lyrics:true,composition:true,arrangement:true,storyboard:true});
 const result=applyCreateSongVideo97(p,plan);
 assert.deepEqual(result.scenes.map(s=>s.title),result.sections.map(s=>s.name));
 assert.deepEqual(result.scenes.map(s=>[s.start,s.end]),[[0,4],[4,16],[16,32],[32,44],[44,48]]);
 const audit=auditMvStoryboard(result);
 assert.equal(audit.errors,0);
 assert.equal(audit.gapSeconds,0);
 assert.equal(audit.overlapSeconds,0);
 assert.equal(audit.durationSec,48);
 const animatic=buildMvAnimatic(result);
 assert.equal(findMvAnimaticFrame(animatic,16).scene.title,'Chorus');
 assert.equal(findMvAnimaticFrame(animatic,32).scene.title,'Final Chorus');
 assert.equal(findMvAnimaticFrame(animatic,48).completed,true);
 assert.equal(plan.tasks.find(t=>t.key==='storyboard').status,'local-ready');
 assert.deepEqual(p.scenes,[{...p.scenes[0]}]);
});
test('storyboard-only request respects existing song sections and tempo, not a hardcoded 24-bar draft',()=>{
 const p=newProject({prompt:'내 음악에 맞춘 영상'});
 p.bpm=137;
 p.sections=[{id:'intro',name:'Intro',bars:3},{id:'verse',name:'Verse 1',bars:7},{id:'chorus',name:'Chorus',bars:8},{id:'outro',name:'Outro',bars:5}];
 const r=applyCreateSongVideo97(p,planCreateSongVideo97(p,{storyboard:true}));
 assert.equal(r.scenes.length,4);
 let beats=0;
 for(let i=0;i<p.sections.length;i++){
  assert.equal(r.scenes[i].start,Math.round(beats*60/137*1000)/1000);
  beats+=p.sections[i].bars*4;
  assert.equal(r.scenes[i].end,Math.round(beats*60/137*1000)/1000);
  if(i)assert.equal(r.scenes[i-1].end,r.scenes[i].start);
 }
 assert.equal(auditMvStoryboard(r).errors,0);
 assert.equal(auditMvStoryboard(r).gapSeconds,0);
 assert.deepEqual(r.sections,p.sections);
 assert.deepEqual(r.tracks,p.tracks);
});
test('user edits even only default scene text or camera: never erase scene, video, image or manual choices',()=>{
 const cases=[
  {description:'사용자가 직접 만든 도시 장면'},
  {camera:'Orbit left'},
  {title:'나만의 장면'},
  {location:'Busan'},
  {characterId:'character-one'},
  {imageAssetId:'user-photo'},
  {videoClipAssetId:'user-video'},
  {imageGeneration:{modelId:'saved'}},
  {start:1},
  {end:13},
  {notes:'user field'}
 ];
 for(const update of cases){
  const p=newProject({prompt:'가사 설명'});
  p.scenes=[{...p.scenes[0],...update}];
  const source=structuredClone(p);
  const plan=planCreateSongVideo97(p,{lyrics:true,composition:true,arrangement:true,storyboard:true});
  assert.equal(plan.canStoryboard,false,JSON.stringify(update));
  assert.equal(plan.tasks.find(t=>t.key==='storyboard').status,'manual-existing-scenes');
  const r=applyCreateSongVideo97(p,plan);
  assert.deepEqual(r.scenes,p.scenes,JSON.stringify(update));
  assert.deepEqual(p,source);
 }
});
test('music section names and user prompt get safe single-line editable scene descriptions',()=>{
 const p=newProject({prompt:'밤의 도시\n주인공이 돌아온다'});
 p.sections=[{name:'Intro\n(Opening)',bars:2},{name:'Chorus',bars:4}];
 const scenes=storyboardFromSongSections(p);
 assert.equal(scenes.length,2);
 assert.ok(scenes[0].title.includes('Intro'));
 for(const s of scenes){
  assert.doesNotMatch(s.title,/\n|\r/);
  assert.doesNotMatch(s.description,/\n|\r/);
  assert.ok(s.end>s.start);
 }
 assert.equal(auditMvStoryboard({...p,scenes}).errors,0);
});
test('bad timing fails without modifying original scene media',()=>{
 const p=newProject();
 p.scenes[0].imageAssetId='my-unique-source';
 const before=structuredClone(p);
 for(const bpm of [NaN,0,Infinity,241]){
  assert.throws(()=>storyboardFromSongSections({...p,bpm}),/BPM/);
 }
 for(const sections of [[],[{name:'Chorus',bars:0}],[{name:'A',bars:NaN}]]){
  assert.throws(()=>storyboardFromSongSections({...p,sections}),/구간|마디/);
 }
 assert.deepEqual(p,before);
});
test('default untouched scene is replaceable, but added fields, even hidden ones, are protected',()=>{
 const p=newProject();
 assert.equal(canReplaceDefaultStoryboard(p),true);
 assert.equal(canReplaceDefaultStoryboard({...p,scenes:[{...p.scenes[0],outfit:'stage suit'}]}),false);
 assert.equal(canReplaceDefaultStoryboard({...p,scenes:[{...p.scenes[0],imageAssetId:'abc'}]}),false);
 assert.equal(canReplaceDefaultStoryboard({...p,scenes:[{...p.scenes[0],videoGeneration:{status:'generated'}}]}),false);
});

test('a changed voice, character or musical setting rejects an outdated storyboard plan',()=>{
 const p=newProject();
 const plan=planCreateSongVideo97(p,{composition:true,storyboard:true});
 for(const changed of [{voiceId:'different'},{characterId:'other'},{bpm:145},{key:'D Major'},{genreMix:[{name:'Pop',weight:100}]},{videoMode:'Story MV'},{withVideo:false}]){
  assert.throws(()=>applyCreateSongVideo97({...p,...changed},plan),/변경/);
 }
});
