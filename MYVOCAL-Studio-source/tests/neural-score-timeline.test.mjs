import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNeuralMusicPrompts} from '../src/lib/neuralMusicPromptTimeline.js';
import {latestCompleteNeuralScore,NEURAL_SCORE_ROLES as roles} from '../src/lib/neuralScoreBatch.js';
function project(){return {id:'원본',title:'한국어 창작곡',bpm:120,genre:'Rock',key:'C Major',
 neuralAutoScore:{bars:176},tracks:[{id:'사용자-녹음'},...roles.map((role,i)=>({
 id:'ai-'+role,role,generatedBy:'ollama-neural-score',
 midiNotes:Array.from({length:22},(_,j)=>({pitch:role==='drums'?36:60+i+j%4,
 startBeat:j*8,length:1,velocity:role==='drums'?100:88}))}))]};}
test('AI MIDI 최신 6악기 선택 시 프로젝트·사용자 원본 무변경',()=>{
 const p=project(),original=JSON.stringify(p),batch=latestCompleteNeuralScore(p);
 assert.equal(batch.size,6);assert.equal(batch.get('melody').id,'ai-melody');
 assert.equal(JSON.stringify(p),original);
});
test('3분 연속 MusicGen 구간에 MIDI 선율·화음·BPM 전달',()=>{
 const prompts=buildNeuralMusicPrompts(project(),{segments:11});
 assert.equal(prompts.length,11);assert.match(prompts[0],/Intro/);
 assert.match(prompts[0],/C4/);assert.match(prompts[0],/120 BPM/);
});
test('6분 음악 구간 프롬프트는 곡 구조와 음표가 달라진다',()=>{
 const prompts=buildNeuralMusicPrompts(project(),{segments:20});
 assert.equal(prompts.length,20);assert.notEqual(prompts[0],prompts[8]);
 assert.match(prompts.at(-1),/Outro|Final Chorus/);
});
test('이전 작곡과 최신 작곡의 MIDI가 섞이지 않는다',()=>{
 const p=project();p.tracks.push(...roles.map(role=>({
  id:'latest-'+role,role,generatedBy:'ollama-neural-score',
  midiNotes:[{pitch:80,startBeat:0,length:4,velocity:110}]
 })));
 assert.equal(latestCompleteNeuralScore(p).get('melody').id,'latest-melody');
 assert.match(buildNeuralMusicPrompts(p,{segments:11})[0],/G#5/);
});
test('최신 작곡 회차 불완전하면 이전 악기와 혼합 거부',()=>{
 const p=project();p.tracks.push({id:'partial',role:'melody',generatedBy:'ollama-neural-score',
 midiNotes:[{pitch:90,startBeat:0,length:1}]});
 assert.equal(latestCompleteNeuralScore(p),null);
 assert.deepEqual(buildNeuralMusicPrompts(p,{segments:11}),[]);
});
test('프롬프트는 길이 제한과 줄바꿈 제거',()=>{
 const prompts=buildNeuralMusicPrompts(project(),{segments:11,basePrompt:'가\n'.repeat(1000)});
 assert.ok(prompts.every(p=>[...p].length<=600&&!p.includes('\n')));
});
test('유효하지 않은 MusicGen 분할 설정 거부',()=>{
 for(const opts of [{segments:21},{segments:1},{segments:11,seconds:25},{segments:11,crossfadeSec:10}])
  assert.throws(()=>buildNeuralMusicPrompts(project(),opts),/구간/);
});
