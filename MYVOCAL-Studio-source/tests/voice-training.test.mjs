import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {TRAINING_ENGINES,assessTrainingData,createTrainingPlan,packageTrainingPlan,validateCheckpoint,buildCheckpointRecord,sampleEntries} from '../src/lib/voiceTraining.js';
const voice={id:'v1',name:'TEST SINGER',style:'Natural',rights:'self',assets:[{id:'a1',fileName:'a.wav',capturePromptId:'middle-a',analysis:{duration:10,clippedPercent:0,meanRmsDb:-18,voicedFrames:90,voicedPercent:75}},{id:'a2',fileName:'b.wav',capturePromptId:'low-a',analysis:{duration:9,clippedPercent:0,meanRmsDb:-20,voicedFrames:80,voicedPercent:70}}]};
test('engines are explicitly marked disconnected',()=>{assert.equal(TRAINING_ENGINES.length,3);assert.ok(TRAINING_ENGINES.every(e=>e.connected===false))});
test('preflight is advisory and never claims AI-trained',()=>{const p=assessTrainingData(voice);assert.equal(p.passed,2);assert.equal(p.labeled,2);assert.ok(p.issues.some(s=>s.includes('3개 미만')))});
test('unauthorized and empty voices cannot make a plan',()=>{assert.throws(()=>createTrainingPlan({...voice,rights:'reference'}),/본인 또는 사용 허가/);assert.throws(()=>createTrainingPlan({...voice,assets:[]}),/샘플/)});
test('training plan snapshots data and is not a queued job',()=>{const p=createTrainingPlan(voice,{engineId:'rvc',preset:'high',notes:'test'});assert.equal(p.status,'prepared');assert.equal(p.sampleSnapshot.length,2);assert.equal(p.engineId,'rvc');assert.equal(p.quality.permitted,true)});
test('portable ZIP contains manifest, plan contract, unchanged raw audio, readme',async()=>{
 const plan=createTrainingPlan(voice,{engineId:'svc'});
 const raw=new Uint8Array([1,2,3,4]);
 const result=await packageTrainingPlan(plan,voice,async()=>({name:'voice.wav',size:raw.length,type:'audio/wav',arrayBuffer:async()=>raw.buffer}));
 assert.equal(result.manifest.samples.length,2);assert.equal(result.descriptor.engineConnected,false);assert.equal(result.descriptor.status,'DATASET_ONLY');
 assert.ok(result.bytes.length>raw.length*2);
 assert.ok(new TextDecoder().decode(result.bytes).includes('training-plan.json'));
 assert.ok(new TextDecoder().decode(result.bytes).includes('manifest.json'));
 assert.ok(new TextDecoder().decode(result.bytes).includes('README.txt'));
});
test('deleted snapshot sample prevents stale export',async()=>{const plan=createTrainingPlan(voice);await assert.rejects(()=>packageTrainingPlan(plan,{...voice,assets:voice.assets.slice(1)},async()=>({size:100,arrayBuffer:async()=>new Uint8Array(100).buffer})),/삭제/)});
test('checkpoint checks format size and rights, record remains unverified',()=>{
 const file={name:'voice.safetensors',size:4096};assert.ok(validateCheckpoint(file,voice));
 assert.throws(()=>validateCheckpoint({...file,name:'voice.exe'},voice),/확장자/);
 assert.throws(()=>validateCheckpoint({...file,size:210*1024*1024},voice),/200MB/);
 assert.throws(()=>validateCheckpoint(file,{...voice,rights:'reference'}),/권한/);
 const rec=buildCheckpointRecord(voice,file,'00','generic','x1');assert.equal(rec.singingCompatible,false);assert.equal(rec.status,'imported-unverified');
});
test('old profiles with original assetId remain eligible for data collection',()=>{const old={id:'v2',name:'Old',rights:'self',assetId:'original-id',fileName:'file.wav',analysis:null};assert.equal(sampleEntries(old).length,1);assert.equal(assessTrainingData(old).total,1)});

test('training ZIP manifest tracks SHA-256 fingerprints of the actual raw recordings',async()=>{
 const plan=createTrainingPlan(voice,{engineId:'rvc'});
 const raw=Uint8Array.of(1,2,3,4,250,251);
 const packageResult=await packageTrainingPlan(plan,voice,async()=>new File([raw],'same.wav',{type:'audio/wav'}));
 const expected=createHash('sha256').update(raw).digest('hex');
 assert.equal(packageResult.manifest.samples.length,2);
 for(const sample of packageResult.manifest.samples)assert.equal(sample.sha256,expected);
});
test('training plan refuses duplicate recording IDs rather than packaging same sample twice',async()=>{
 const duplicate={...voice,assets:[voice.assets[0],voice.assets[0]]};
 assert.throws(()=>createTrainingPlan(duplicate),/중복/);
 const plan=createTrainingPlan(voice);
 plan.sampleSnapshot.push({...plan.sampleSnapshot[0]});
 await assert.rejects(packageTrainingPlan(plan,voice,async()=>new File(['sample'],'s.wav')),/중복/);
});
