import test from 'node:test';
import assert from 'node:assert/strict';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';
import {automaticSingingVisemes,reviewedCharacterMouthPlacement} from '../src/lib/autoMvPhonemeLip.js';
import {planMvLipSyncOverlay,mouthAtTime} from '../src/lib/mvLipSyncOverlay.js';
const character=()=>({
 id:'hero',kind:'character',name:'기존 캐릭터',rights:'owned',
 assets:[{id:'art',name:'내캐릭터.png',type:'image/png'}],
 layerPlan:{version:1,sourceAssetId:'art',reviewed:true,width:1000,height:1000,
 parts:Object.fromEntries(['body','hair','face','leftEye','rightEye','mouth'].map(key=>
  [key,{x:450,y:550,w:100,h:50,pivotX:.5,pivotY:.575,enabled:true}]))}
});
const song=()=>{const p={id:'singer',title:'가창',bpm:120,characterId:'hero',
 lyrics:'가'.repeat(720),
 tracks:[{id:'voice',type:'vocal',instrument:'synth',midiNotes:Array.from({length:720},(_,i)=>({pitch:60,startBeat:i,length:.75,velocity:90}))}],
 scenes:[{id:'scene1',start:0,end:360,characterId:'hero'}]};
 p.vocalAlignment=alignLyricNotes(p,'voice',{longForm:true});
 p.phonemePlan=buildPhonemePlan(p.vocalAlignment);
 return p;};
test('검토된 사용자 2D 입 영역에서 자동 오버레이 위치 생성',()=>{
 const placement=reviewedCharacterMouthPlacement(song(),[character()]);
 assert.equal(placement.xPercent,50);assert.equal(placement.yPercent,57.5);
 assert.equal(placement.sizePercent,10);
});
test('6분 한국어 가창 음소를 실제 WebM 장면의 시간에 연결',()=>{
 const p=song(),c=character();
 const auto=automaticSingingVisemes(p,[c]);
 assert.equal(auto.characterId,'hero');assert.ok(auto.cues.length>=1440);
 const result=planMvLipSyncOverlay(p,[c],reviewedCharacterMouthPlacement(p,[c]));
 assert.equal(result.matchedScenes,1);
 assert.ok(result.scenes.scene1.cues.length>=1440);
 assert.equal(mouthAtTime(result,'scene1',350)?.characterId,'hero');
});
test('두 인물 동시 캐스팅에 독단적으로 한 사람 입 모양을 복제하지 않음',()=>{
 const p=song();p.scenes.push({id:'scene2',start:0,end:360,characterId:'other'});
 assert.equal(automaticSingingVisemes(p,[character(),{id:'other',rights:'owned'}]),null);
});
test('가사 변경 후 이전 음소 타임라인을 재활용하지 않음',()=>{
 const p=song();p.lyrics+='나';
 assert.equal(automaticSingingVisemes(p,[character()]),null);
});
