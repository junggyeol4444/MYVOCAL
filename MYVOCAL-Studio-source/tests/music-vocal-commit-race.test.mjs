import test from 'node:test';
import assert from 'node:assert/strict';
import {persistNeuralMusicTracks} from '../src/lib/musicProductionCommit.js';
import {persistNeuralVocalTake} from '../src/lib/neuralVocalPersist.js';
const blob=()=>new Blob([new Uint8Array(128)],{type:'audio/wav'});
const project=()=>({id:'원본곡',tracks:[{id:'user-recording',clips:[{assetId:'original-audio'}]}]});
test('음악 커밋 직후 오류 발생해도 이미 참조된 신규 자산을 삭제하지 않음',async()=>{
 const p=project();let active=p,removed=[],saved=[];
 const prod={master:blob(),stems:{stems:['drums','bass','other','vocals'].map(name=>({name,file:blob()}))}};
 let sequence=0;
 const d={current:()=>active,onChange:next=>{active=next;throw Error('UI 업데이트 오류')},
 newId:prefix=>prefix+'-'+(++sequence),info:async()=>({duration:100}),
 createTrack:(_p,_b,id)=>({clips:[{assetId:id}]}),
 save:async e=>{saved=e},remove:async ids=>{removed=ids}};
 await assert.rejects(()=>persistNeuralMusicTracks(p,prod,d),/UI 업데이트 오류/);
 assert.equal(saved.length,5);assert.equal(removed.length,0);
 assert.equal(active.tracks.length,p.tracks.length+5);assert.equal(p.tracks.length,1);
});
test('가창 커밋 직후 오류 발생해도 이미 참조된 보컬 WAV 자산을 삭제하지 않음',async()=>{
 const p=project();let active=p,removed=[],saved=[];
 let sequence=0;
 const d={current:()=>active,onChange:next=>{active=next;throw Error('렌더 후 화면 오류')},
 newId:prefix=>prefix+'-'+(++sequence),readInfo:async()=>({duration:180}),
 createTrack:(_p,_b,id)=>({clips:[{assetId:id}]}),
 store:async e=>{saved=e},rollback:async ids=>{removed=ids}};
 await assert.rejects(()=>persistNeuralVocalTake(p,[blob()],d),/렌더 후 화면 오류/);
 assert.equal(saved.length,1);assert.equal(removed.length,0);
 assert.equal(active.tracks.length,2);assert.equal(p.tracks.length,1);
});
test('신규 보컬 assetId와 trackId의 충돌은 저장 전에 거부',async()=>{
 const p=project();let saved=false;
 const d={current:()=>p,onChange:()=>{},newId:()=> 'same',
 readInfo:async()=>({duration:90}),createTrack:(_p,_b,id)=>({clips:[{assetId:id}]}),
 store:async()=>{saved=true},rollback:async()=>{}};
 await assert.rejects(()=>persistNeuralVocalTake(p,[blob()],d),/ID/);
 assert.equal(saved,false);
});
