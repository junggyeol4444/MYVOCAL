import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRegisteredRVC} from '../src/lib/rvcStoredConversion.js';

function wav(){
 const bytes=new Uint8Array(44+200),d=new DataView(bytes.buffer);
 for(const [at,v] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)bytes[at+i]=v.charCodeAt(i);
 d.setUint32(4,bytes.byteLength-8,true);d.setUint32(16,16,true);
 d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,22050,true);d.setUint32(28,44100,true);d.setUint16(32,2,true);d.setUint16(34,16,true);d.setUint32(40,200,true);
 return new File([bytes],'vocals.wav',{type:'audio/wav'});
}
function opts(){
 return {root:'D:\\RVC',python:'D:\\RVC\\runtime\\python.exe',pitch:0,f0:'pm',indexRate:0.5,rightsConfirmed:true,
  modelFile:new File([new Uint8Array(2048)],'voice.pth'),indexFile:new File([new Uint8Array(2048)],'voice.index')};
}
test('stored RVC uses authenticated localhost binary uploads, never manual model paths',async()=>{
 const source=wav(),original=new Uint8Array(await source.arrayBuffer());
 let sent=false;
 const result=await convertRegisteredRVC(source,opts(),{session:'private',request:async(url,init)=>{
  sent=true;assert.equal(url,'/api/singing/rvc/stored');assert.equal(init.headers['X-MYVOCAL-Session'],'private');assert.equal(init.method,'POST');
  assert.equal(init.body.get('model'),null);assert.equal(init.body.get('index'),null);
  assert.equal(init.body.get('rights'),'confirmed');
  assert.equal(init.body.get('modelUpload').size,2048);
  assert.equal(init.body.get('indexUpload').size,2048);
  return {ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>new Blob([await source.arrayBuffer()],{type:'audio/wav'})};
 }});
 assert.equal(sent,true);assert.equal(result.type,'audio/wav');assert.deepEqual(new Uint8Array(await source.arrayBuffer()),original);
});
test('stored RVC must reject absent index for nonzero retrieval and absent rights',async()=>{
 const options=opts();options.indexFile=null;
 await assert.rejects(convertRegisteredRVC(wav(),options,{session:'private',request:()=>{throw Error('model called');}}),/인덱스/);
 options.indexRate=0;options.rightsConfirmed=false;
 await assert.rejects(convertRegisteredRVC(wav(),options,{session:'private'}),/권한/);
});
test('stored RVC rejects invalid neural response instead of claiming success',async()=>{
 const options=opts();
 await assert.rejects(convertRegisteredRVC(wav(),options,{session:'private',request:async()=>({ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>new Blob(['not a WAV'])})}),/WAV|올바르지/);
});
test('stored model selector is present only for the user voice',async()=>{
 const {readFileSync}=await import('node:fs');
 const gui=readFileSync(new URL('../src/components/RvcVoiceConversion.jsx',import.meta.url),'utf8');
 const parent=readFileSync(new URL('../src/components/SingingWorkbench.jsx',import.meta.url),'utf8');
 assert.match(gui,/m\.voiceId===selectedVoiceId/);
 assert.match(gui,/sha256File\(modelFile\)/);
 assert.match(gui,/sha256File\(indexFile\)/);
 assert.match(gui,/convertRegisteredRVC\(chunk/);
 assert.match(parent,/registeredModels=\{data\.voiceModels\|\|\[\]\}/);
});
