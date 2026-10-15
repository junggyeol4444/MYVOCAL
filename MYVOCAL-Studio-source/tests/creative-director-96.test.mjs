import test from 'node:test';import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {previewCreativeDirection96,applyCreativeDirection96,directorCapabilities96} from '../src/lib/creativeDirector96.js';
test('STEP96 music BPM valid, immutable, history persisted',()=>{const p=newProject();const plan=previewCreativeDirection96(p,'BPM을 130으로 바꿔');const n=applyCreativeDirection96(p,plan);assert.equal(n.bpm,130);assert.equal(p.bpm,120);assert.equal(n.creativeDirector96.history.length,1);});
test('STEP96 rejects unsupported AI and out of bounds tempo',()=>{const p=newProject();assert.throws(()=>previewCreativeDirection96(p,'미완성 MV를 자유롭게 AI로 렌더링해줘'));assert.throws(()=>previewCreativeDirection96(p,'BPM을 330으로 바꿔'));assert.ok(directorCapabilities96().unavailable.length);});
test('STEP96 storyboard command honors locks',()=>{let p=newProject();assert.throws(()=>previewCreativeDirection96(p,'배경을 밤거리로 바꿔'));p={...p,backgroundLock:false};const plan=previewCreativeDirection96(p,'배경을 밤거리로 바꿔');const n=applyCreativeDirection96(p,plan);assert.equal(n.scenes[0].location,'밤거리');assert.equal(p.scenes[0].location,'');});
test('STEP96 stale review fails closed',()=>{const p=newProject();const plan=previewCreativeDirection96(p,'BPM을 130으로 바꿔');assert.throws(()=>applyCreativeDirection96({...p,bpm:140},plan));});
