import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNeuralStemPcm,assertDistinctNeuralStems} from '../src/lib/neuralStemPcmIntegrity.js';
function wav(fn,{seconds=2,rate=8000,channels=1}={}){
 const frames=seconds*rate,bytes=new Uint8Array(44+frames*channels*2),v=new DataView(bytes.buffer);
 for(const [at,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for(let i=0;i<4;i++)bytes[at+i]=tag.charCodeAt(i);
 v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);
 v.setUint16(32,channels*2,true);v.setUint16(34,16,true);v.setUint32(40,bytes.length-44,true);
 for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++)v.setInt16(44+(i*channels+ch)*2,fn(i,ch),true);
 return bytes;
}
const sine=i=>Math.round(12000*Math.sin(2*Math.PI*220*i/8000));
const bass=i=>Math.round(12000*Math.sin(2*Math.PI*110*i/8000));
test('독립 신경망 악기 PCM은 WAV 원본을 변경하지 않고 분석',()=>{
 const input=wav(sine),before=input.slice(),p=analyzeNeuralStemPcm(input);
 assert.equal(p.frames,16000);assert.deepEqual(input,before);
});
test('두 악기의 파형이 같으면 저장 전 거부',()=>{
 const a=analyzeNeuralStemPcm(wav(sine));
 assert.throws(()=>assertDistinctNeuralStems(a,analyzeNeuralStemPcm(wav(sine))),/사실상 동일/);
});
test('동일 파형의 음량 차이와 위상 반전도 중복 처리',()=>{
 const a=analyzeNeuralStemPcm(wav(sine));
 assert.throws(()=>assertDistinctNeuralStems(a,analyzeNeuralStemPcm(wav(i=>Math.round(sine(i)*.5)))),/동일/);
 assert.throws(()=>assertDistinctNeuralStems(a,analyzeNeuralStemPcm(wav(i=>-sine(i)))),/동일/);
});
test('다른 음정·악기 파형은 통과',()=>{
 const a=analyzeNeuralStemPcm(wav(sine)),b=analyzeNeuralStemPcm(wav(bass));
 assert.ok(Math.abs(assertDistinctNeuralStems(a,b).correlation)<.1);
});
test('무음과 직류 신호를 악기 WAV에서 거부',()=>{
 assert.throws(()=>analyzeNeuralStemPcm(wav(()=>0)),/무음/);
 assert.throws(()=>analyzeNeuralStemPcm(wav(()=>1000)),/무음/);
});
test('RIFF 크기·채널 오류로부터 원본과 기존 트랙 보호',()=>{
 const damaged=wav(sine);damaged[0]=0;
 assert.throws(()=>analyzeNeuralStemPcm(damaged),/컨테이너/);
 const bad=wav(sine);new DataView(bad.buffer).setUint32(4,50,true);
 assert.throws(()=>analyzeNeuralStemPcm(bad),/크기/);
 const stereo=analyzeNeuralStemPcm(wav((i,ch)=>ch?sine(i):bass(i),{channels:2}));
 assert.throws(()=>assertDistinctNeuralStems(stereo,analyzeNeuralStemPcm(wav(sine))),/샘플레이트/);
});
