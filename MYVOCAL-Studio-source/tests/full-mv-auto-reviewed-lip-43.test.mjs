import test from 'node:test';
import assert from 'node:assert/strict';
import {runFullLocalMv} from '../src/lib/fullMvProduction.js';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';

const makeCharacter=(reviewed=true)=>({
 id:'hero',kind:'character',rights:'owned',name:'기존 캐릭터',
 assets:[{id:'art',name:'기존그림.png',type:'image/png'}],
 layerPlan:{version:1,sourceAssetId:'art',reviewed,width:1000,height:1000,
  parts:Object.fromEntries(['body','hair','face','leftEye','rightEye','mouth'].map(key=>
   [key,{x:450,y:550,w:100,h:50,pivotX:.5,pivotY:.575,enabled:true}]))}
});
function makeSong(){
 const p={id:'song',title:'한국어 가창',bpm:120,lyrics:'가'.repeat(8),characterId:'hero',
  tracks:[{id:'vocal',type:'vocal',instrument:'synth',midiNotes:Array.from({length:8},(_,i)=>
   ({pitch:60,startBeat:i,length:.75,velocity:90}))}],
  scenes:[{id:'scene1',start:0,end:4,characterId:'hero',videoClipAssetId:'vid_existing'}]};
 p.vocalAlignment=alignLyricNotes(p,'vocal',{longForm:true});
 p.phonemePlan=buildPhonemePlan(p.vocalAlignment);
 return p;
}
function deps(observed){
 return {preflight:()=>{},plan:p=>({durationSec:4,scenes:p.scenes}),
  batch:async()=>{throw Error('기존 장면을 다시 생성하면 안 됩니다.');},
  load:async()=>({dispose:()=>{}}),
  record:async(_movie,_resources,options)=>{
   observed.record=options;
   return {blob:new Blob([new Uint8Array(256)],{type:'video/webm'})};
  },
  mix:async()=>new Blob([new Uint8Array(128)],{type:'audio/wav'}),audioDuration:()=>4,
  captions:()=>({status:'none'}),
  overlay:(_p,_chars,placement)=>{
   observed.placements.push(placement);
   return {matchedScenes:1,scenes:{scene1:{cues:[{startMs:0,endMs:100,viseme:'A'}]}}};
  },
  revision:()=>({}),verify:()=>true};
}
async function render(project,characters,lipPlacement=null){
 const observed={placements:[]};
 const result=await runFullLocalMv({project,data:{characters},current:()=>project,
  commit:()=>{},session:'existing-windows-session',lipPlacement},deps(observed));
 return {result,observed};
}
test('검토한 2D 캐릭터와 한국어 음소가 있으면 기존 MV 녹화에 자동 연결',async()=>{
 const p=makeSong(),c=makeCharacter();
 const {result,observed}=await render(p,[c]);
 assert.equal(result.lipIncluded,true);
 assert.equal(observed.placements.length,2);
 assert.equal(observed.placements[0].xPercent,50);
 assert.equal(observed.placements[0].yPercent,57.5);
 assert.equal(observed.record.lipSyncOverlays.matchedScenes,1);
 assert.equal(result.file.type,'video/webm');
});
test('직접 설정한 입 위치는 자동 배치보다 우선',async()=>{
 const p=makeSong(),manual={xPercent:33,yPercent:47,sizePercent:7};
 const {observed}=await render(p,[makeCharacter()],manual);
 assert.deepEqual(observed.placements,[manual,manual]);
});
test('검토되지 않은 캐릭터는 임의 입 위치를 적용하지 않음',async()=>{
 const p=makeSong(),{result,observed}=await render(p,[makeCharacter(false)]);
 assert.equal(result.lipIncluded,false);
 assert.equal(observed.placements.length,0);
});
test('오래된 음소 시간표는 자동 립싱크를 적용하지 않음',async()=>{
 const p=makeSong();p.lyrics+='나';
 const {result,observed}=await render(p,[makeCharacter()]);
 assert.equal(result.lipIncluded,false);
 assert.equal(observed.placements.length,0);
});
