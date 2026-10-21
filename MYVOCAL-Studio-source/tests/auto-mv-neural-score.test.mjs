import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNeuralScoreForMv} from '../src/lib/autoMvNeuralScore.js';
import {isAlignmentStale} from '../src/lib/lyricAlignment.js';
import {isPhonemePlanStale} from '../src/lib/phonemePlan.js';
const roles=['melody','chords','bass','drums','guitar','pad'];
function project(lyrics=''){return {id:'user-project',title:'안녕 새로운 세상',bpm:120,lyrics,
 tracks:[{id:'original',name:'원본 음악 트랙',clips:[{assetId:'private-audio-original'}]}],
 scenes:[{id:'original-scene',start:0,end:16,characterId:'my-virtual-character'}]};}
const draft={source:'ollama-local',lyrics:'[Verse]\n안녕 새로운 노래가 시작되는 밤\n[Chorus]\n함께 부르는 아름다운 마음'};
function music(){return {neuralSymbolic:true,bpm:120,bars:16,durationSec:32,
 tracks:roles.map((role,i)=>({role,name:role,type:role==='melody'?'vocal':'instrument',instrument:role==='drums'?'drums':'piano',
 midiNotes:role==='melody'?
 [{id:'mel1',pitch:60,startBeat:0,length:2,velocity:90},{id:'mel2',pitch:62,startBeat:2,length:2,velocity:90},{id:'mel3',pitch:64,startBeat:4,length:2,velocity:90}]:
 [{id:'note'+i,pitch:role==='drums'?36:60+i,startBeat:0,length:1,velocity:80}]}))};}
function deps(p,state={},updates={}){
 let n=0;
 return {model:'qwen3:4b',prompt:'한국어 로맨틱 록 가수',genre:'Rock',key:'C Major',targetSeconds:180,
 session:'private',current:()=>p,newId:pre=>pre+(++n),onChange:next=>{state.project=next;},
 writeLyrics:async()=>draft,writeMidi:async()=>music(),...updates};
}
test('real local AI lyrics + neural MIDI generate score, Hangul time alignment and phoneme plan without deleting user media',async()=>{
 const p=project(),state={},out=await generateNeuralScoreForMv(p,deps(p,state));
 assert.equal(out.tracks,6);assert.equal(out.cues,3);assert.ok(out.phonemes>=3);
 assert.equal(state.project.tracks.length,7);
 assert.strictEqual(state.project.tracks[0],p.tracks[0]);
 assert.deepEqual(state.project.scenes,p.scenes);
 assert.equal(state.project.vocalAlignment.cues[0].lyric,'안');
 assert.equal(state.project.vocalAlignment.cues[1].lyric,'녕');
 assert.equal(isAlignmentStale(state.project,state.project.vocalAlignment),false);
 assert.equal(isPhonemePlanStale(state.project.vocalAlignment,state.project.phonemePlan),false);
 assert.equal(p.tracks.length,1);
});
test('user-written Korean lyrics are never overwritten by auto songwriter',async()=>{
 const p=project('내가 직접 쓴 노래 가사');const state={};
 await generateNeuralScoreForMv(p,deps(p,state));
 assert.equal(state.project.lyrics,p.lyrics);
 assert.equal(state.project.neuralAutoScore.sourceLyrics,'user-original');
});
test('no model results or project edits are published when composer fails before six-track completion',async()=>{
 const p=project(),state={};
 await assert.rejects(generateNeuralScoreForMv(p,deps(p,state,{writeMidi:async()=>{throw Error('GPU 음악 모델 생성 실패')}})),/GPU/);
 assert.equal(state.project,undefined);
 assert.equal(p.tracks.length,1);
});
test('cancelled or switched-away project cannot be overwritten by late neural music output',async()=>{
 const p=project(),state={},controller=new AbortController();
 const opt=deps(p,state,{signal:controller.signal,writeMidi:async()=>{controller.abort();return music();}});
 await assert.rejects(generateNeuralScoreForMv(p,opt),/취소/);
 assert.equal(state.project,undefined);
 const next={...p,id:'other'};
 await assert.rejects(generateNeuralScoreForMv(p,deps(p,state,{current:()=>next})),/프로젝트 변경/);
 assert.equal(state.project,undefined);
});
test('MV one-click original Windows GUI chains neural authoring, speech notes, RVC, MusicGen and SD/SVD',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync(new URL('../src/components/LocalMvBatchPanel.jsx',import.meta.url),'utf8');
 const order=['generateNeuralScoreForMv(source,','runMusicProductionPipeline({','generateAndStoreMvSinging(vocalProject,','runFullLocalMv({...base,project:movieProject'];
 let previous=-1;
 for(const token of order){const at=s.indexOf(token);assert.ok(at>previous,'order broken or absent '+token);previous=at;}
 assert.match(s,/getInstalledLocalModels/);
});
