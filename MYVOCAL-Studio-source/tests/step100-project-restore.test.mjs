import test from 'node:test';import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {planCreateSongVideo97,applyCreateSongVideo97} from '../src/lib/createSongVideo97.js';
import {previewCreativeDirection96,applyCreativeDirection96} from '../src/lib/creativeDirector96.js';
test('STEP96/97 entire project JSON retains prior manual assets and action history',()=>{
 const initial=newProject({prompt:'원곡 스타일'});
 initial.tracks[0].clips.push({id:'existing_clip',assetId:'original_audio',startBar:1});
 const plan=planCreateSongVideo97(initial,{lyrics:true,composition:true,arrangement:true,storyboard:true});
 const composed=applyCreateSongVideo97(initial,plan);
 const direction=previewCreativeDirection96(composed,'BPM을 132으로 바꿔');
 const modified=applyCreativeDirection96(composed,direction);
 const saved=JSON.stringify(modified),restored=JSON.parse(saved);
 assert.equal(restored.tracks[0].clips[0].assetId,'original_audio');
 assert.equal(restored.bpm,132);assert.equal(restored.scenes.length,6);
 assert.equal(restored.creativeDirector96.history[0].domain,'music');
 assert.equal(restored.createPipeline97.tasks.find(t=>t.key==='composition').status,'prepared');
 assert.equal(initial.bpm,120);
});
test('STEP96/97 legacy project without new fields remains readable and untouched',()=>{
 const old=newProject();assert.equal(old.creativeDirector96,undefined);assert.equal(old.createPipeline97,undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(old)).scenes,old.scenes);
});
