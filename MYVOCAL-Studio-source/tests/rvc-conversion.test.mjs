import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRVCSettings,convertVoiceWithRVC} from '../src/lib/rvcVoiceConversion.js';
import {pcmMonoToWav} from '../src/lib/offlineVocalGuide.js';
const settings={root:'C:\\RVC',python:'C:\\RVC\\runtime\\python.exe',model:'C:\\RVC\\assets\\weights\\self.pth',f0:'pm',pitch:0,indexRate:0,rightsConfirmed:true};
const validBlob=()=>new File([pcmMonoToWav(new Float32Array(22050).fill(.12),22050)],'source.wav',{type:'audio/wav'});
test('RVC form includes original WAV and config while preserving original',async()=>{
 const file=validBlob();let calls=0;
 const result=await convertVoiceWithRVC(file,settings,{session:'session',request:async(path,options)=>{
  calls++;assert.equal(path,'/api/singing/rvc/convert');assert.equal(options.headers['X-MYVOCAL-Session'],'session');
  assert.equal(options.body.get('audio').size,file.size);assert.equal(options.body.get('model'),settings.model);assert.equal(options.body.get('rights'),'confirmed');
  return {ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>file};
 }});
 assert.equal(calls,1);assert.equal(result.size,file.size);assert.equal(file.name,'source.wav');
});
test('missing Windows session and invalid model never sends requests',async()=>{
 let calls=0;const request=()=>{calls++};const file=validBlob();
 await assert.rejects(convertVoiceWithRVC(file,settings,{request}),/Windows EXE/);
 await assert.rejects(convertVoiceWithRVC(file,{...settings,model:'untrained.zip'},{session:'sess',request}),/\.pth/);
 assert.equal(calls,0);
});
test('reject server failure and silent/incompatible WAV without calling it a real model',async()=>{
 const file=validBlob();
 await assert.rejects(convertVoiceWithRVC(file,settings,{session:'sess',request:async()=>({ok:false,json:async()=>({error:'RVC model missing'})})}),/RVC model missing/);
 await assert.rejects(convertVoiceWithRVC(file,settings,{session:'sess',request:async()=>({ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>new Blob(['not a WAV'])})}),/손상된 WAV/);
});
test('index rate and pitch constraints enforced',()=>{
 const file=validBlob();
 for(const wrong of [{pitch:30},{indexRate:NaN},{f0:'fake'},{python:'bash'}])assert.throws(()=>validateRVCSettings(file,{...settings,...wrong}));
});