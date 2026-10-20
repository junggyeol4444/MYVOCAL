import test from 'node:test';
import assert from 'node:assert/strict';
import {runMusicProductionPipeline} from '../src/lib/musicProductionPipeline.js';
const audio=()=>new File([new Uint8Array(48)],'test.wav',{type:'audio/wav'});
const stems=()=>({stems:['drums','bass','other','vocals'].map(name=>({name,file:audio()}))});
const common={settings:{python:'C:\\python.exe',modelDir:'C:\\musicgen',prompt:'music',seconds:12,seed:42},demucs:{python:'C:\\python.exe',repo:'C:\\demucs'}};
test('one click runs actual engine interfaces in order, without writing project',async()=>{
 const events=[];const result=await runMusicProductionPipeline({...common,
  generate:async()=>{events.push('musicgen');return audio()},
  split:async()=>{events.push('demucs');return stems()},
  remix:async()=>{events.push('master');return audio()},onProgress:p=>events.push('progress:'+p)});
 assert.ok(result.master instanceof Blob);assert.deepEqual(events.filter(x=>!x.startsWith('progress:')),['musicgen','demucs','master']);
});
test('sequence mode passes requested sections and uses real generation callback',async()=>{
 let observed;
 await runMusicProductionPipeline({...common,sequence:true,segments:3,continuation:true,crossfadeSec:.4,prompts:['intro','verse','chorus'],
  generateSequence:async(_settings,opt)=>{observed=opt;return audio()},split:async()=>stems(),remix:async()=>audio()});
 assert.equal(observed.segments,3);assert.equal(observed.continuation,true);assert.deepEqual(observed.prompts,['intro','verse','chorus']);
});
test('cancel after generation never invokes Demucs or master',async()=>{
 const ctrl=new AbortController();let called=false;
 await assert.rejects(runMusicProductionPipeline({...common,signal:ctrl.signal,
  generate:async()=>{ctrl.abort();return audio()},split:async()=>{called=true;return stems()},remix:async()=>audio()}),/취소/);
 assert.equal(called,false);
});
test('Demucs failure stops before master; nothing is saved',async()=>{
 let called=false;
 await assert.rejects(runMusicProductionPipeline({...common,generate:async()=>audio(),split:async()=>{throw Error('Demucs 실제 모델 실패')},remix:async()=>{called=true;return audio()}}),/실패/);
 assert.equal(called,false);
});
test('invalid MusicGen or Demucs results stop downstream stages',async()=>{
 await assert.rejects(runMusicProductionPipeline({...common,generate:async()=>new Blob([]),split:async()=>stems(),remix:async()=>audio()}),/WAV/);
 await assert.rejects(runMusicProductionPipeline({...common,generate:async()=>audio(),split:async()=>({stems:[]}),remix:async()=>audio()}),/분리 트랙/);
});
test('master failure and initial cancellation propagate without saving',async()=>{
 await assert.rejects(runMusicProductionPipeline({...common,generate:async()=>audio(),split:async()=>stems(),remix:async()=>{throw Error('PCM 실패')}}),/PCM 실패/);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(runMusicProductionPipeline({...common,signal:ctrl.signal,generate:async()=>{throw Error('호출 금지')}}),/취소/);
});
