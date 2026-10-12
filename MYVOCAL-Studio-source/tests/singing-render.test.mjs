import test from 'node:test';
import assert from 'node:assert/strict';
import {lyricVowel,guessVowelModels,validateVowelRender,renderVowelSinging} from '../src/lib/singingRender.js';
const voice={id:'v1',rights:'self'};
const models=[{id:'a1',voiceId:'v1',engineId:'sampler',status:'sample-preview-ready',assetId:'wav1',sourceHz:220,sourcePromptId:'middle-a'},{id:'i1',voiceId:'v1',engineId:'sampler',status:'sample-preview-ready',assetId:'wav2',sourceHz:330,sourcePromptId:'high-i'}];
const alignment={format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,cues:[{pitch:69,startSec:0,endSec:.2,lyric:'아',velocity:95},{pitch:72,startSec:.2,endSec:.4,lyric:'이',velocity:90}]};
test('Korean vowel groups map deterministically',()=>{for(const [ch,v] of Object.entries({'아':'a','가':'a','어':'eo','여':'eo','이':'i','우':'u','규':'u','가나':'a','hello':null,'—':null}))assert.equal(lyricVowel(ch),v);});
test('sample records auto match labeled vowel guides',()=>{assert.deepEqual(guessVowelModels(models),{a:'a1',eo:'',i:'i1',u:''});});
test('permission and cross-voice model are rejected',()=>{assert.throws(()=>validateVowelRender(alignment,{...voice,rights:'reference'},{a:'a1'},models),/허가/);assert.throws(()=>validateVowelRender(alignment,voice,{a:'bad'},models),/샘플 모델/);});
test('validated cue durations and chosen models',()=>{assert.deepEqual(validateVowelRender(alignment,voice,{a:'a1',i:'i1'},models),{seconds:.6000000000000001,notes:2});});
test('vowel render writes real RIFF WAV through offline audio adapter',async()=>{
 let sources=0;const decode={sampleRate:44100};
 const offline={destination:{},createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){sources++},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){}}),startRendering:async()=>({getChannelData:()=>Float32Array.from({length:26460},(_,i)=>Math.sin(i/12)*.12)})};
 const contextFactory=async k=>k==='decode'?{decodeAudioData:async()=>decode}:offline;
 const result=await renderVowelSinging(alignment,voice,{a:'a1',i:'i1'},models,{loadFile:async()=>new Blob([new Uint8Array(32)]),contextFactory});
 assert.equal(result.rendered,2);assert.equal(sources,2);assert.ok(result.file.size>30000);
 const tag=String.fromCharCode(...new Uint8Array(await result.file.slice(0,12).arrayBuffer()));assert.match(tag,/RIFF.{4}WAVE/);
});
