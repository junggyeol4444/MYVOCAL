import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAndStoreNeuralAudioStems,instrumentNeuralPrompts} from '../src/lib/neuralInstrumentAudioStems.js';
import {NEURAL_SCORE_ROLES as roles} from '../src/lib/neuralScoreBatch.js';
function score(){
 return {id:'existing-song',title:'우리 노래',bpm:120,genre:'Pop',key:'C Major',neuralAutoScore:{bars:88},tracks:[
 {id:'user-recording',clips:[{assetId:'my-recording'}]},
 ...roles.map((role,i)=>({id:'ai-'+role,role,generatedBy:'ollama-neural-score',
 midiNotes:[{pitch:role==='drums'?36:60+i,startBeat:0,length:1,velocity:85}]}))]};
}
function pcm(){
 const frames=8000*160,b=new Uint8Array(44+frames*2),v=new DataView(b.buffer);
 for(const [at,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for(let i=0;i<4;i++)b[at+i]=tag.charCodeAt(i);
 v.setUint32(4,b.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,b.length-44,true);v.setInt16(44,6500,true);
 return new Blob([b],{type:'audio/wav'});
}
const output=pcm();
function deps(project,custom={}){
 let actual=project,seq=0,events=[],created=[],removed=[];
 return {state:()=>({actual,events,created,removed}),options:{
  python:'C:/Python/python.exe',modelDir:'C:/models/musicgen',session:'myvocal-session',
  current:()=>actual,onChange:async next=>{actual=next},newId:p=>p+(++seq),
  readInfo:async()=>({duration:160}),createTrack:(_p,file,id,durationSec)=>({clips:[{assetId:id,durationSec}]}),
  save:async entries=>{created=entries},remove:async ids=>{removed=ids},
  generate:async(settings,opts)=>{events.push({settings,opts});return output},
  ...custom}};
}
test('6개 악기 모두 MIDI 조건으로 독립 신경망 구간 설명 작성',()=>{
 const p=score();
 for(const role of roles){
  const prompts=instrumentNeuralPrompts(p,role,{segments:11});
  assert.equal(prompts.length,11);assert.ok(prompts.every(q=>q.length<=600&&q.includes('120 BPM')));
 }
});
test('실제 WAV 6개를 원본 데이터 불변으로 신규 편집 트랙에 저장',async()=>{
 const p=score(),before=JSON.stringify(p),d=deps(p);
 const got=await renderAndStoreNeuralAudioStems(p,{...d.options,audible:true});
 assert.equal(got.tracks,6);
 assert.equal(d.state().created.length,6);
 assert.equal(d.state().events.length,6);
 assert.ok(d.state().actual.tracks.slice(-6).every(t=>t.mute===false&&t.generatedBy==='musicgen-independent-audio'));
 assert.equal(JSON.stringify(p),before);assert.equal(d.state().actual.tracks[0],p.tracks[0]);
});
test('생성 중 취소되면 프로젝트와 새 자산을 변경하지 않음',async()=>{
 const p=score(),ctrl=new AbortController(),d=deps(p,{generate:async()=>{ctrl.abort();return output}});
 await assert.rejects(()=>renderAndStoreNeuralAudioStems(p,{...d.options,signal:ctrl.signal}),/취소/);
 assert.equal(d.state().created.length,0);assert.equal(d.state().actual,p);
});
test('신규 트랙 커밋 실패 시 신규 WAV 자산만 되돌림',async()=>{
 const p=score(),d=deps(p,{onChange:async()=>{throw Error('저장 실패')}});
 await assert.rejects(()=>renderAndStoreNeuralAudioStems(p,d.options),/저장 실패/);
 assert.equal(d.state().removed.length,6);
 assert.ok(d.state().removed.every(id=>id!=='my-recording'));
});
