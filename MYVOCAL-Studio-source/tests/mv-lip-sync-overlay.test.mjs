import test from 'node:test';import assert from 'node:assert/strict';
import {planMvLipSyncOverlay,mouthAtTime,drawMvLipSyncOverlay} from '../src/lib/mvLipSyncOverlay.js';
const profile={id:'chr1',name:'영웅',lipSync:{version:1,cues:[{startMs:0,endMs:250,phoneme:'ㅏ',viseme:'A',lyric:'아'},{startMs:300,endMs:500,phoneme:'ㅁ',viseme:'M',lyric:'마'},{startMs:500,endMs:850,phoneme:'ㅗ',viseme:'O',lyric:'오'}]}};
const project={id:'prj1',characterId:'chr1',scenes:[{id:'s1',start:0,end:1,title:'독창'},{id:'s2',start:1,end:2,title:'연주'}]};
test('project's saved character sync produces exact scene-aware timed overlays without changes',()=>{
 const original=JSON.stringify({project,profile});const overlay=planMvLipSyncOverlay(project,[profile],{xPercent:49,yPercent:57,sizePercent:8});
 assert.equal(overlay.matchedScenes,1);assert.equal(overlay.automaticFaceTracking,false);
 assert.equal(mouthAtTime(overlay,'s1',.1).viseme,'A');assert.equal(mouthAtTime(overlay,'s1',.4).viseme,'M');
 assert.equal(mouthAtTime(overlay,'s1',.65).viseme,'O');assert.equal(mouthAtTime(overlay,'s1',.27),null);
 assert.equal(mouthAtTime(overlay,'s2',1.2),null);assert.equal(JSON.stringify({project,profile}),original);
});
test('bad positions, unlinked characters and corrupt cues prevent false lip sync',()=>{
 assert.throws(()=>planMvLipSyncOverlay(project,[profile],{sizePercent:80}),/위치/);
 assert.throws(()=>planMvLipSyncOverlay({...project,characterId:'unknown'},[profile]),/시간표/);
 assert.throws(()=>planMvLipSyncOverlay(project,[{...profile,lipSync:{version:1,cues:[{startMs:0,endMs:100,phoneme:'ㅏ',viseme:'O',lyric:'아'}]}}]),/Viseme/);
 assert.throws(()=>planMvLipSyncOverlay(project,[profile,profile]),/중복/);
});
test('genuine render frame calls ellipse only when a voiced character has matching scene media',()=>{
 const x=planMvLipSyncOverlay(project,[profile]);const calls=[];
 const ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),beginPath:()=>calls.push('begin'),ellipse:(...a)=>calls.push(['ellipse',...a]),fill:()=>calls.push('fill'),stroke:()=>calls.push('stroke')};
 assert.equal(drawMvLipSyncOverlay(ctx,x,'s1',.12,640,360),true);assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='ellipse').length,1);
 assert.equal(drawMvLipSyncOverlay(ctx,x,'s2',1.5,640,360),false);
 assert.equal(drawMvLipSyncOverlay(ctx,x,'s1',.27,640,360),false);
});