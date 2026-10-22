import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothSingingPcm16ChunkEdges} from '../src/lib/singingChunkSeam.js';
function makePcm(frames,channels=1){
 const data=new Uint8Array(44+frames*channels*2),view=new DataView(data.buffer);
 for(let i=0;i<frames*channels;i++)view.setInt16(44+i*2,12000,true);
 return {data,view};
}
test('6분 한국어 Singing의 경계 5ms만 완화하고 원본 WAV 길이 보존',()=>{
 const {data,view}=makePcm(16000),before=data.byteLength;
 const result=smoothSingingPcm16ChunkEdges(data,{startFrame:8000,frames:8000,sampleRate:8000,channels:1,fadeIn:true});
 assert.equal(result.fadeFrames,40);
 assert.ok(view.getInt16(44+8000*2,true)<12000);
 assert.equal(view.getInt16(44+8040*2,true),12000);
 assert.equal(view.getInt16(44+7999*2,true),12000);
 assert.equal(data.byteLength,before);
});
test('이전 청크 끝부분에만 페이드아웃 적용',()=>{
 const {data,view}=makePcm(16000);
 smoothSingingPcm16ChunkEdges(data,{startFrame:0,frames:8000,sampleRate:8000,channels:1,fadeOut:true});
 assert.equal(view.getInt16(44+1000*2,true),12000);
 assert.ok(view.getInt16(44+7999*2,true)<500);
});
test('스테레오 동일 강도 처리',()=>{
 const {data,view}=makePcm(16000,2);
 smoothSingingPcm16ChunkEdges(data,{startFrame:4000,frames:8000,sampleRate:8000,channels:2,fadeIn:true,fadeOut:true});
 assert.equal(view.getInt16(44+4000*4,true),view.getInt16(44+4000*4+2,true));
});
test('단일 청크는 변경하지 않으며 범위 오류도 수정하지 않음',()=>{
 const {data}=makePcm(8000),before=data.slice();
 assert.equal(smoothSingingPcm16ChunkEdges(data,{startFrame:0,frames:8000,sampleRate:8000,channels:1}).fadeFrames,0);
 assert.deepEqual(data,before);
 assert.throws(()=>smoothSingingPcm16ChunkEdges(data,{startFrame:7900,frames:500,sampleRate:8000,channels:1,fadeIn:true}),/경계/);
 assert.deepEqual(data,before);
});
