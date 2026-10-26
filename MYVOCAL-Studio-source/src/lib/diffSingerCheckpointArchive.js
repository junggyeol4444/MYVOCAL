// Store the ACTUAL locally trained DiffSinger acoustic weights and Korean
// dictionary as new, separate IndexedDB assets before publishing a Voice model.
// The installed checkpoint, recordings and existing model records are read-only.
import {downloadDiffSingerWeights,downloadDiffSingerTrainingDictionary} from './diffSingerTrainingClient.js';
import {officialDiffSingerModelFromJob} from './diffSingerVoiceRegistry.js';
import {parseDiffSingerDictionary} from './diffSingerNative.js';
import {putFilesAtomic,deleteFilesAtomic} from './assetDb.js';
import {genId} from './schema.js';
import {sha256File} from './voiceTraining.js';

export async function registerCompletedDiffSingerModel(job,voice,{
 session,registeredModels=[],add,isCurrent=()=>true,
 downloadWeights=downloadDiffSingerWeights,
 downloadDictionary=downloadDiffSingerTrainingDictionary,
 save=putFilesAtomic,rollback=deleteFilesAtomic,
 makeId=genId,hash=sha256File
}={}){
 const record=officialDiffSingerModelFromJob(job,voice);
 if(typeof add!=='function'||typeof isCurrent!=='function'||
    typeof downloadWeights!=='function'||typeof downloadDictionary!=='function'||
    typeof save!=='function'||typeof rollback!=='function'||
    typeof makeId!=='function'||typeof hash!=='function')
  throw Error('가창 모델 자산 저장과 Voice Library 연결 기능이 필요합니다.');
 if(!Array.isArray(registeredModels)||registeredModels.some(m=>m?.id===record.id))
  throw Error('이미 등록된 DiffSinger 모델을 덮어쓰지 않습니다.');
 const requireCurrent=()=>{
  if(!isCurrent())throw Error('가창 Voice 또는 학습 작업이 변경됐습니다. 원본은 유지됩니다.');
 };
 requireCurrent();
 // Fetch the real checkpoint, not a placeholder or merely a local path.
 const weights=await downloadWeights(job.id,{session});
 requireCurrent();
 const dictionary=await downloadDictionary(job.id,{session});
 requireCurrent();
 if(!(weights instanceof Blob)||weights.size<4096||weights.size>500*1024*1024||
    !/\.(?:ckpt|pth)$/i.test(weights.name||''))
  throw Error('실제 DiffSinger 가중치 파일 형식 또는 용량이 올바르지 않습니다.');
 if(!(dictionary instanceof Blob)||dictionary.size<10||dictionary.size>2*1024*1024)
  throw Error('실제 한국어 음소 사전 파일이 올바르지 않습니다.');
 parseDiffSingerDictionary(await dictionary.text());
 const checkpointAssetId=makeId('diffsinger_acoustic_checkpoint');
 const dictionaryAssetId=makeId('diffsinger_dictionary');
 if(!checkpointAssetId||!dictionaryAssetId||checkpointAssetId===dictionaryAssetId)
  throw Error('신규 DiffSinger 가중치와 발음 사전 자산 ID가 충돌했습니다.');
 const [checkpointSha256,dictionarySha256]=await Promise.all([hash(weights),hash(dictionary)]);
 requireCurrent();
 Object.assign(record,{
  checkpointAssetId,checkpointSha256,checkpointName:weights.name,
  checkpointBytes:weights.size,dictionaryAssetId,dictionarySha256,
  dictionaryName:dictionary.name,
  notice:'실제 공식 Acoustic 가중치와 한국어 발음 사전을 신규 로컬 자산으로 보존했습니다. 설치된 DiffSinger 원본 체크포인트는 그대로 유지합니다. 별도 보코더 및 GPU 추론 호환성은 아직 검증되지 않았습니다.'
 });
 // Both files commit together. If metadata cannot be published, only the two
 // newly created IDs are rolled back; no pre-existing asset is ever deleted.
 await save([[checkpointAssetId,weights],[dictionaryAssetId,dictionary]]);
 try{
  requireCurrent();
  await Promise.resolve(add('voiceModels',record));
 }catch(error){
  try{await rollback([checkpointAssetId,dictionaryAssetId]);}
  catch(rollbackError){
   throw Error('새 모델 기록 저장 실패, 신규 가중치·사전 보존됨: '+
    rollbackError.message+' / 원인: '+error.message);
  }
  throw error;
 }
 return record;
}
