import test from 'node:test';
import assert from 'node:assert/strict';
import {planScoreMatchedMusicGenSegments,trimMusicGenWavToScore} from '../src/lib/neuralStemScoreTiming.js';
const wav=(sec,rate=8000)=>{
 const frames=Math.round(sec*rate),raw=new Uint8Array(44+frames*2),v=new DataView(raw.buffer);
 for(const [i,name] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for(let n=0;n<4;n++)raw[i+n]=name.charCodeAt(n);
 v.setUint32(4,raw.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,frames*2,true);
 return new Blob([raw],{type:'audio/wav'});
};
test('176초 실제 신경망 MIDI를 11 MusicGen 구간으로 정확히 계획',()=>{
 const p=planScoreMatchedMusicGenSegments(176,11);
 assert.equal(p.segmentSeconds.length,11);
 assert.equal(p.segmentSeconds.reduce((a,b)=>a+b,0)-10*.5,176);
 assert.ok(p.segmentSeconds.every(x=>x>=3&&x<=20));
});
test('352초 한국어 가창을 20개 MusicGen 구간에 일치',()=>{
 const p=planScoreMatchedMusicGenSegments(352,20);
 assert.equal(p.segmentSeconds.length,20);
 assert.ok(p.excessSec>=0&&p.excessSec<=1);
});
test('기존 WAV를 바꾸지 않고 초과된 끝부분만 잘라 길이 동기화',async()=>{
 const original=wav(176.5),first=await original.arrayBuffer();
 const output=await trimMusicGenWavToScore(original,176);
 assert.equal(output.type,'audio/wav');
 assert.equal(output.size,44+176*8000*2);
 assert.deepEqual(await original.arrayBuffer(),first);
 const view=new DataView(await output.arrayBuffer());
 assert.equal(view.getUint32(4,true)+8,output.size);
 assert.equal(view.getUint32(40,true),output.size-44);
});
test('원본 MIDI보다 짧은 모델 WAV는 저장 전에 차단',async()=>{
 await assert.rejects(trimMusicGenWavToScore(wav(175),176),/길이/);
});
