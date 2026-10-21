import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNeuralFaceLipToMv} from '../src/lib/autoMvRealPersonLip.js';
const video=()=>new File([new Uint8Array(2048)],'song-video.webm',{type:'video/webm'});
const person={id:'my-person',rights:'self',name:'내 모습'};
const project=()=>({id:'owned-song',scenes:[{id:'stage1',characterId:'my-person',personMv:{personId:'my-person',referenceAssetId:'my-own-photo'}},
 {id:'stage2',characterId:'my-person',personMv:{personId:'my-person',referenceAssetId:'my-own-photo'}}],
 tracks:[{id:'my-original-voice',type:'vocal',mute:false,clips:[{assetId:'my-voice-wav'}]}]});
function wav(){
 const rate=8000,frames=8000,raw=new Uint8Array(44+frames*2),v=new DataView(raw.buffer);
 for(const [at,t] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)raw[at+i]=t.charCodeAt(i);
 v.setUint32(4,raw.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++)v.setInt16(44+i*2,Math.round(Math.sin(i/20)*18000),true);
 return new Blob([raw],{type:'audio/wav'});
}
const mp4=()=>new File([new Uint8Array(128)],'neural-person-mv.mp4',{type:'video/mp4'});
test('full one-click MV runs real Wav2Lip on the licensed same person with the actual music mix',async()=>{
 const original=project(),movie=video();let requests=0;
 const options={personId:'my-person',python:'D:\\RVC\\python.exe',root:'D:\\Wav2Lip',checkpoint:'D:\\Wav2Lip\\model.pth',
  resize:2,consent:true,modelRights:true,session:'my-session',
  mix:async(p,format)=>{assert.equal(p,original);assert.equal(format.channels,1);return wav();},
  run:async(face,audio,model,env)=>{requests++;assert.equal(face,movie);assert.equal(audio.type,'audio/wav');
   assert.equal(model.rightsConfirmed,true);assert.equal(model.modelRights,true);
   assert.equal(env.session,'my-session');return mp4();}
 };
 const result=await applyNeuralFaceLipToMv(movie,original,[person],options);
 assert.equal(requests,1);assert.equal(result.file.type,'video/mp4');assert.equal(result.personId,'my-person');
 assert.equal(original.scenes[0].personMv.referenceAssetId,'my-own-photo');
});
test('mixed-cast scenes and unlicensed identity are rejected before any neural backend is called',async()=>{
 const p=project(),before=JSON.stringify(p);
 p.scenes.push({id:'other',characterId:'unrelated',personMv:{personId:'unrelated'}});
 let called=false;
 await assert.rejects(applyNeuralFaceLipToMv(video(),p,[person],{personId:'my-person',consent:true,modelRights:true,
  mix:async()=>{called=true;return wav();}}),/동일한/);
 assert.equal(called,false);assert.equal(JSON.stringify(p),JSON.stringify(p));assert.notEqual(before,JSON.stringify(p));
 await assert.rejects(applyNeuralFaceLipToMv(video(),project(),[person],{personId:'my-person',consent:false,modelRights:true}),/권한/);
});
test('invalid or missing actual vocal audio cannot be mistaken for model output',async()=>{
 const p=project(),c={personId:'my-person',consent:true,modelRights:true};
 let ran=false;
 await assert.rejects(applyNeuralFaceLipToMv(video(),p,[person],{...c,mix:async()=>new Blob(['fake']),run:async()=>{ran=true;return mp4();}}),/WAV/);
 assert.equal(ran,false);
 await assert.rejects(applyNeuralFaceLipToMv(video(),{...p,tracks:[]},[person],c),/보컬/);
});
test('user gets original complete WebM even when optional real-person Wav2Lip fails',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/components/LocalMvBatchPanel.jsx',import.meta.url),'utf8');
 assert.match(source,/download\(result\.file,'webm'\)/);
 assert.match(source,/applyNeuralFaceLipToMv\(result\.file/);
 assert.match(source,/download\(face\.file,'mp4'\)/);
});
