import test from 'node:test';
import assert from 'node:assert/strict';
import {extractVoicedSegment,pcmToWav,createSamplerModel,normalizeSingingNotes,projectPreviewNotes,selectSamplerSource,renderSamplerPreview,DEMO_NOTES} from '../src/lib/localVocalSampler.js';

const hz=440,rate=44100;
const signal=new Float32Array(rate*2);for(let i=0;i<signal.length;i++)signal[i]=.3*Math.sin(2*Math.PI*hz*i/rate);
const voice={id:'my_voice',name:'My Voice',rights:'self',assetId:'sound1',fileName:'my.wav',analysis:{medianHz:440,voicedFrames:44,points:[{time:.8,hz:440,confidence:.98}]}};

test('voiced fragment extraction produces tapered nonempty PCM',()=>{
 const x=extractVoicedSegment(signal,rate,voice.analysis);
 assert.ok(x.duration>.4&&x.duration<.55);assert.ok(Math.abs(x.samples[0])===0);
 assert.ok(x.samples.some(v=>Math.abs(v)>.3));
});
test('PCM encoder emits standard mono 16 bit WAV RIFF',async()=>{
 const frag=extractVoicedSegment(signal,rate,voice.analysis);const file=pcmToWav(frag.samples,rate);
 const dv=new DataView(await file.arrayBuffer());const chars=(i,len)=>Array.from({length:len},(_,j)=>String.fromCharCode(dv.getUint8(i+j))).join('');
 assert.equal(chars(0,4),'RIFF');assert.equal(chars(8,4),'WAVE');assert.equal(chars(36,4),'data');assert.equal(dv.getUint16(22,true),1);assert.equal(dv.getUint32(24,true),rate);assert.equal(dv.getUint32(40,true),frag.samples.length*2);
});
test('requires real analyzed vocal sample and explicit training rights',()=>{
 assert.equal(selectSamplerSource(voice,'sound1').hz,440);
 assert.throws(()=>selectSamplerSource(voice,'other'),/샘플을 선택/);
 assert.throws(()=>selectSamplerSource({...voice,analysis:{medianHz:0,voicedFrames:3}},'sound1'),/음정/);
});
test('sample model extracts valid audible wav and truthfully identifies DSP preview',async()=>{
 const fakeFile=new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'});
 const decoded={numberOfChannels:1,sampleRate:rate,getChannelData:()=>signal};
 const result=await createSamplerModel(voice,'sound1',{loadFile:async()=>fakeFile,decode:async()=>decoded});
 assert.equal(result.record.engineId,'sampler');assert.equal(result.record.singingCompatible,false);
 assert.equal(result.record.sourceHz,440);assert.ok(result.file.size>44100);
 await assert.rejects(()=>createSamplerModel({...voice,rights:'reference'},'sound1',{loadFile:async()=>fakeFile,decode:async()=>decoded}),/권한/);
});
test('MIDI notes normalized and limited; can select vocal or other melody',()=>{
 assert.equal(DEMO_NOTES.length,8);
 assert.deepEqual(normalizeSingingNotes([{pitch:69,startBeat:0,length:1}])[0].pitch,69);
 const project={tracks:[{name:'Drums',instrument:'drums',midiNotes:[{pitch:36,startBeat:0,length:1}]},{name:'Lead Vocal',type:'vocal',midiNotes:[{pitch:70,startBeat:1,length:2}]}]};
 assert.equal(projectPreviewNotes(project)[0].pitch,70);
 assert.equal(normalizeSingingNotes([{pitch:300,startBeat:-1,length:500}])[0].pitch,96);
 assert.equal(normalizeSingingNotes([{pitch:300,startBeat:-1,length:500}])[0].startBeat,0);
});
test('too quiet input is rejected',()=>{
 const quiet=new Float32Array(44100);assert.throws(()=>extractVoicedSegment(quiet,rate),/신호가 너무 작/);
});


test('offline WebAudio adapter renders nonempty WAV and schedules all notes',async()=>{
 let scheduled=0;
 const ctx=(kind,channels,length,rate)=>{
  if(kind==='decode')return {decodeAudioData:async()=>({duration:.52}),close:async()=>{}};
  const channel=new Float32Array(length);for(let i=0;i<length;i++)channel[i]=.02*Math.sin(2*Math.PI*440*i/rate);
  return {destination:{},createBufferSource(){return {playbackRate:{value:1},connect(){},start(){scheduled++},stop(){}}},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}}},startRendering:async()=>({getChannelData:()=>channel})};
 };
 const model={engineId:'sampler',status:'sample-preview-ready',assetId:'id',sourceHz:440};
 const result=await renderSamplerPreview(model,DEMO_NOTES,120,{loadFile:async()=>new Blob(['wav']),contextFactory:ctx});
 assert.ok(result.size>1000);assert.equal(scheduled,8);
 await assert.rejects(()=>renderSamplerPreview({...model,status:'imported-unverified'},DEMO_NOTES,120,{loadFile:async()=>new Blob(['wav']),contextFactory:ctx}),/로컬 샘플러/);
});
