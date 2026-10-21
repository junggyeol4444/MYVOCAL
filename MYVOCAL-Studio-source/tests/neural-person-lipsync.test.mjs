import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNeuralPersonLip} from '../src/lib/neuralPersonLipClient.js';

const video=()=>new File([new Uint8Array(2048)],'original-person.mp4',{type:'video/mp4'});
function audio(){
 const frames=4000,rate=22050,bytes=new Uint8Array(44+frames*2),v=new DataView(bytes.buffer);
 for(const [at,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)bytes[at+i]=text.charCodeAt(i);
 v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++)v.setInt16(44+2*i,Math.round(18000*Math.sin(2*Math.PI*220*i/rate)),true);
 return new File([bytes],'singing.wav',{type:'audio/wav'});
}
const config=()=>({python:'D:\\AI\\python.exe',root:'D:\\AI\\Wav2Lip',checkpoint:'D:\\AI\\ckpt.pth',resize:2,rightsConfirmed:true,modelRights:true});
const mp4=()=>{let bytes=new Uint8Array(1024);bytes.set(new TextEncoder().encode('ftyp'),4);return new Blob([bytes],{type:'video/mp4'});};
test('native Windows registered-person Wav2Lip executes a real inference HTTP request with isolated binary originals',async()=>{
 let sent=false;const source=video(),singing=audio(),before=new Uint8Array(await singing.arrayBuffer());
 const result=await renderNeuralPersonLip(source,singing,config(),{session:'myvocal-private',request:async(url,opts)=>{
  sent=true;assert.equal(url,'/api/mv/person/neural-lipsync');assert.equal(opts.method,'POST');
  assert.equal(opts.headers['X-MYVOCAL-Session'],'myvocal-private');
  assert.equal(opts.body.get('face').size,source.size);
  assert.equal(opts.body.get('audio').size,singing.size);
  assert.equal(opts.body.get('modelRights'),'confirmed');
  return {ok:true,headers:{get:()=> 'video/mp4'},blob:async()=>mp4()};
 }});
 assert.ok(sent);assert.equal(result.type,'video/mp4');assert.deepEqual(new Uint8Array(await singing.arrayBuffer()),before);
});
test('no permission or corrupt/fake media is never reported as a completed neural MP4',async()=>{
 const v=video(),a=audio(),c=config();
 await assert.rejects(renderNeuralPersonLip(v,a,{...c,modelRights:false},{session:'s'}),/권한/);
 await assert.rejects(renderNeuralPersonLip(v,new File(['no real wav'],'bad.wav',{type:'audio/wav'}),c,{session:'s'}),/크기|WAV/);
 await assert.rejects(renderNeuralPersonLip(v,a,c,{session:'s',request:async()=>({ok:true,headers:{get:()=> 'video/mp4'},blob:async()=>new Blob(['fake'])})}),/MP4|용량/);
});
test('neural person video UI keeps existing geometric lip sync intact and saves new MP4 asset only',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync(new URL('../src/components/PersonLipSyncEditor.jsx',import.meta.url),'utf8');
 assert.match(s,/recordPersonLipWebM/);assert.match(s,/renderNeuralPersonLip/);
 assert.match(s,/await putFileNew\(newId,result\)/);
 assert.match(s,/assets:\[\.\.\.\(character\.assets\|\|\[\]\)/);
});
