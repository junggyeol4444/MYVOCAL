// MYVOCAL v0.7 — portable preparation contracts, NOT an actual trainer.
// Training jobs below are preparation records; no model is executed or trained.
import {getFile} from './assetDb.js';
import {checkSampleQuality,voiceDatasetManifest} from './voiceDataset.js';
import {makeZip} from './zipStore.js';
import {genId,now} from './schema.js';

export const TRAINING_ENGINES=Object.freeze([
 {id:'generic',name:'범용 학습 데이터셋',type:'dataset-only',description:'원본 오디오 + 메타데이터 준비. 별도의 학습 프로그램 필요',connected:false},
 {id:'rvc',name:'RVC 계열 · 외부 학습용',type:'external',description:'외부 RVC 환경이 별도로 필요하며 여기서는 학습 실행을 지원하지 않음',connected:false},
 {id:'svc',name:'SVC 계열 · 외부 학습용',type:'external',description:'외부 SVC 환경이 별도로 필요하며 여기서는 학습 실행을 지원하지 않음',connected:false}
]);
export const getTrainingEngine=id=>TRAINING_ENGINES.find(e=>e.id===id)||null;
export const TRAINING_PRESETS=Object.freeze([
 {id:'draft',name:'데이터셋 점검',description:'현재 자료와 품질 경고를 검토하는 준비 단계'},
 {id:'standard',name:'표준',description:'일반적인 학습 준비 메타데이터를 기록'},
 {id:'high',name:'고품질',description:'품질 및 발음 균형을 더 엄격하게 검토'}
]);
export const sampleEntries=voice=>[...(voice?.assetId?[{id:voice.assetId,fileName:voice.fileName,analysis:voice.analysis,capturePromptId:voice.capturePromptId||'',notes:voice.notes||''}]:[]),...(voice?.assets||[])];
export function assessTrainingData(voice){
 const samples=sampleEntries(voice),issues=[];
 const permitted=!!voice&&['self','owned','licensed'].includes(voice.rights);
 if(!permitted)issues.push('이 자료는 학습 권한이 확인된 프로필이 아닙니다.');
 if(!samples.length)issues.push('음성 원본이 없습니다.');
 const passed=samples.filter(s=>checkSampleQuality(s.analysis).status==='usable').length;
 const labeled=new Set(samples.filter(s=>checkSampleQuality(s.analysis).status==='usable'&&s.capturePromptId).map(s=>s.capturePromptId));
 if(passed<3)issues.push('신호 품질 통과 샘플이 3개 미만입니다. 추가 녹음을 권장합니다.');
 if(labeled.size<6)issues.push(`12가지 녹음 가이드 중 품질 통과 ${labeled.size}가지입니다. 발음·음역 균형을 확인하세요.`);
 const seconds=samples.reduce((a,s)=>a+(Number(s.analysis?.duration)||0),0);
 if(seconds<30)issues.push('총 오디오 길이가 30초 미만입니다. 대개 학습에 충분하지 않습니다.');
 const attention=samples.filter(s=>checkSampleQuality(s.analysis).status==='attention').length;
 if(attention)issues.push(`품질 점검이 필요한 샘플이 ${attention}개 있습니다.`);
 return {permitted,total:samples.length,passed,labeled:labeled.size,seconds:Math.round(seconds),issues};
}
export function createTrainingPlan(voice,{engineId='generic',preset='standard',notes=''}={}){
 if(!voice)throw Error('목소리 프로필을 선택해야 합니다.');
 const engine=getTrainingEngine(engineId);
 if(!engine)throw Error('지원되지 않는 학습 준비 형식입니다.');
 if(!TRAINING_PRESETS.some(p=>p.id===preset))throw Error('알 수 없는 준비 옵션입니다.');
 const quality=assessTrainingData(voice);
 if(!quality.permitted)throw Error('본인 또는 사용 허가가 있는 목소리만 학습 준비할 수 있습니다.');
 if(!quality.total)throw Error('음성 샘플을 하나 이상 등록해 주세요.');
 const samples=sampleEntries(voice);
 return {id:genId('train'),voiceId:voice.id,voiceName:voice.name,createdAt:now(),updatedAt:now(),status:'prepared',engineId,preset,notes:String(notes||'').slice(0,500),quality,
  sampleIds:samples.map(x=>x.id),sampleSnapshot:samples.map(s=>({id:s.id,fileName:s.fileName||'',capturePromptId:s.capturePromptId||'',notes:s.notes||'',analysis:s.analysis?Object.fromEntries(['duration','analyzedSeconds','medianHz','lowNote','highNote','clippedPercent','meanRmsDb','voicedPercent','voicedFrames','frames'].map(k=>[k,s.analysis[k]]).filter(([,v])=>v!==undefined)):null})),
  notice:'데이터셋 준비 기록이며 학습 작업이 실행되거나 대기열에 등록된 것이 아닙니다.'};
}
const safeName=name=>String(name||'voice').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,48)||'voice';
function extension(file){return (file.name||'').match(/\.(wav|mp3|ogg|m4a|webm|flac|aac)$/i)?.[0]?.toLowerCase()||'.audio';}
export async function packageTrainingPlan(plan,voice,loadFile=getFile){
 if(!plan||!voice||plan.voiceId!==voice.id)throw Error('작업의 목소리 정보가 일치하지 않습니다.');
 if(!assessTrainingData(voice).permitted)throw Error('권한 있는 목소리 프로필만 내보낼 수 있습니다.');
 if(!getTrainingEngine(plan.engineId))throw Error('지원하지 않는 외부 학습 형식입니다.');
 if(!Array.isArray(plan.sampleSnapshot)||!plan.sampleSnapshot.length)throw Error('준비된 샘플이 없습니다.');
 const entries=[],records=[];let bytes=0;
 for(let i=0;i<plan.sampleSnapshot.length;i++){
  const snapshot=plan.sampleSnapshot[i];
  // Do not silently use another voice's assets or silently incorporate newer recordings.
  if(!sampleEntries(voice).some(s=>s.id===snapshot.id))throw Error(`샘플 ${i+1}이 원래 목소리 프로필에서 삭제되었습니다. 새 준비 작업을 만들어 주세요.`);
  const file=await loadFile(snapshot.id);
  if(!file||!file.size)throw Error(`샘플 ${i+1} 원본을 찾을 수 없습니다. 백업을 확인해 주세요.`);
  bytes+=file.size;
  if(bytes>150*1024*1024)throw Error('학습 데이터가 150MB를 넘습니다. 파일을 나누어 준비해 주세요.');
  const path=`audio/sample-${String(i+1).padStart(3,'0')}${extension(file)}`;
  entries.push({name:path,data:new Uint8Array(await file.arrayBuffer())});
  records.push({...snapshot,path,type:file.type||'',bytes:file.size});
 }
 const manifest=voiceDatasetManifest(voice,records);
 const descriptor={format:'MYVOCAL_TRAINING_PLAN',version:1,id:plan.id,voiceId:plan.voiceId,voiceName:plan.voiceName,createdAt:plan.createdAt,
  engineId:plan.engineId,engineConnected:false,preset:plan.preset,notes:plan.notes||'',status:'DATASET_ONLY',
  samples:records.length,qualityAtCreation:plan.quality,
  contract:{inputManifest:'manifest.json',audioDirectory:'audio/',outputModel:'external-import-only',singingEngineConnected:false},
  notice:'Export only. No training executed. No RVC/SVC-specific preprocessing or model conversion is included.'};
 const encoder=new TextEncoder();
 entries.unshift({name:'manifest.json',data:encoder.encode(JSON.stringify(manifest,null,2))},
  {name:'training-plan.json',data:encoder.encode(JSON.stringify(descriptor,null,2))},
  {name:'README.txt',data:encoder.encode('MYVOCAL v0.7 training preparation bundle\nNo AI training has been performed. External software must preprocess the data for its particular model format and perform training separately.\nThe voice owner must have permission to use all samples.\nImport an external checkpoint back into MYVOCAL via Voice Training, not into the current singing engine (unconnected).\n')});
 return {bytes:makeZip(entries),fileName:safeName(plan.voiceName)+'-'+plan.id+'-training-prep.zip',descriptor,manifest};
}
export async function sha256File(file){
 if(!globalThis.crypto?.subtle?.digest)throw Error('SHA-256을 계산할 수 없는 환경입니다.');
 const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateCheckpoint(file,voice){
 if(!voice||!['owned','self','licensed'].includes(voice.rights))throw Error('등록 권한을 확인해 주세요.');
 if(!file||!file.size)throw Error('체크포인트 파일을 선택하세요.');
 if(!/\.(pth|pt|onnx|ckpt|safetensors)$/i.test(file.name||''))throw Error('지원 파일 확장자: .pth, .pt, .onnx, .ckpt, .safetensors');
 if(file.size>200*1024*1024)throw Error('200MB 이하의 체크포인트만 로컬 저장할 수 있습니다.');
 return true;
}
export const buildCheckpointRecord=(voice,file,sha256,engineId='generic',assetId='')=>({id:genId('model'),voiceId:voice.id,name:file.name,engineId,assetId,bytes:file.size,sha256,createdAt:now(),status:'imported-unverified',singingCompatible:false,notice:'외부에서 만든 파일을 저장한 것입니다. 파일 형식과 내용이 검증되거나 AI 가창 엔진에 연결된 것은 아닙니다.'});
