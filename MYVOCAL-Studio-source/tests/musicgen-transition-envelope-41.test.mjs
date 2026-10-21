import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothMusicGenCrossfade} from '../src/lib/musicGenTransitionEnvelope.js';
test('연결부의 시작과 끝은 원본 샘플을 유지한다',()=>{
 assert.equal(smoothMusicGenCrossfade(0),0);
 assert.equal(smoothMusicGenCrossfade(1),1);
});
test('MusicGen 연결부의 가중치는 단조 증가하고 중앙은 0.5다',()=>{
 let previous=0;
 for(let i=1;i<=100;i++){
  const current=smoothMusicGenCrossfade(i/100);
  assert.ok(current>=previous&&current<=1);previous=current;
 }
 assert.equal(smoothMusicGenCrossfade(.5),.5);
});
test('크로스페이드 시작과 끝의 기울기를 낮춰 클릭음을 완화한다',()=>{
 assert.ok(smoothMusicGenCrossfade(.01)<.01);
 assert.ok(smoothMusicGenCrossfade(.99)>.99);
});
test('잘못된 시간은 조용히 보정하지 않고 오류로 반환한다',()=>{
 for(const t of [-1,2,NaN,Infinity])assert.throws(()=>smoothMusicGenCrossfade(t),/시간 비율/);
});
