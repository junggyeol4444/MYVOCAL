import test from 'node:test';
import assert from 'node:assert/strict';
import {queryLocalMp4Status,convertRecordedWebMToMP4,MAX_MP4_WEBM_BYTES} from '../src/lib/mvMp4Export.js';
const webm=new Blob([Uint8Array.from([26,69,223,163]),'webm-sample'],{type:'video/webm'});
const mp4=new Blob([Uint8Array.from([0,0,0,16]),'ftypisomxxxxxxxxxxxxxxxxxxxxxxxx'],{type:'video/mp4'});
test('No Windows session means no network request',async()=>{
 let calls=0;const request=async()=>{calls++};
 assert.equal((await queryLocalMp4Status({request})).ready,false);
 await assert.rejects(convertRecordedWebMToMP4(webm,{request}),/Windows EXE/);
 assert.equal(calls,0);
});
test('FFmpeg availability is explicit',async()=>{
 const success=await queryLocalMp4Status({session:'s',request:async()=>({ok:true,json:async()=>({ready:true,message:'installed'})})});
 assert.equal(success.ready,true);
 const missing=await queryLocalMp4Status({session:'s',request:async()=>({ok:true,json:async()=>({ready:false,message:'missing'})})});
 assert.equal(missing.ready,false);
});
test('Real MP4 response and protected local session',async()=>{
 const result=await convertRecordedWebMToMP4(webm,{session:'s',request:async(url,req)=>{
  assert.equal(url,'/api/video/mp4');assert.equal(req.headers['X-MYVOCAL-Session'],'s');
  assert.equal(req.headers['Content-Type'],'video/webm');assert.equal(req.body,webm);
  return {ok:true,headers:{get:()=> 'video/mp4'},blob:async()=>mp4};
 }});
 assert.equal(result.size,mp4.size);
});
test('No misleading MP4 on invalid input/output or server errors',async()=>{
 const badResult=async()=>({ok:true,headers:{get:()=> 'video/mp4'},blob:async()=>new Blob(['fake'],{type:'video/mp4'})});
 await assert.rejects(convertRecordedWebMToMP4(webm,{session:'s',request:badResult}),/MP4 파일/);
 await assert.rejects(convertRecordedWebMToMP4(new Blob(['wrong'],{type:'video/mp4'}),{session:'s'}),/WebM/);
 await assert.rejects(convertRecordedWebMToMP4(new Blob([new Uint8Array(MAX_MP4_WEBM_BYTES+1)],{type:'video/webm'}),{session:'s'}),/96MiB/);
 await assert.rejects(convertRecordedWebMToMP4(webm,{session:'s',request:async()=>({ok:false,status:422,json:async()=>({error:'encoder failed'})})}),/encoder failed/);
});
