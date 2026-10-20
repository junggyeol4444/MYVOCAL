import test from 'node:test';
import assert from 'node:assert/strict';
import {planLocalAiMusicVideo,applyLocalAiMusicVideo} from '../src/lib/localAiProduction.js';
import {generateOfflineDraft} from '../src/lib/composer.js';
const scene={id:'default',start:0,end:12,title:'Scene 01',description:'첫 장면을 설명해 주세요',characterId:'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''};
const original=()=>({id:'p001',title:'달빛',prompt:'달빛 노래',bpm:120,key:'C Major',genreMix:[{name:'Rock',weight:100}],characterId:'',sections:[],tracks:[],lyrics:'',scenes:[{...scene}]});
const opt={prompt:'달빛 노래',title:'달빛',genre:'Rock',genreMix:[{name:'Rock',weight:100}],mood:'감성적',key:'C Major',bpm:120,bars:16};
const compose=async() =>({...generateOfflineDraft(opt),source:'ollama-local'});
const storyboard=async(p,model)=>({format:'MYVOCAL_LOCAL_AI_STORYBOARD',projectId:p.id,
 source:JSON.stringify([p.id,p.scenes,p.sections,p.bpm,p.prompt,p.lyrics,p.characterId]),
 model,videoGenerated:false,scenes:p.scenes.map(s=>({...s,title:'AI '+s.title,description:'AI 장면 설명'}))});
test('both AI stages complete before one commit; originals untouched',async()=>{
 const p=original(),raw=JSON.stringify(p);
 const plan=await planLocalAiMusicVideo(p,opt,'model',{compose,storyboard});
 assert.equal(JSON.stringify(p),raw);const out=applyLocalAiMusicVideo(p,plan);
 assert.equal(out.scenes.length,5);assert.equal(out.tracks.length,9);
 assert.equal(out.localAiProduction.neuralSingingGenerated,false);
});
test('failed second stage cannot mutate original',async()=>{
 const p=original(),snapshot=JSON.stringify(p);
 await assert.rejects(planLocalAiMusicVideo(p,opt,'model',{compose,storyboard:async()=>{throw Error('AI server failed')}}),/AI server failed/);
 assert.equal(JSON.stringify(p),snapshot);
});
test('reject edited scene and stale preview',async()=>{
 const p=original(),plan=await planLocalAiMusicVideo(p,opt,'model',{compose,storyboard});
 assert.throws(()=>applyLocalAiMusicVideo({...p,lyrics:'edited'},plan),/변경/);
 await assert.rejects(planLocalAiMusicVideo({...p,scenes:[{...scene,title:'사람이 편집'}]},opt,'model',{compose,storyboard}),/덮어쓸/);
});
test('keeps user recordings and manual tracks',async()=>{
 const p=original();p.tracks=[{id:'original-track',type:'audio',clips:[{assetId:'original.wav'}],midiNotes:[]}];
 const plan=await planLocalAiMusicVideo(p,opt,'model',{compose,storyboard}),out=applyLocalAiMusicVideo(p,plan);
 assert.equal(out.tracks[0].clips[0].assetId,'original.wav');
});
