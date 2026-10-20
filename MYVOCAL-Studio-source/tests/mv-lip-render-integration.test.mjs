import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMvVideoFrame} from '../src/lib/mvVideoRender.js';
import {planMvLipSyncOverlay} from '../src/lib/mvLipSyncOverlay.js';
function context(){const calls=[];const gradient={addColorStop(){}};return {calls,save(){calls.push('save')},restore(){calls.push('restore')},beginPath(){},ellipse(...args){calls.push(['ellipse',...args])},fill(){},stroke(){},fillRect(){},drawImage(){calls.push('drawImage')},fillText(){},createLinearGradient(){return gradient},moveTo(){},lineTo(){}};}
function canvas(ctx){return {width:640,height:360,getContext:()=>ctx};}
const characters=[{id:'char1',lipSync:{version:1,cues:[{startMs:0,endMs:500,phoneme:'ㅏ',viseme:'A',lyric:'아'}]}}];
const p={id:'project',characterId:'char1',scenes:[{id:'s',start:0,end:2,title:'intro'}]};
const plan={durationSec:2,scenes:[{id:'s',start:0,end:2,title:'intro',kind:'image',assetId:'image1'}]};
const media=new Map([['image1',{kind:'image',element:{naturalWidth:1280,naturalHeight:720}}]]);
test('timed mouth is burned into real saved frame only after media image is drawn',()=>{
 const ctx=context(),overlays=planMvLipSyncOverlay(p,characters);
 assert.equal(drawMvVideoFrame(canvas(ctx),plan,media,.2,{lipSyncOverlays:overlays}),'s');
 assert.equal(ctx.calls.filter(x=>x==='drawImage').length,1);
 assert.equal(ctx.calls.filter(x=>Array.isArray(x)&&x[0]==='ellipse').length,1);
 const without=context();drawMvVideoFrame(canvas(without),plan,media,.2,{});
 assert.equal(without.calls.filter(x=>Array.isArray(x)&&x[0]==='ellipse').length,0);
});
test('card-only storyboard never pretends a face was animated',()=>{
 const ctx=context(),overlays=planMvLipSyncOverlay(p,characters);
 const cards={...plan,scenes:[{...plan.scenes[0],assetId:'',kind:'card'}]};
 drawMvVideoFrame(canvas(ctx),cards,new Map(),.2,{lipSyncOverlays:overlays});
 assert.equal(ctx.calls.filter(x=>Array.isArray(x)&&x[0]==='ellipse').length,0);
});
test('half open phoneme interval does not continue moving after the voiced frame',()=>{
 const ctx=context(),overlays=planMvLipSyncOverlay(p,characters);
 drawMvVideoFrame(canvas(ctx),plan,media,.8,{lipSyncOverlays:overlays});
 assert.equal(ctx.calls.filter(x=>Array.isArray(x)&&x[0]==='ellipse').length,0);
});