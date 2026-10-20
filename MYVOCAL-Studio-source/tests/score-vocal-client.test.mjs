import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=new URL('../src/lib/scoreVocalClient.js',import.meta.url);
const code=(await readFile(source,'utf8')).replace(
 "import {assertUsableSingingWav} from './singingOutputValidation.js';",
 `function assertUsableSingingWav(b){const x=new Uint8Array(b);if(x.length<44||String.fromCharCode(...x.subarray(0,4))!=='RIFF'||String.fromCharCode(...x.subarray(8,12))!=='WAVE')throw Error('WAV 검사 실패');}`);
const {scoreVocalNotes,renderRecordedScoreVocal}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function wav(){
 const n=44100*2,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
 for(const [p,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)v.setUint8(p+i,s.charCodeAt(i));
 v.setUint32(4,buf.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(10000*Math.sin(i/32)),true);
 return new File([buf],'guide.wav',{type:'audio/wav'});
}
const alignment={format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,cues:[{startSec:0,endSec:.8,pitch:69,lyric:'안'},{startSec:.85,endSec:1.7,pitch:72,lyric:'녕'}]};
const settings={python:'C:\\AI\\python.exe',strength:1,rightsConfirmed:true};
test('real user MIDI note values retained in score',()=>{assert.deepEqual(scoreVocalNotes(alignment),[{startSec:0,endSec:.8,pitch:69},{startSec:.85,endSec:1.7,pitch:72}])});
test('Windows EXE session, rights, score, WAV transport',async()=>{
 let calls=0;
 const request=async(path,opt)=>{
  calls++;assert.equal(path,'/api/singing/score-vocal');assert.equal(opt.headers['X-MYVOCAL-Session'],'session');
  assert.equal(opt.body.get('rights'),'confirmed');assert.equal(opt.body.get('python'),settings.python);
  assert.equal(JSON.parse(opt.body.get('score')).notes.length,2);
  return {ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>wav()};
 };
 const file=await renderRecordedScoreVocal(wav(),alignment,settings,{session:'session',request});
 assert.equal(calls,1);assert.equal(file.size,wav().size);
});
test('optional harmony requests a semitone interval',async()=>{
 const request=async(_,opt)=>{assert.equal(opt.body.get('interval'),'-5');return {ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>wav()};};
 const file=await renderRecordedScoreVocal(wav(),alignment,{...settings,interval:-5},{session:'session',request});
 assert.match(file.name,/-5/);
});
test('rights, bad score, invalid path, missing session rejected before request',async()=>{
 for(const [a,s] of [[alignment,{...settings,rightsConfirmed:false}],[alignment,{...settings,python:'./python.exe'}],[{...alignment,cues:[{startSec:0,endSec:361,pitch:69}]},settings]]){
  await assert.rejects(renderRecordedScoreVocal(wav(),a,s,{session:'session',request:()=>{throw Error('unexpected network')}}));
 }
 await assert.rejects(renderRecordedScoreVocal(wav(),alignment,settings,{session:''}),/세션/);
});
test('failed real renderer error is not reported as a generated WAV',async()=>{
 const request=async()=>({ok:false,status:502,json:async()=>({error:'로컬 Python 음정 보정 실패'})});
 await assert.rejects(renderRecordedScoreVocal(wav(),alignment,settings,{session:'session',request}),/실패/);
});
