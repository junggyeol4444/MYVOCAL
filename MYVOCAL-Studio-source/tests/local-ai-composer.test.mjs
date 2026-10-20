import test from 'node:test';
import assert from 'node:assert/strict';
import {getInstalledLocalModels,composeWithLocalAI} from '../src/lib/localAiComposer.js';
const options={prompt:'오래 헤어진 친구를 다시 만나는 한국어 록발라드',genre:'Rock',genreMix:[{name:'Rock',weight:100}],mood:'희망적',key:'A Minor',bars:16,bpm:100,title:'재회'};
test('actual local model list and authenticated same-origin request',async()=>{
 const requests=[];
 const models=await getInstalledLocalModels({key:'test',fetchImpl:async(url,opts)=>{requests.push([url,opts]);return {ok:true,json:async()=>({models:['qwen3:4b','qwen3:4b','../bad?']})}}});
 assert.deepEqual(models,['qwen3:4b']);assert.equal(requests[0][0],'/api/local-ai/models');assert.equal(requests[0][1].headers['X-MYVOCAL-Session'],'test');
});
test('model proposal becomes editable 9-track MIDI draft without project writes',async()=>{
 let req;
 const draft=await composeWithLocalAI(options,{model:'qwen3:4b',key:'test',fetchImpl:async(url,opts)=>{req={url,opts};return {ok:true,json:async()=>({provider:'local-ollama',model:'qwen3:4b',neuralTextGenerated:true,audioGenerated:false,trainingPerformed:false,proposal:{title:'재회',lyrics:'[Verse]\n다시 만난 우리의 거리\n[Chorus]\n너를 기억해',chords:['Am','F','C','G'],bpm:112,key:'A Minor'}})}}});
 assert.equal(req.url,'/api/local-ai/compose');assert.equal(req.opts.method,'POST');assert.equal(JSON.parse(req.opts.body).model,'qwen3:4b');
 assert.equal(draft.source,'ollama-local');assert.equal(draft.lyrics.includes('다시 만난'),true);assert.equal(draft.bpm,112);assert.equal(draft.midiTracks.length,9);assert.ok(draft.midiTracks[0].midiNotes.length>0);
});
test('local AI refuses fake neural/audio provenance',async()=>{
 await assert.rejects(()=>composeWithLocalAI(options,{model:'qwen3:4b',key:'test',fetchImpl:async()=>({ok:true,json:async()=>({provider:'local-ollama',model:'qwen3:4b',neuralTextGenerated:true,audioGenerated:true,trainingPerformed:false,proposal:{lyrics:'abc'}})})}),/출처/);
 await assert.rejects(()=>composeWithLocalAI(options,{model:'bad?unsafe',key:'test'}),/모델/);
});
test('server errors propagate without fabricating a draft',async()=>{
 await assert.rejects(()=>composeWithLocalAI(options,{model:'qwen3:4b',key:'test',fetchImpl:async()=>({ok:false,status:502,json:async()=>({error:'Ollama를 실행하세요'})})}),/Ollama/);
});