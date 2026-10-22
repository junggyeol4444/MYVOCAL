import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFreshMusicGenPcm} from '../src/lib/musicGenChunkIntegrity.js';
const part=(samples,rate=8000)=>({pcm:new Uint8Array(samples),rate,channels:1,frames:samples.length/2});
test('서로 다른 실제 PCM은 새 구간으로 인정',()=>{
 assert.equal(assertFreshMusicGenPcm(part([1,2,3,4]),part([1,2,3,5])),true);
});
test('이전 MusicGen 구간과 완전히 같은 PCM은 저장 전에 거부',()=>{
 assert.throws(()=>assertFreshMusicGenPcm(part([1,2,3,4]),part([1,2,3,4])),/동일한 WAV/);
});
test('검사 전후 원본 MusicGen PCM은 불변',()=>{
 const a=part([1,2,3,4]),b=part([1,2,3,4]),before=a.pcm.slice();
 assert.throws(()=>assertFreshMusicGenPcm(a,b));assert.deepEqual(a.pcm,before);
});
test('형식 또는 프레임 길이가 달라도 무조건 같은 구간이라고 추정하지 않음',()=>{
 assert.equal(assertFreshMusicGenPcm(part([1,2,3,4]),part([1,2,3,4],16000)),true);
 assert.equal(assertFreshMusicGenPcm(part([1,2,3,4]),part([1,2,3,4,5,6])),true);
});
test('비정상 PCM 입력은 구간 비교 전에 거부',()=>{
 assert.throws(()=>assertFreshMusicGenPcm({},part([1,2])),/PCM/);
});
