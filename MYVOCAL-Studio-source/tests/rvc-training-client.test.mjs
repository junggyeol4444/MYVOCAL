import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrainerSettings,startLocalRVCTraining,getLocalRVCTrainingStatus,cancelLocalRVCTraining,getLocalRVCTrainedModel} from '../src/lib/rvcTrainingClient.js';
const options={root:'D:\\RVC',python:'D:\\RVC\\python.exe',script:'D:\\RVC\\train.py',voiceId:'self-1',rightsConfirmed:true,args:'["--dataset","{dataset}","--output","{output}"]'};
test('training requires real explicit installed script, data and output arguments',()=>{
 assert.equal(validateTrainerSettings(options).length,4);
 assert.throws(()=>validateTrainerSettings({...options,rightsConfirmed:false}),/권한/);
 assert.throws(()=>validateTrainerSettings({...options,args:'["--input","{dataset}"]'}),/output/);
 assert.throws(()=>validateTrainerSettings({...options,script:'danger.bat'}),/스크립트/);
});
test('real async local training job only starts from an authenticated EXE session',async()=>{
 let requests=0;
 const form=new Blob([new Uint8Array(120)],{type:'application/zip'});
 const request=async(url,settings)=>{requests++;assert.equal(url,'/api/training/rvc/start');assert.equal(settings.headers['X-MYVOCAL-Session'],'key');assert.equal(settings.body.get('voiceId'),'self-1');return {ok:true,json:async()=>({id:'0123456789abcdef01234567',state:'running'})}};
 await assert.rejects(startLocalRVCTraining(form,options,{request}),/세션/);
 assert.equal(requests,0);
 const job=await startLocalRVCTraining(form,options,{session:'key',request});assert.equal(job.state,'running');assert.equal(requests,1);
});
test('training status and stop do not require a background browser',async()=>{
 const request=async(url)=>({ok:true,json:async()=>url.endsWith('/status')?{state:'running',modelAvailable:false}:{stopping:true}});
 assert.equal((await getLocalRVCTrainingStatus({session:'key',request})).state,'running');
 assert.equal((await cancelLocalRVCTraining({session:'key',request})).stopping,true);
});
test('no nonexistent or fake result is imported as RVC model',async()=>{
 await assert.rejects(getLocalRVCTrainedModel('not-id',{session:'key'}),/ID/);
 await assert.rejects(getLocalRVCTrainedModel('0123456789abcdef01234567',{session:'key',request:async()=>({ok:true,headers:{get:()=> 'text/html'},blob:async()=>new Blob(['html'])})}),/유형/);
});