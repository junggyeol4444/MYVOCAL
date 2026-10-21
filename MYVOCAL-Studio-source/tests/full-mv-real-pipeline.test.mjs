import test from 'node:test';
import assert from 'node:assert/strict';
import {runFullLocalMv} from '../src/lib/fullMvProduction.js';
import {planMvVideoRender,MV_VIDEO_MAX_SEC} from '../src/lib/mvVideoRender.js';

test('actual existing MV export starts even without injected mixdown defaults',async()=>{
 const project={id:'existing',title:'프로젝트',scenes:[{id:'scene',start:0,end:4,title:'공연',description:'참고',videoClipAssetId:'already-generated-video'}],tracks:[]};
 const file=await runFullLocalMv({
  project,data:{characters:[]},current:()=>project,commit:()=>{},session:'local',
  includeAudio:false,includeCaptions:false,
 },{
  preflight:()=>{},plan:p=>({scenes:p.scenes,durationSec:4}),
  load:async()=>({dispose:()=>{}}),
  record:async(_plan,_media,options)=>{
   assert.equal(options.includeAudio,false);
   return {blob:new Blob([new Uint8Array(256)],{type:'video/webm'})};
  },
  revision:()=> 'frozen',
  verify:()=>true
 });
 assert.equal(file.audioIncluded,false);
 assert.equal(file.file.type,'video/webm');
});
test('six-minute MV uses the same frame/render length across all core renderers',()=>{
 assert.equal(MV_VIDEO_MAX_SEC,360);
 const project={id:'p6',title:'6분 노래',tracks:[],scenes:[{id:'scene1',start:0,end:360,title:'여섯 분',description:'무대'}]};
 const plan=planMvVideoRender(project,[]);
 assert.equal(plan.durationSec,360);
 assert.equal(plan.scenes.length,1);
 assert.equal(plan.mediaScenes,0);
});
