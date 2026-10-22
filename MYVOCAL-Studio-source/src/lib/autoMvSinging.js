// Native MYVOCAL Windows Studio one-click vocal stage: existing authorized
// lyric/MIDI score -> REAL installed neural Singing engine -> optional local
// RVC voice conversion -> two append-only editable WAV tracks.
// This does not train a model or substitute sample/guide synthesis for singing.
import {buildSingingRequest,singingCapabilitiesView,engineModelCompatibility} from './singingBridge.js';
import {renderLongSinging} from './longSingingRender.js';
import {convertLongSingingWithRVC} from './rvcLongConversion.js';
import {convertRegisteredRVC} from './rvcStoredConversion.js';
import {getFile} from './assetDb.js';
import {sha256File} from './voiceTraining.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale} from './phonemePlan.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {persistNeuralVocalTake} from './neuralVocalPersist.js';

export async function generateAndStoreMvSinging(project,{
 voice,port,modelId='',session,convertRVC=false,rvcOptions=null,registeredRVCModel=null,confirmed=false,signal,
 request=fetch,convert=convertLongSingingWithRVC,saveOptions,onProgress=()=>{}
}={}){
 if(!project?.id||typeof session!=='string'||session.length<8||!Number.isInteger(port)||port<1024||port>65535||port===58319)
  throw Error('기존 Windows MYVOCAL EXE의 인증된 가창 엔진 포트를 확인하세요.');
 if(!voice||!['self','owned','licensed'].includes(voice.rights)||!confirmed)
  throw Error('실제 가창에 사용할 본인 또는 허가된 목소리의 사용 권한을 확인하세요.');
 if(!project.vocalAlignment||isAlignmentStale(project,project.vocalAlignment))
  throw Error('현재 곡의 가사·MIDI 싱크를 먼저 생성·저장하세요. 임의 가사를 만들어 부르지 않습니다.');
 if(!saveOptions||typeof saveOptions.current!=='function')
  throw Error('보컬 원본을 보존하는 프로젝트 저장 기능이 필요합니다.');
 if(convertRVC&&(!rvcOptions||!rvcOptions.root||!rvcOptions.python||(!registeredRVCModel&&!rvcOptions.model)))
  throw Error('저장된 실제 RVC Python·모델·원본 경로를 설정하세요.');
 const alignment=project.vocalAlignment;
 const phonemePlan=project.phonemePlan&&!isPhonemePlanStale(alignment,project.phonemePlan)?project.phonemePlan:null;
 const guard=()=>{if(signal?.aborted||saveOptions.current()!==project)throw Error('가창 생성 중 취소·프로젝트 전환: 원본을 보존합니다.');};
 const send=async(path,{method='GET',body=null}={})=>{
  guard();
  const url=path+'?port='+port;
  const res=await request(url,{method,headers:{'X-MYVOCAL-Session':session,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'});
  if(!res?.ok){const data=await res?.json?.().catch(()=>null);throw Error(data?.error||'설치된 로컬 가창 엔진 실행 실패');}
  guard();return res;
 };
 const rawCapabilities=await (await send('/api/singing/capabilities')).json();
 const capabilities=singingCapabilitiesView(rawCapabilities);
 if(capabilities.mode!=='neural'||!capabilities.inferenceReady)
  throw Error('실제 모델 추론이 준비된 로컬 신경망 Singing 엔진만 사용합니다.');
 const available=capabilities.models;
 if(!available.length)throw Error('가창 엔진에 실제 사용할 신경망 모델이 없습니다.');
 const model=available.find(m=>m.id===(modelId||available[0].id));
 if(!model)throw Error('선택한 신경망 가창 모델이 실행 서버 목록에 없습니다.');
 const checked=engineModelCompatibility(capabilities,model);
 if(!checked.ok)throw Error(checked.warning);
 onProgress('실제 한국어 신경망 Singing WAV 생성 중');
 const ask=async body=>{
  const res=await send('/api/singing/render',{method:'POST',body});
  const file=await res.blob();guard();
  if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)
   throw Error('외부 신경망 가창 엔진의 실제 WAV 응답이 잘못됐습니다.');
  assertUsableSingingWav(await file.arrayBuffer(),{maxDurationSec:90});
  return file;
 };
 let singing;
 if(alignment.longForm===true){
  const result=await renderLongSinging(alignment,{port,project,voice,model,phonemePlan,
   request:ask,signal,onProgress:(done,total)=>onProgress('실제 Singing '+done+'/'+total+' 구간 생성 중')});
  singing=result.wav;
 }else{
  singing=await ask(buildSingingRequest(port,project,alignment,voice,model,phonemePlan));
 }
 guard();
 assertUsableSingingWav(await singing.arrayBuffer(),{maxDurationSec:360});
 let output=singing;
 if(convertRVC){
  onProgress('실제 로컬 RVC 체크포인트로 본인 음색 변환 중');
  const original=new File([singing],'MYVOCAL-신경망-Singing-원본.wav',{type:'audio/wav'});
  const conversion={session,signal,
   onProgress:(done,total)=>onProgress('RVC 신경망 변환 '+done+'/'+total+' 구간 중')};
  if(registeredRVCModel){
   const record=registeredRVCModel;
   if(record.engineId!=='rvc'||record.voiceId!==voice.id||!record.assetId||
      !/^[a-f0-9]{64}$/i.test(String(record.sha256||'')))
    throw Error('본인 또는 허가된 목소리에 등록된 RVC 체크포인트를 선택하세요.');
   const modelFile=await getFile(record.assetId);
   if(!(modelFile instanceof Blob)||await sha256File(modelFile)!==record.sha256)
    throw Error('등록 RVC 체크포인트 파일과 SHA-256이 일치하지 않습니다.');
   let indexFile=null;
   if(record.indexAssetId){
    if(!/^[a-f0-9]{64}$/i.test(String(record.indexSha256||'')))
     throw Error('등록된 RVC 인덱스의 SHA-256 정보가 필요합니다.');
    indexFile=await getFile(record.indexAssetId);
    if(!(indexFile instanceof Blob)||await sha256File(indexFile)!==record.indexSha256)
     throw Error('등록 RVC FAISS 인덱스가 없거나 SHA-256이 일치하지 않습니다.');
   }
   if(Number(rvcOptions.indexRate)>0&&!indexFile)
    throw Error('등록 RVC 인덱스 검색 비율을 사용하려면 FAISS 인덱스가 필요합니다.');
   guard();
   conversion.convert=(chunk,settings,requestOptions)=>
    convertRegisteredRVC(chunk,{...settings,modelFile,indexFile},requestOptions);
   onProgress('등록된 RVC 체크포인트와 FAISS 인덱스를 실제 로컬 추론에 연결했습니다.');
  }
  output=await convert(original,{...rvcOptions,rightsConfirmed:true},conversion);
  guard();
  if(!(output instanceof Blob)||output.size<44)throw Error('RVC가 실제 WAV 파일을 생성하지 않았습니다.');
  assertUsableSingingWav(await output.arrayBuffer(),{maxDurationSec:360});
 }
 const files=convertRVC?[singing,output]:[output];
 const job={id:saveOptions.newId('singjob'),at:new Date().toISOString(),
  mode:convertRVC?'로컬 신경망 Singing + RVC':'로컬 신경망 Singing',
  result:'실제 신경망 WAV 생성 후 프로젝트 저장',notes:alignment.cues.length,engine:capabilities.name||'로컬 엔진'};
 guard();
 const saved=await persistNeuralVocalTake(project,files,{
  ...saveOptions,signal,engineInfo:{port,modelId:model.id},job
 });
 onProgress('가창 WAV '+saved.assets+'개 프로젝트 자산 저장 완료');
 return {project:saved.project,vocalAssets:saved.assets,convertedWithRVC:convertRVC,modelId:model.id,
  neuralSinging:true};
}
