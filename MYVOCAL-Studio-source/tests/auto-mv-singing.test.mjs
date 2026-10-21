import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAndStoreMvSinging} from '../src/lib/autoMvSinging.js';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
const singer={id:'own-voice',name:'본인 목소리',rights:'self'};
function makeProject(){
 const source={id:'project1',title:'한국어 신경망 노래',bpm:120,lyrics:'안녕',
 tracks:[{id:'original-user-song',type:'vocal',instrument:'synth',
  midiNotes:[{pitch:60,startBeat:0,length:1,velocity:100},{pitch:62,startBeat:1,length:1,velocity:95}]}],
 scenes:[{id:'original-scene',start:0,end:4}]};
 return {...source,vocalAlignment:alignLyricNotes(source)};
}
function wav(seconds=2){
 const rate=8000,frames=Math.round(seconds*rate),bytes=new Uint8Array(44+frames*2),v=new DataView(bytes.buffer);
 for(const [at,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)bytes[at+i]=text.charCodeAt(i);
 v.setUint32(4,bytes.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++)v.setInt16(44+i*2,Math.round(14000*Math.sin(2*Math.PI*220*i/rate)),true);
 return new Blob([bytes],{type:'audio/wav'});
}
const cap={supported:true,protocol:'MYVOCAL_SINGING_V1',mode:'neural',inferenceReady:true,
 name:'설치된 로컬 신경망',models:[{id:'korean-model',name:'한국어 모델',engineId:'neural'}]};
function runOptions(project,state={},opts={}){
 let n=0;
 return {port:7867,voice:singer,modelId:'korean-model',session:'private-session',confirmed:true,
 saveOptions:{current:()=>project,onChange:p=>{state.savedProject=p;},newId:p=>p+'-'+(++n),
  readInfo:async()=>({duration:2}),
  createTrack:(_p,_wav,id,length)=>({clips:[{assetId:id,duration:length}]}),
  store:async rows=>{state.assetRows=rows;},rollback:async ids=>{state.deleted=ids;}},
 request:async(url,init)=>{
  if(url.startsWith('/api/singing/capabilities'))return {ok:true,json:async()=>cap};
  if(url.startsWith('/api/singing/render')){
   state.inference=(state.inference||0)+1;
   assert.equal(init.method,'POST');assert.equal(init.headers['X-MYVOCAL-Session'],'private-session');
   assert.equal(JSON.parse(init.body).voice.id,singer.id);
   return {ok:true,blob:async()=>wav(2)};
  }
  throw Error('unexpected route '+url);
 },...opts};
}
test('one click MYVOCAL native pipeline renders real neural Korean singing and creates an editable audio asset',async()=>{
 const original=makeProject(),state={};const result=await generateAndStoreMvSinging(original,runOptions(original,state));
 assert.equal(result.neuralSinging,true);assert.equal(result.convertedWithRVC,false);
 assert.equal(state.inference,1);assert.equal(state.assetRows.length,1);
 assert.equal(state.savedProject.tracks.length,2);
 assert.strictEqual(state.savedProject.tracks[0],original.tracks[0]);
 assert.equal(state.savedProject.tracks[1].mute,false);
 assert.equal(original.tracks.length,1);
});
test('one click Korean Singing plus real installed RVC model saves original and converted take separately',async()=>{
 const original=makeProject(),state={};let converted=0;
 const opts=runOptions(original,state,{convertRVC:true,rvcOptions:{root:'D:/RVC',python:'D:/RVC/python.exe',model:'D:/RVC/voice.pth'},
 convert:async(file,options,{session})=>{converted++;
  assert.equal(file.type,'audio/wav');assert.equal(session,'private-session');assert.equal(options.rightsConfirmed,true);
  return wav(2);}
 });
 const result=await generateAndStoreMvSinging(original,opts);
 assert.equal(converted,1);assert.equal(result.vocalAssets,2);
 assert.equal(state.savedProject.tracks.length,3);
 assert.equal(state.savedProject.tracks[1].mute,true);
 assert.equal(state.savedProject.tracks[2].mute,false);
 assert.equal(state.deleted,undefined);
});
test('demo or unready engine cannot make placeholder vocals or touch old project',async()=>{
 const original=makeProject(),state={},ops=runOptions(original,state);
 ops.request=async()=>({ok:true,json:async()=>({...cap,mode:'demo',inferenceReady:false})});
 await assert.rejects(generateAndStoreMvSinging(original,ops),/신경망/);
 assert.equal(state.assetRows,undefined);assert.equal(state.savedProject,undefined);
});
test('invalid singing outputs are refused without claiming inference success',async()=>{
 const original=makeProject(),state={},ops=runOptions(original,state);
 ops.request=async(url)=>{
  if(url.includes('capabilities'))return {ok:true,json:async()=>cap};
  return {ok:true,blob:async()=>new Blob(['fake WAV'],{type:'audio/wav'})};
 };
 await assert.rejects(generateAndStoreMvSinging(original,ops),/WAV/);
 assert.equal(state.assetRows,undefined);
});
test('cancelled and changed projects never create new voice files',async()=>{
 const original=makeProject(),state={},ctrl=new AbortController();
 await assert.rejects(generateAndStoreMvSinging(original,runOptions(original,state,{signal:(ctrl.abort(),ctrl.signal)})),/취소/);
 assert.equal(state.assetRows,undefined);
 const changed=runOptions(original,state);changed.saveOptions.current=()=>({...original,id:'someone-else'});
 await assert.rejects(generateAndStoreMvSinging(original,changed),/프로젝트 전환/);
 assert.equal(state.savedProject,undefined);
});
test('live auto MV button connects actual singing infer, optional RVC, PCM saving and full video capture',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync(new URL('../src/components/LocalMvBatchPanel.jsx',import.meta.url),'utf8');
 assert.match(s,/generateAndStoreMvSinging\(vocalProject/);
 assert.match(s,/runMusicProductionPipeline/);
 assert.match(s,/runFullLocalMv/);
 assert.match(s,/readRVCPreferences/);
 assert.match(s,/saveOptions:\{current,onChange:commit/);
});
