import test from 'node:test';
import assert from 'node:assert/strict';
import {recordStageWebM} from '../src/lib/stage3dRecording.js';
import {lipSyncFromSingingAudio} from '../src/lib/audioDrivenLipSync.js';
test('a real selected vocal WAV creates both video and audio capture tracks on VRM stage',async()=>{
 const initialRAF=globalThis.requestAnimationFrame,initialCancel=globalThis.cancelAnimationFrame;
 let now=0,recorded=null,audioStarted=false,closed=false;
 const video={stopped:false,stop(){this.stopped=true}},audio={stopped:false,stop(){this.stopped=true}};
 const stream={tracks:[video],addTrack(x){this.tracks.push(x)},getTracks(){return this.tracks}};
 class FakeContext{
  async decodeAudioData(){return {duration:3}}
  createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[audio]}}}
  createBufferSource(){return {connect(){},start(){audioStarted=true},stop(){}}}
  async resume(){}
  async close(){closed=true}
 }
 class FakeRecorder{
  static isTypeSupported(){return true}
  constructor(got){recorded=got;this.state='inactive'}
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['real captured media'])});this.onstop?.()}
 }
 globalThis.requestAnimationFrame=callback=>{queueMicrotask(()=>callback(now+=1000));return now};
 globalThis.cancelAnimationFrame=()=>{};
 try{
  const blob=await recordStageWebM({canvas:{captureStream:()=>stream},duration:2,fps:24,draw:()=>{},
   audioBlob:new Blob([new Uint8Array(100)],{type:'audio/wav'}),AudioContextClass:FakeContext,MediaRecorderClass:FakeRecorder});
  assert.equal(blob.type,'video/webm');
  assert.equal(recorded,stream);
  assert.equal(stream.tracks.length,2);
  assert.equal(audioStarted,true);
  assert.equal(audio.stopped,true);
  assert.equal(video.stopped,true);
  assert.equal(closed,true);
 }finally{
  globalThis.requestAnimationFrame=initialRAF;globalThis.cancelAnimationFrame=initialCancel;
 }
});
test('real singing PCM can drive stored VRM lip movement in the last 6-minute song section',()=>{
 const sampleRate=8000,samples=new Float32Array(sampleRate*360);samples.fill(.2,sampleRate*358,sampleRate*359);
 const decoded={sampleRate,numberOfChannels:1,duration:360,getChannelData:()=>samples};
 const alignment={cues:[{lyric:'노',startSec:358,endSec:359,pitch:60}]};
 const result=lipSyncFromSingingAudio(alignment,decoded);
 assert.equal(result.cues.length,1);
 assert.equal(result.cues[0].viseme,'O');
 assert.ok(result.cues[0].startMs>=358000&&result.cues[0].endMs<=359000);
});
test('audio shorter than a VRM scene must fail instead of creating desynced output',async()=>{
 class ShortContext{
  async decodeAudioData(){return {duration:1}}
  createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[{stop(){}}]}}}
  createBufferSource(){return {connect(){},start(){},stop(){}}}
  async resume(){}
  async close(){}
 }
 const track={stop(){}};
 await assert.rejects(recordStageWebM({canvas:{captureStream:()=>({getTracks:()=>[track],addTrack(){}})},
 duration:2,fps:24,draw(){},audioBlob:new Blob([new Uint8Array(100)]),
 AudioContextClass:ShortContext,MediaRecorderClass:class {static isTypeSupported(){return true}}}),/짧습니다/);
});
