import test from 'node:test';
import assert from 'node:assert/strict';
import {combineSingingWavChunks} from '../src/lib/longSingingRender.js';
function pcm(seconds,rate=48000,channels=2){
 const frames=Math.round(seconds*rate),b=new Uint8Array(44+frames*channels*2),v=new DataView(b.buffer);
 for(const [offset,word] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for(let i=0;i<4;i++)b[offset+i]=word.charCodeAt(i);
 v.setUint32(4,b.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);
 v.setUint16(32,channels*2,true);v.setUint16(34,16,true);
 v.setUint32(40,b.length-44,true);v.setInt16(44,3276,true);
 return b;
}
test('6분 48kHz 16비트 스테레오 신경망 가창 WAV 결합에서 64MiB 제한 제거',async()=>{
 const chunk=pcm(60);
 const parts=Array.from({length:6},(_,i)=>({startSec:i*60,limitSec:(i+1)*60,requiredDurationSec:60,bytes:chunk}));
 const wav=combineSingingWavChunks(parts,360);
 assert.equal(wav.size,360*48000*2*2+44);
 const head=new DataView(await wav.slice(0,44).arrayBuffer());
 assert.equal(head.getUint32(4,true),wav.size-8);
 assert.equal(head.getUint32(40,true),wav.size-44);
});
test('분할 가창 WAV의 시간이 겹쳐 이전 샘플을 덮는 경우 거부',()=>{
 const chunk=pcm(2,8000,1);
 assert.throws(()=>combineSingingWavChunks([
  {startSec:0,limitSec:2,requiredDurationSec:1,bytes:chunk},
  {startSec:1.5,limitSec:3,requiredDurationSec:1,bytes:chunk}
 ],3),/겹치거나 순서/);
});
test('90MiB를 넘는 출력은 큰 버퍼를 쓰기 전에 거부',()=>{
 const chunk=pcm(1,96000,2);
 assert.throws(()=>combineSingingWavChunks([{startSec:0,limitSec:360,bytes:chunk}],360),/90MiB/);
});
