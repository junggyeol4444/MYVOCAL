import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {alignLyricNotes,isAlignmentStale,makeImportedVocalTrack,midiVocalTracks} from '../lib/lyricAlignment';
import {lyricVowel,VOWEL_NAMES,guessVowelModels,renderVowelSinging} from '../lib/singingRender';
import {genId} from '../lib/schema';
import {putFileNew,removeFile,putFilesAtomic,deleteFilesAtomic,getFile} from '../lib/assetDb';
import {persistNeuralVocalTake} from '../lib/neuralVocalPersist.js';
import {readAudioInfo} from '../lib/audioEngine';
import {assertUsableSingingWav} from '../lib/singingOutputValidation.js';
import {renderOfflineVocalGuide,renderOfflineVocalGuideSelection,guideSyllableSequence} from '../lib/offlineVocalGuide';
import {hangulHint,singingCapabilitiesView,engineModelCompatibility,buildSingingRequest,appendRenderHistory} from '../lib/singingBridge';
import {SINGING_STYLES,assertSingingStyleSupported} from '../lib/singingStyleControl.js';
import {renderLongSinging} from '../lib/longSingingRender.js';
import {generateAndStoreMvHarmony} from '../lib/mvHarmonySinging.js';
import {exportDuetVocalWav} from '../lib/duetVocalExport.js';
import {exportDuetVocalBundle} from '../lib/duetVocalBundle.js';
import {generateAndStoreMvAdlib} from '../lib/mvNeuralAdlib.js';
import {replaceProjectVoice54} from '../lib/voiceReplace54Neural.js';
import EngineManager from './EngineManager';
import RvcVoiceConversion from './RvcVoiceConversion.jsx';
import DiffSingerNeuralPanel from './DiffSingerNeuralPanel.jsx';
import SingingTakeDatasetPanel from './SingingTakeDatasetPanel.jsx';
import {readRVCPreferences} from '../lib/rvcPreferences.js';
import {convertLongSingingWithRVC} from '../lib/rvcLongConversion.js';
import {convertRegisteredRVC} from '../lib/rvcStoredConversion.js';
import {sha256File} from '../lib/voiceTraining.js';
import {isPhonemePlanStale} from '../lib/phonemePlan';

const guideVowelLabel=v=>({a:'ㅏ',eo:'ㅓ',o:'ㅗ',u:'ㅜ',eu:'ㅡ',i:'ㅣ'})[v]||v;
const guideOnsetLabel=onset=>({none:'모음',burst:'파열',fricative:'마찰',nasal:'비음',liquid:'유음'})[onset]||'모음';
const outputName=(title,kind)=>`MYVOCAL-${String(title||'Song').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,55)}-${kind}.wav`;
const format=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function safePort(text){const port=Number(text);if(!/^\d{4,5}$/.test(String(text))||!Number.isInteger(port)||port<1024||port>65535||port===58319)throw Error('엔진 포트는 1024~65535 사이(58319 제외)에서 선택하세요.');return port;}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}
export default function SingingWorkbench({project:p,data,onChange,notify}){
 const usable=(data.voices||[]).filter(v=>['self','owned','licensed'].includes(v.rights));
 const [voiceId,setVoiceId]=useState(p.voiceId||''),[modelMap,setModelMap]=useState({a:'',eo:'',i:'',u:''}),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[url,setUrl]=useState('');
 const [port,setPort]=useState(String(p.singingEngine?.port||7867)),[bridgeState,setBridgeState]=useState('연결 확인 전'),[externalModelId,setExternalModelId]=useState(p.singingEngine?.modelId||''),[status,setStatus]=useState('');
 const [capability,setCapability]=useState(null),[engineModelId,setEngineModelId]=useState(p.singingEngine?.modelId||'');
 const [singingStyle,setSingingStyle]=useState(p.singingStyle||'Natural');
 const [harmonyDirection,setHarmonyDirection]=useState('above');
 const [duetVoiceId,setDuetVoiceId]=useState(''),[duetLeadTrackId,setDuetLeadTrackId]=useState('');
 const [duetLeadCharacterId,setDuetLeadCharacterId]=useState(''),[duetSecondCharacterId,setDuetSecondCharacterId]=useState('');
 const [duetConsent,setDuetConsent]=useState(false);
 const [replacementVoiceId,setReplacementVoiceId]=useState(''),[replacementTrackId,setReplacementTrackId]=useState(''),[replacementConsent,setReplacementConsent]=useState(false);
 const [cueStart,setCueStart]=useState(1),[cueEnd,setCueEnd]=useState(4);
 const [autoRvc,setAutoRvc]=useState(false),[autoRvcRights,setAutoRvcRights]=useState(false),[sourceVocal,setSourceVocal]=useState(null),[saveNeuralTracks,setSaveNeuralTracks]=useState(false);
 const [registeredRvcModelId,setRegisteredRvcModelId]=useState('');
 const [directLongSinging,setDirectLongSinging]=useState(false);
 const latestUrl=useRef('');
 const externalAbortRef=useRef(null),latestProject=useRef(p);latestProject.current=p;
 useEffect(()=>()=>externalAbortRef.current?.abort(),[]);
 useEffect(()=>{externalAbortRef.current?.abort();},[p.id]);
 const alignment=p.vocalAlignment&&!isAlignmentStale(p,p.vocalAlignment)?p.vocalAlignment:null;
 const phonemePlan=alignment&&p.phonemePlan&&!isPhonemePlanStale(alignment,p.phonemePlan)?p.phonemePlan:null;
 const voice=usable.find(v=>v.id===voiceId)||usable[0];
 const replaceableVocalTracks=(p.tracks||[]).filter(t=>t.type==='vocal'&&!t.mute&&Array.isArray(t.clips)&&t.clips.length);
 const duetCharacters=(data.characters||[]).filter(c=>['self','owned','licensed'].includes(c.rights)&&
  (c.rights!=='licensed'||String(c.rightsNote||'').trim())&&
  (c.kind==='character'||c.kind==='person'));
 const samples=(data.voiceModels||[]).filter(m=>m.voiceId===voice?.id&&m.engineId==='sampler'&&m.status==='sample-preview-ready');
 const externalModels=(data.voiceModels||[]).filter(m=>m.voiceId===voice?.id&&m.engineId!=='sampler');
 const registeredRvcModels=(data.voiceModels||[]).filter(m=>m.engineId==='rvc'&&m.voiceId===voice?.id&&m.assetId&&/^[a-f0-9]{64}$/i.test(String(m.sha256||'')));
 useEffect(()=>{setVoiceId(p.voiceId||'');setResult(null);setStatus('');setPort(String(p.singingEngine?.port||7867));setEngineModelId(p.singingEngine?.modelId||'');setSingingStyle(p.singingStyle||'Natural');setCapability(null);setCueStart(1);setCueEnd(4);setAutoRvc(false);setAutoRvcRights(false);setRegisteredRvcModelId('');setDirectLongSinging(false);setSourceVocal(null);setReplacementVoiceId('');setReplacementTrackId('');setReplacementConsent(false);setDuetVoiceId('');setDuetLeadTrackId('');setDuetLeadCharacterId('');setDuetSecondCharacterId('');setDuetConsent(false);},[p.id]);
 useEffect(()=>{setRegisteredRvcModelId('');setAutoRvcRights(false);},[voice?.id]);
 useEffect(()=>{const suggested=guessVowelModels(samples);if(!Object.values(suggested).some(Boolean)&&samples.length)suggested.a=samples[0].id;setModelMap(suggested);setExternalModelId('')},[voice?.id,data.voiceModels]);
 useEffect(()=>()=>{if(latestUrl.current)URL.revokeObjectURL(latestUrl.current)},[]);
 const changeResult=(blob,kind,count,fileKind=kind,placement=null)=>{if(kind!=='rvc-neural')setSourceVocal(null);if(latestUrl.current)URL.revokeObjectURL(latestUrl.current);const u=URL.createObjectURL(blob);latestUrl.current=u;setUrl(u);setResult({file:new File([blob],outputName(p.title,fileKind),{type:'audio/wav'}),kind,count,placement});};
 const run=async fn=>{if(busy)return;setBusy(true);setStatus('');try{await fn()}catch(e){setStatus('오류: '+e.message);notify('가창 작업 오류: '+e.message)}finally{setBusy(false)}};
 const createSync=(longForm=false)=>{try{const synced=alignLyricNotes(p,undefined,{longForm});onChange({...p,vocalAlignment:synced});notify(longForm?'최대 360초 긴 곡 가사·MIDI 싱크를 준비했습니다. 외부 엔진으로 분할 가창 가능합니다.':'보컬 멜로디와 가사를 순서대로 연결했습니다. 음소 분석은 아닙니다.')}catch(e){notify(e.message)}};
 const guideRender=()=>run(async()=>{if(!alignment)throw Error('가사·MIDI 싱크를 먼저 준비하세요.');
  const made=renderOfflineVocalGuide(alignment,phonemePlan);changeResult(made.blob,'offline-guide',made.rendered);
  setStatus(`내장 오프라인 가창 가이드 WAV: ${made.rendered}음표, ${format(made.seconds)} · 별도 서버/음성 샘플/AI 없이 생성 (한글 음절별 모음·자음 힌트 · ${made.timedCues}개 음표에 저장된 발음 타임라인 적용)`);
  notify('PC 내부에서 오프라인 가창 가이드 WAV를 생성했습니다. 실제 사람 목소리나 AI 가창은 아닙니다.');
 });
 const guidePreview=()=>run(async()=>{if(!alignment)throw Error('가사·MIDI 싱크를 먼저 준비하세요.');
  const start=Number(cueStart),end=Math.min(Number(cueEnd),alignment.cues.length);
  const made=renderOfflineVocalGuideSelection(alignment,phonemePlan,start,end);
  changeResult(made.blob,'offline-guide-selection',made.rendered,`offline-cues-${start}-${end}`,{startSec:made.selection.startSec,sourceKey:alignment.sourceKey});
  setStatus(`선택 음표 ${start}~${end} · ${made.seconds.toFixed(2)}초 · 저장된 발음 타임라인 적용 ${made.timedCues}개 음표 · WAV 파일은 선택 구간부터 시작합니다. 프로젝트에 추가하면 원곡 ${made.selection.startSec.toFixed(2)}초에 배치됩니다.`);
  notify('선택 구간 오프라인 WAV가 생성됐습니다. 재생하거나 WAV로 저장할 수 있습니다.');
 });
 const localRender=()=>run(async()=>{if(!alignment)throw Error('가사·MIDI 싱크를 먼저 준비하세요.');if(!voice)throw Error('사용 가능한 목소리가 없습니다.');
  const made=await renderVowelSinging(alignment,voice,modelMap,samples);changeResult(made.file,'vowel-preview',made.rendered);setStatus(`모음 샘플 렌더링: ${made.rendered}음표, 건너뜀 ${made.skipped}, ${format(made.seconds)} · AI 가창 아님`);notify('샘플 기반 WAV 생성 성공. 들어보고 트랙에 추가할 수 있습니다.');
 });
 const addTrack=()=>run(async()=>{if(!result)throw Error('먼저 보컬 WAV를 생성해 주세요.');
  if(result.kind==='offline-guide-selection' && (!alignment||!result.placement||
     result.placement.sourceKey!==alignment.sourceKey))
    throw Error('가사·MIDI 원본이 변경됐습니다. 선택 구간 WAV를 다시 생성해 주세요.');
  const file=result.file,info=await readAudioInfo(file);if(!info.duration||info.duration>480)throw Error('WAV 길이가 유효하지 않습니다.');
  const assetId=genId('vocal_wav');
  // Validate the time position before writing user media to IndexedDB.
  const startSec=result.kind==='offline-guide-selection'?result.placement.startSec:0;
  const track=makeImportedVocalTrack(p,file,assetId,info.duration,startSec);
  track.name=result.kind==='rvc-neural'?'외부 Singing + RVC 신경망 보컬':result.kind==='engine'?'별도 로컬 엔진 보컬':result.kind==='offline-guide'?'내장 가창 가이드':result.kind==='offline-guide-selection'?'선택 구간 가창 가이드':'모음 샘플 보컬';
  await putFileNew(assetId,file);
  try{onChange({...p,tracks:[...p.tracks,track]});notify('보컬 WAV가 원곡의 위치를 유지한 새 오디오 트랙에 추가됐습니다.');setStatus(`WAV를 ${startSec.toFixed(2)}초 위치에 추가했습니다.`);}
  catch(e){await removeFile(assetId).catch(()=>{});throw e}
 });
 async function requestBridge(path,body,externalSignal=null){const key=window.__MYVOCAL_SESSION_KEY;if(!key)throw Error('외부 엔진 연결은 Windows EXE에서만 사용할 수 있습니다.');
  const method=body?'POST':'GET';const controller=new AbortController();const cancel=()=>controller.abort();externalSignal?.addEventListener('abort',cancel,{once:true});if(externalSignal?.aborted)controller.abort();const timeout=setTimeout(()=>controller.abort(),120000);
  try{const response=await fetch(path,{method,headers:{'X-MYVOCAL-Session':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
   if(!response.ok){const err=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(err.error||`HTTP ${response.status}`)}return response;
  }finally{clearTimeout(timeout);externalSignal?.removeEventListener('abort',cancel)}
 }
 const checkEngine=()=>run(async()=>{const number=safePort(port),res=await requestBridge(`/api/singing/health?port=${number}`);const info=await res.json();
  const cRes=await requestBridge(`/api/singing/capabilities?port=${number}`),cap=singingCapabilitiesView(await cRes.json());setCapability(cap);
  const first=cap.models.find(m=>m.id===engineModelId);if(cap.models.length&&!first)setEngineModelId(cap.models[0].id);
  setBridgeState(`${info.name||'외부 엔진'} · 연결됨 · ${cap.message}`);
  onChange({...p,singingEngine:{port:number,modelId:engineModelId||cap.models[0]?.id||''}});
  notify('엔진 접속과 모델 목록 조회를 마쳤습니다. 엔진 정보는 자체 신고이며 추론 품질을 보증하지 않습니다.');});
 const renderExternal=()=>run(async()=>{const controller=new AbortController();externalAbortRef.current=controller;try{if(!alignment)throw Error('먼저 가사·MIDI 싱크를 저장해 주세요.');if(!voice)throw Error('사용 허가가 있는 목소리를 선택해 주세요.');
  const number=safePort(port);
  let rvcConfig=null,registeredModel=null,registeredModelFile=null,registeredIndexFile=null;
  if(autoRvc){
   if(!autoRvcRights)throw Error('자동 RVC 변환에 사용할 목소리·모델 권한을 확인하세요.');
   if(capability?.mode!=='neural'||capability.inferenceReady!==true)throw Error('자동 RVC 연결은 실제 신경망 Singing 엔진에서만 사용할 수 있습니다.');
   rvcConfig=readRVCPreferences(window.localStorage);
   if(!rvcConfig)throw Error('기존 RVC 변환 패널에서 로컬 Python·엔진 실행 환경을 저장하세요.');
   if(registeredRvcModelId){
    registeredModel=registeredRvcModels.find(m=>m.id===registeredRvcModelId);
    if(!registeredModel||registeredModel.voiceId!==voice.id)
     throw Error('현재 목소리의 등록된 RVC 체크포인트를 선택하세요.');
    registeredModelFile=await getFile(registeredModel.assetId);
    if(!(registeredModelFile instanceof Blob)||await sha256File(registeredModelFile)!==registeredModel.sha256)
     throw Error('등록된 본인 음색 RVC 체크포인트 SHA-256이 일치하지 않습니다.');
    if(registeredModel.indexAssetId){
     registeredIndexFile=await getFile(registeredModel.indexAssetId);
     if(!(registeredIndexFile instanceof Blob)||!/^[a-f0-9]{64}$/i.test(String(registeredModel.indexSha256||''))||
        await sha256File(registeredIndexFile)!==registeredModel.indexSha256)
      throw Error('등록된 RVC FAISS 인덱스 SHA-256이 일치하지 않습니다.');
    }
    if(Number(rvcConfig.indexRate)>0&&!registeredIndexFile)
     throw Error('등록 모델의 FAISS 인덱스가 없으면 검색 비율을 0으로 설정하세요.');
   }
  }
    let checkpoint=externalModels.find(m=>m.id===externalModelId)||null;
  if(capability?.supported&&capability.models.length){
   const advertised=capability.models.find(m=>m.id===engineModelId);
   if(!advertised)throw Error('엔진이 제공하는 모델 목록에서 모델을 먼저 선택해 주세요.');
   checkpoint={id:advertised.id,name:advertised.name,engineId:advertised.engineId};
  }
  if(capability?.mode==='neural'&&!capability.inferenceReady)throw Error('외부 엔진이 추론 준비 상태가 아니라고 보고했습니다. 모델과 실행 환경을 확인하세요.');
  const compatibility=engineModelCompatibility(capability,checkpoint);
  if(!compatibility.ok)throw Error(compatibility.warning);
  assertSingingStyleSupported(singingStyle,capability,checkpoint);
  const styledProject=singingStyle==='Natural'?p:{...p,singingStyle};
  const longForm=alignment.longForm===true;
  let blob,chunkCount=1,sourceForSave=null;
  if(longForm&&!directLongSinging){
   const combined=await renderLongSinging(alignment,{port:number,project:styledProject,voice,model:checkpoint,
    request:async body=>{const response=await requestBridge('/api/singing/render',body,controller.signal);return response.blob();},
    phonemePlan,
    signal:controller.signal,
    onProgress:(done,total)=>{chunkCount=total;setStatus(`외부 가창 엔진 분할 처리 ${done}/${total} · 기존 프로젝트는 보존됩니다.`);}
   });
   blob=combined.wav;
  }else{
   const req=buildSingingRequest(number,styledProject,alignment,voice,checkpoint,phonemePlan);
   const res=await requestBridge('/api/singing/render',req,controller.signal);blob=await res.blob();
  }
  assertUsableSingingWav(await blob.arrayBuffer(),{maxDurationSec:longForm?360:90});
  if(autoRvc){
   setStatus('실제 Singing WAV 수신 · 로컬 RVC 신경망 음색 변환 중');
   const original=new File([blob],outputName(p.title,'singing-source'),{type:'audio/wav'});
   const rvcConversion={session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal,
    onProgress:(done,total)=>setStatus(`RVC 변환 ${done}/${total} 구간`)};
   if(registeredModelFile){
    // 현재 목소리로 학습·등록한 체크포인트 사본만 기존 EXE 인증 RVC 추론에 전달한다.
    rvcConversion.convert=(chunk,settings,options)=>convertRegisteredRVC(chunk,{
     ...settings,modelFile:registeredModelFile,indexFile:registeredIndexFile},options);
   }
   const converted=await convertLongSingingWithRVC(original,{...rvcConfig,rightsConfirmed:true},rvcConversion);
      if(controller.signal.aborted)throw Error('가창·RVC 연속 생성을 취소했습니다.');
   sourceForSave=original;
   setSourceVocal({file:original,projectId:p.id});
   changeResult(converted,'rvc-neural',alignment.cues.length,'singing-rvc');
   blob=converted;
  }else{
   setSourceVocal(null);changeResult(blob,'engine',alignment.cues.length);
  }
  const job={id:genId('singjob'),at:new Date().toISOString(),rvcModelId:registeredModel?.id||'',mode:autoRvc?'외부 Singing + RVC':'외부 엔진',result:autoRvc?'Singing/RVC WAV 두 개 수신 (품질 미검증)':longForm?'긴 곡 WAV 합성 수신':'WAV 수신',notes:alignment.cues.length,engine:capability?.name||'미확인'};
  if(saveNeuralTracks){
   if(capability?.mode!=='neural'||capability?.inferenceReady!==true)throw Error('실제 준비된 신경망 Singing 엔진에서 생성한 WAV만 보컬 자동 저장할 수 있습니다.');
   const files=sourceForSave?[sourceForSave,blob]:[blob];
   await persistNeuralVocalTake(p,files,{
    current:()=>latestProject.current,onChange,newId:genId,readInfo:readAudioInfo,
    createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic,
    signal:controller.signal,engineInfo:{port:number,modelId:checkpoint?.id||''},job
   });
   notify('실제 로컬 Singing'+(sourceForSave?' + RVC':'')+' 보컬 WAV를 별도 편집 트랙에 일괄 저장했습니다. 원본은 그대로입니다.');
  }else{
   onChange({...p,singingEngine:{port:number,modelId:checkpoint?.id||''},singingJobs:appendRenderHistory(p.singingJobs,job)});
  }
  setStatus(autoRvc?'실제 Singing WAV→RVC 음색 변환 WAV를 연속 생성했습니다. 가창 품질·모델 동일성은 별도 확인하세요.':capability?.mode==='demo'?'외부 데모 엔진에서 테스트 WAV를 받았습니다. 실제 AI 가창이 아닙니다.':longForm?(directLongSinging?'외부 엔진에 3~6분 가사·MIDI·발음 시간표를 한 번에 전달하고 실제 WAV를 수신했습니다. 모델·품질을 직접 확인하세요.':`외부 엔진 ${chunkCount}개 구간 WAV를 타임라인에 맞게 결합했습니다. 모델·품질을 직접 확인하세요. 유효한 발음 타임라인이 있으면 긴 곡의 각 구간에도 음소 힌트를 전달합니다.`):'외부 엔진에서 WAV를 받아왔습니다. 품질과 모델 종류는 직접 검증해 주세요.');notify('외부 엔진 WAV 수신 성공.');
 }finally{externalAbortRef.current=null;}
 });
 const renderRealHarmony=()=>run(async()=>{
  if(!alignment||!voice)throw Error('등록된 본인 목소리 및 한국어 가사·MIDI가 필요합니다.');
  const number=safePort(port);
  if(autoRvc&&!autoRvcRights)
   throw Error('3도 화음에 사용할 본인 음색 RVC·가창 모델 권한을 확인하세요.');
  const rvcOptions=autoRvc?readRVCPreferences(window.localStorage):null;
  if(autoRvc&&!rvcOptions)throw Error('RVC 변환 패널에서 실제 체크포인트·Python 경로를 먼저 저장하세요.');
  const model=capability?.models?.find(m=>m.id===engineModelId);
  if(!model)throw Error('실제 신경망 Singing 엔진 모델을 먼저 조회하고 선택하세요.');
  const result=await generateAndStoreMvHarmony(p,{
   voice,port:number,modelId:model.id,session:window.__MYVOCAL_SESSION_KEY,
   confirmed:true,direction:harmonyDirection,singingStyle,
   convertRVC:autoRvc,rvcOptions,
   saveOptions:{current:()=>latestProject.current,onChange,newId:genId,
    readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
    store:putFilesAtomic,rollback:deleteFilesAtomic},
   onProgress:setStatus
  });
  setStatus('신경망 3도 화음 '+result.assets+'개 독립 WAV 트랙 저장 완료 · 원본 보존');
  notify('실제 3도 화음 신경망 Singing WAV를 기존 음악 프로젝트에 추가했습니다.');
 });
 const renderRealDuet=()=>run(async()=>{
  if(!alignment||!voice||!duetConsent)throw Error('원곡 가사·MIDI와 듀엣 목소리 사용 동의를 확인하세요.');
  const second=usable.find(v=>v.id===duetVoiceId);
  const leadCharacter=duetCharacters.find(c=>c.id===duetLeadCharacterId);
  const harmonyCharacter=duetCharacters.find(c=>c.id===duetSecondCharacterId);
  if(!second||second.id===voice.id||!leadCharacter||!harmonyCharacter||
     leadCharacter.id===harmonyCharacter.id)
   throw Error('서로 다른 허가된 두 Voice와 캐릭터를 각각 선택하세요.');
  const lead=replaceableVocalTracks.find(t=>t.id===duetLeadTrackId);
  if(!lead||lead.singerVoiceId&&lead.singerVoiceId!==voice.id)
   throw Error('현재 주보컬 Voice에 대응하는 원곡의 실제 보컬 WAV 트랙을 선택하세요.');
  const model=capability?.models?.find(m=>m.id===engineModelId);
  if(!model||capability?.inferenceReady!==true)throw Error('두 번째 가수의 실제 신경망 Singing 모델을 먼저 확인하세요.');
  const result=await generateAndStoreMvHarmony(p,{
   voice:second,port:safePort(port),modelId:model.id,
   session:window.__MYVOCAL_SESSION_KEY,confirmed:true,
   direction:harmonyDirection,singingStyle,
   duet:{leadVoice:voice,leadCharacter,harmonyCharacter,leadTrackId:lead.id},
   saveOptions:{current:()=>latestProject.current,onChange,newId:genId,
    readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
    store:putFilesAtomic,rollback:deleteFilesAtomic},onProgress:setStatus
  });
  setDuetConsent(false);
  setStatus('실제 신경망 듀엣 두 Voice와 캐릭터 매핑 · 독립 WAV '+result.assets+'개 저장 완료');
  notify('두 명의 권한 있는 서로 다른 가수: 기존 원곡 WAV 보존, 두 번째 신경망 3도 화음 생성·프로젝트에 연결 완료');
 });
 const exportDuetStem=role=>run(async()=>{
  const result=await exportDuetVocalWav(p,role,{current:()=>latestProject.current});
  download(result.file,result.file.name);
  setStatus((role==='lead'?'주보컬':'화음 보컬')+' 실제 독립 WAV '+result.durationSec.toFixed(2)+'초 내보내기');
  notify('원본을 변경하지 않고 두 가수 중 선택한 실제 WAV를 내보냈습니다.');
 });
 const exportDuetBundle=()=>run(async()=>{
  const result=await exportDuetVocalBundle(p,{current:()=>latestProject.current,onProgress:setStatus});
  download(result.file,result.file.name);
  setStatus('두 가수 독립 신경망 보컬 WAV '+result.stems+'개 · '+result.durationSec.toFixed(2)+'초 ZIP 내보내기');
  notify('기존 두 가수 실제 보컬 WAV와 역할·Voice·캐릭터 연결을 단일 ZIP으로 저장했습니다.');
 });
 const renderRealAdlib=()=>run(async()=>{
  if(!alignment||!voice)throw Error('실제 신경망 Ad-lib에는 원곡 한국어 가사·MIDI와 등록 목소리가 필요합니다.');
  const number=safePort(port),model=capability?.models?.find(m=>m.id===engineModelId);
  if(!model)throw Error('실제 신경망 Singing 모델을 먼저 조회하고 선택하세요.');
  const result=await generateAndStoreMvAdlib(p,{
   voice,port:number,modelId:model.id,session:window.__MYVOCAL_SESSION_KEY,
   confirmed:true,singingStyle,
   saveOptions:{current:()=>latestProject.current,onChange,newId:genId,
    readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
    store:putFilesAtomic,rollback:deleteFilesAtomic},
   onProgress:setStatus
  });
  setStatus('원곡 MIDI의 실제 신경망 Ad-lib '+result.notes+'음표 신규 WAV 저장');
  notify('실제 신경망 Ad-lib 추임새를 독립 편집 보컬 트랙에 추가했습니다.');
 });
 const performVoiceReplace=()=>run(async()=>{
  const selectedVoice=usable.find(v=>v.id===replacementVoiceId);
  if(!selectedVoice||!replacementTrackId||!replacementConsent)
   throw Error('기존 보컬 트랙, 새로운 사용 허가 목소리 및 원본 음소거 동의를 선택하세요.');
  const portNumber=safePort(port);
  const model=capability?.models?.find(m=>m.id===engineModelId);
  if(!model)throw Error('실제 로컬 신경망 가창 모델을 먼저 확인하세요.');
  const result=await replaceProjectVoice54(p,{
   targetTrackId:replacementTrackId,voice:selectedVoice,confirmed:replacementConsent,
   port:portNumber,modelId:model.id,singingStyle,
   session:window.__MYVOCAL_SESSION_KEY,
   current:()=>latestProject.current,onChange,newId:genId,
   readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
   store:putFilesAtomic,rollback:deleteFilesAtomic,onProgress:setStatus
  });
  setReplacementConsent(false);
  setStatus('Voice Replace 완료 · 기존 보컬은 원본 파일을 유지하며 음소거, 새 본인 음색 가창 '+result.newVocalAssets+'개 WAV 트랙 저장');
  notify('원래 캐릭터·뮤직비디오·MIDI는 그대로 두고 선택한 보컬 트랙만 안전하게 교체했습니다.');
 });
 const validCount=alignment?.cues?.filter(c=>c.lyric&&c.lyric!=='—').length||0;
 return <>
  <Panel title="Singing Workbench · v1.6" description="가사와 MIDI를 오프라인 가창 가이드 또는 녹음 샘플 기반 WAV로 렌더링합니다. 별도 호환 엔진은 선택 사항이며 신경망 AI 모델은 내장되지 않았습니다.">
   <div className="mv10-strip"><div><strong>가사와 멜로디 준비</strong><span>{alignment?`싱크 완료 · ${validCount}/${alignment.cues.length}개 가사 있는 음표`:'싱크 없음 또는 원본 변경됨'}</span></div><Button icon="wave" disabled={busy||midiVocalTracks(p).length===0} onClick={()=>createSync(false)}>가사·MIDI 싱크 생성/갱신</Button><Button icon="wave" disabled={busy||midiVocalTracks(p).length===0} onClick={()=>createSync(true)}>긴 곡 360초 싱크 생성</Button></div>
   {!midiVocalTracks(p).length&&<Notice>먼저 MIDI 피아노 롤에서 보컬 음표를 작성해 주세요.</Notice>}
   {phonemePlan?<Notice>저장된 발음 타임라인 {phonemePlan.segments.length}개 구간을 내장 오프라인 WAV의 음절 길이에도 반영합니다(한글 음절). 외부 엔진 요청에도 포함되지만 엔진마다 지원이 다릅니다.</Notice>:<Notice>저장된 발음 타임라인이 없습니다. 오프라인 가이드는 음표 길이를 음절별로 균등 배분합니다. ‘발음 타임라인’에서 생성·저장하면 음절별 길이를 조절할 수 있습니다.</Notice>}
   {alignment&&<div className="mv10-cues">{alignment.cues.slice(0,24).map((c,i)=><div key={i} title={`${c.startSec}s · MIDI ${c.pitch}`}><span>{c.lyric}</span><small>{hangulHint(c.lyric)?Object.values(hangulHint(c.lyric)).filter(Boolean).join('·'):(lyricVowel(c.lyric)?VOWEL_NAMES[lyricVowel(c.lyric)]:'기본')}</small></div>)}{alignment.cues.length>24&&<span className="mv10-remaining">+{alignment.cues.length-24}음</span>}</div>}
   <Field label="가창 목소리"><select value={voice?.id||''} onChange={e=>setVoiceId(e.target.value)}>{usable.length?usable.map(v=><option key={v.id} value={v.id}>{v.name}</option>):<option value="">등록된 사용 허가 목소리 없음</option>}</select></Field>
  </Panel>
  <Panel title="A. 내 목소리 모음 샘플로 WAV 만들기" description="ㅏ·ㅓ·ㅣ·ㅜ 샘플을 음절의 대표 모음에 맞춰 선택합니다. 자음 발음은 생성하지 않으며 자연스러운 AI 노래가 아닙니다.">
   <div className="mv10-grid">{Object.entries(VOWEL_NAMES).map(([k,label])=><Field key={k} label={`${label} 녹음 샘플`}><select value={modelMap[k]||''} onChange={e=>setModelMap(v=>({...v,[k]:e.target.value}))}><option value="">미지정 (선택된 첫 샘플 사용)</option>{samples.map(m=><option key={m.id} value={m.id}>{m.name.slice(0,48)} · {Math.round(m.sourceHz)}Hz</option>)}</select></Field>)}</div>
   {!samples.length&&<Notice>먼저 Voice Training → 로컬 보컬 샘플러에서 음성 조각을 추출해 주세요. ㅏ·ㅓ·ㅣ·ㅜ 녹음을 따로 등록하면 더 나은 구분이 가능합니다.</Notice>}
   <div className="mv7-actions"><Button variant="primary" icon="play" disabled={!alignment||!samples.length||busy} onClick={localRender}>{busy?'처리 중':'모음 샘플 WAV 생성'}</Button><Status>로컬 샘플 합성 · AI 아님</Status></div>
  </Panel>
  <Panel title="B. 내장 오프라인 가창 가이드" description="인터넷·AI 서버·설치된 보컬 모델·녹음 샘플 없이 MIDI 높이를 따라 WAV를 생성합니다. 한 음표에 '아이'처럼 여러 음절이 있으면 모음을 순서대로 연결합니다. ㄱ·ㅅ·ㄴ·ㄹ 등의 시작 소리를 짧게 암시합니다. 저장된 발음 타임라인이 있으면 한글 음절의 초성·중성·종성 시간도 따릅니다. 정확한 자음 발음이나 자연스러운 AI 가창은 아닙니다.">
   <div className="mv7-actions"><Button variant="primary" icon="wave" disabled={!alignment||busy} onClick={guideRender}>{busy?'생성 중':'오프라인 가창 가이드 WAV 생성'}</Button><Status>내장 음성 합성 · 인터넷 불필요 · AI 아님</Status></div>
   {alignment&&<>
    <div className="mv10-grid">
     <Field label="미리 듣기 시작 음표"><select aria-label="미리 듣기 시작 음표" value={Math.min(cueStart,alignment.cues.length)} onChange={e=>{const next=Number(e.target.value);setCueStart(next);if(next>cueEnd)setCueEnd(next)}}>{alignment.cues.map((c,i)=><option key={i} value={i+1}>{i+1}번 · {c.startSec.toFixed(2)}초 · {String(c.lyric||'—').slice(0,12)}</option>)}</select></Field>
     <Field label="미리 듣기 마지막 음표"><select aria-label="미리 듣기 마지막 음표" value={Math.min(Math.max(cueEnd,cueStart),alignment.cues.length)} onChange={e=>setCueEnd(Number(e.target.value))}>{alignment.cues.map((c,i)=><option key={i} value={i+1} disabled={i+1<cueStart}>{i+1}번 · {c.endSec.toFixed(2)}초 · {String(c.lyric||'—').slice(0,12)}</option>)}</select></Field>
    </div>
    <div className="mv7-actions"><Button icon="play" disabled={busy||cueStart>alignment.cues.length} onClick={guidePreview}>선택 음표 구간 미리 듣기 WAV 생성</Button><Status>선택 구간만 합성 · 로컬 처리</Status></div>
    <Notice>선택 구간 WAV를 바로 재생하거나 저장할 수 있습니다. '프로젝트 오디오 트랙에 추가'를 누르면 원곡의 시작 초에 맞춰 별도 트랙으로 배치합니다. 기존 오디오와 MIDI는 덮어쓰지 않습니다.</Notice>
   </>}
   {alignment&&<Notice>가사 발음 힌트: {alignment.cues.filter(c=>c.lyric?.trim()&&c.lyric.trim()!=='—').slice(0,5).map(c=>`${c.lyric.slice(0,8)} → ${guideSyllableSequence(c.lyric).map(s=>`${guideOnsetLabel(s.onset)}+${guideVowelLabel(s.vowel)}`).join('·')}`).join(' / ')||'가사가 있는 음표 없음'} · 한 음표 최대 24음절 · 자음 힌트는 실제 발음이 아닙니다.</Notice>}
   {!alignment&&<Notice>먼저 가사·MIDI 싱크를 생성하세요. 등록된 목소리가 없어도 실행할 수 있습니다.</Notice>}
  </Panel>
  <DiffSingerNeuralPanel project={p} onChange={onChange} notify={notify} voice={voice} registeredModels={data.voiceModels||[]}/>
  <SingingTakeDatasetPanel project={p} voice={voice} alignment={alignment} notify={notify}/>
   <RvcVoiceConversion project={p} onChange={onChange} notify={notify} sourceSuggestion={sourceVocal?.file||result?.file||null} registeredModels={data.voiceModels||[]} selectedVoiceId={voice?.id||''} voiceRights={voice?.rights||''}/>
  <Panel title="C. 별도 로컬 Singing 엔진 연결" description="Windows EXE가 같은 PC의 127.0.0.1에 사용자가 실행한 별도 로컬 프로세스로 가사·음표·모델 참조를 보내고 WAV를 받아옵니다. v1.2부터 설치된 엔진의 프로세스를 직접 시작할 수 있습니다.">
   <EngineManager port={port} onPort={setPort} requestBridge={requestBridge} notify={notify}/>
   <div className="mv10-grid"><Field label="로컬 엔진 포트"><input aria-label="외부 엔진 포트" value={port} onChange={e=>{setPort(e.target.value);setBridgeState('연결 확인 전');setCapability(null)}} placeholder="7867" inputMode="numeric"/></Field>
    <Field label="외부 체크포인트 참조 (선택)"><select value={externalModelId} onChange={e=>setExternalModelId(e.target.value)}><option value="">모델 지정 없음</option>{externalModels.map(m=><option value={m.id} key={m.id}>{m.name} ({m.engineId})</option>)}</select></Field></div>
   <Field label="Singing Style (음색 Voice와 별도)">
    <select disabled={busy} value={singingStyle} onChange={e=>{setSingingStyle(e.target.value);onChange({...p,singingStyle:e.target.value});}}>
     {SINGING_STYLES.map(style=><option value={style} key={style}>{style}</option>)}
    </select>
   </Field>
   <Field label="원곡 가사·MIDI 3도 화음 음역">
    <select disabled={busy} value={harmonyDirection} onChange={e=>setHarmonyDirection(e.target.value)}>
     <option value="above">원곡보다 위 3도</option><option value="below">원곡보다 아래 3도</option>
    </select>
   </Field>
   <Button disabled={!alignment||!voice||busy||!capability?.inferenceReady} onClick={renderRealHarmony}>
    실제 신경망 3도 화음 WAV 생성 → 신규 DAW 트랙
   </Button>
   <Button disabled={!alignment||!voice||busy||!capability?.inferenceReady} onClick={renderRealAdlib}>
    원곡 MIDI 휴지의 신경망 Ad-lib 추임새 실제 WAV 생성 → 신규 DAW 트랙
   </Button>
   <Panel title="실제 신경망 듀엣 · 원본 20·21항" description="이미 생성한 첫 번째 목소리 WAV에 다른 사용 권한 있는 가수의 실제 3도 화음 WAV를 추가합니다. 두 캐릭터의 구분과 음성 트랙 연결을 저장하며 원본 삭제·재합성은 하지 않습니다.">
    <Field label="주보컬 Voice"><input readOnly value={voice?.name||'사용 권한 있는 가수 미선택'}/></Field>
    <Field label="실제 원곡 주보컬 WAV"><select disabled={busy} value={duetLeadTrackId} onChange={e=>{setDuetLeadTrackId(e.target.value);setDuetConsent(false);}}>
     <option value="">첫 번째 가수가 부른 기존 WAV 트랙 선택</option>
     {replaceableVocalTracks.filter(t=>!t.singerVoiceId||t.singerVoiceId===voice?.id).map(t=><option key={t.id} value={t.id}>{t.name||t.id}</option>)}
    </select></Field>
    <Field label="두 번째 신경망 가창 Voice"><select disabled={busy} value={duetVoiceId} onChange={e=>{setDuetVoiceId(e.target.value);setDuetConsent(false);}}>
     <option value="">원곡과 다른 사용자 허가 목소리 선택</option>
     {usable.filter(v=>v.id!==voice?.id&&(v.rights!=='licensed'||String(v.rightsNote||'').trim())).map(v=><option key={v.id} value={v.id}>{v.name||v.id}</option>)}
    </select></Field>
    <Field label="첫 번째 가수 캐릭터"><select disabled={busy} value={duetLeadCharacterId} onChange={e=>{setDuetLeadCharacterId(e.target.value);setDuetConsent(false);}}>
     <option value="">원곡 가수 캐릭터 선택</option>
     {duetCharacters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></Field>
    <Field label="두 번째 가수 캐릭터"><select disabled={busy} value={duetSecondCharacterId} onChange={e=>{setDuetSecondCharacterId(e.target.value);setDuetConsent(false);}}>
     <option value="">두 번째 가수 캐릭터 선택</option>
     {duetCharacters.filter(c=>c.id!==duetLeadCharacterId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></Field>
    <label className="check-item"><input type="checkbox" disabled={busy} checked={duetConsent} onChange={e=>setDuetConsent(e.target.checked)}/> 두 목소리·캐릭터·신경망 가창 모델에 사용 권한이 있고, 두 번째 실제 WAV를 추가하는 것에 동의합니다.</label>
    <Button disabled={busy||!alignment||!voice||!capability?.inferenceReady||!duetLeadTrackId||!duetVoiceId||!duetLeadCharacterId||!duetSecondCharacterId||!duetConsent} onClick={renderRealDuet}>
     두 번째 Voice 신경망 3도 가창 → 실제 듀엣 독립 WAV·캐릭터 연결
    </Button>
    {p.duetSingers?.version===1&&<div className="mv7-actions">
     <Button disabled={busy} onClick={()=>exportDuetStem('lead')}>주보컬 실제 독립 WAV 내보내기</Button>
     <Button disabled={busy} onClick={()=>exportDuetStem('harmony')}>화음 보컬 실제 독립 WAV 내보내기</Button>
     <Button disabled={busy} onClick={exportDuetBundle}>두 가수 실제 독립 WAV 2개 ZIP 내보내기</Button>
    </div>}
   </Panel>
   <Panel title="VOICE REPLACE · 원본 54항" description="실제 새 Singing 음색 WAV가 생성·저장된 뒤에만 선택한 보컬 트랙을 음소거합니다. 이전 WAV·사진·캐릭터·MV 장면은 삭제하지 않습니다.">
    <Field label="교체 대상 기존 보컬 트랙"><select disabled={busy} value={replacementTrackId} onChange={e=>{setReplacementTrackId(e.target.value);setReplacementConsent(false);}}>
     <option value="">음소거할 기존 트랙 선택</option>
     {replaceableVocalTracks.map(t=><option key={t.id} value={t.id}>{t.name||t.id}</option>)}
    </select></Field>
    <Field label="새 Singing Voice"><select disabled={busy} value={replacementVoiceId} onChange={e=>{setReplacementVoiceId(e.target.value);setReplacementConsent(false);}}>
     <option value="">실제 등록한 목소리 선택</option>
     {usable.filter(v=>v.id!==p.voiceId).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
    </select></Field>
    <label className="check-item"><input type="checkbox" disabled={busy} checked={replacementConsent} onChange={e=>setReplacementConsent(e.target.checked)}/> 실제 새 음색 모델에 사용 권한이 있으며, 생성 성공 후 선택한 기존 보컬만 음소거하는 것에 동의합니다.</label>
    <Button disabled={busy||!replacementConsent||!replacementVoiceId||!replacementTrackId||!capability?.inferenceReady} onClick={performVoiceReplace}>
     기존 음악·MV·캐릭터 보존하고 실제 Voice Replace 실행
    </Button>
   </Panel>
   <label className="check-item"><input type="checkbox" checked={autoRvc} disabled={busy} onChange={e=>{setAutoRvc(e.target.checked);setAutoRvcRights(false)}}/>실제 신경망 Singing WAV 생성 후 저장된 RVC 모델로 음색 변환</label>
   {autoRvc&&<Field label="실제 RVC 추론 체크포인트 출처"><select disabled={busy} value={registeredRvcModelId} onChange={e=>{setRegisteredRvcModelId(e.target.value);setAutoRvcRights(false);}}>
     <option value="">기존 RVC 변환 패널의 설치된 모델 파일 경로 사용</option>
     {registeredRvcModels.map(m=><option key={m.id} value={m.id}>{m.name||m.id} · 등록 본인 음색 체크포인트{m.indexAssetId?' + FAISS':''}</option>)}
    </select></Field>}
    {autoRvc&&<label className="check-item"><input type="checkbox" checked={autoRvcRights} disabled={busy} onChange={e=>setAutoRvcRights(e.target.checked)}/>목소리·모델·가창 원본에 대한 사용 권한이 있습니다.</label>}
    {autoRvc&&registeredRvcModelId&&<Notice>현재 목소리에 등록된 체크포인트와 FAISS 인덱스의 실제 SHA-256을 확인한 뒤, 기존 Windows EXE의 로컬 RVC CUDA 추론에만 사용합니다. 기존 모델·원곡은 변경하지 않습니다.</Notice>}
   {alignment?.longForm===true&&<label className="check-item"><input type="checkbox" checked={directLongSinging} disabled={busy} onChange={e=>setDirectLongSinging(e.target.checked)}/>로컬 엔진이 360초·2048음표 전곡 요청을 지원하면 분할 없이 한 번에 Singing WAV 생성 (미지원 엔진은 해제하여 기존 분할 방식 사용)</label>}
    <label className="check-item"><input type="checkbox" checked={saveNeuralTracks} disabled={busy} onChange={e=>setSaveNeuralTracks(e.target.checked)}/>신경망 Singing 생성→RVC 음색 변환 결과까지 기존 프로젝트에 실제 WAV 트랙으로 자동 일괄 저장 (RVC 원본은 음소거 참고 트랙)</label>
   <div className="mv7-actions"><Button disabled={busy} onClick={checkEngine}>엔진 · 모델 조회</Button><Button icon="wave" variant="primary" disabled={!alignment||!voice||busy} onClick={renderExternal}>{autoRvc?'신경망 Singing → RVC 연속 생성':capability?.mode==='demo'?'데모 테스트 WAV 생성':'외부 엔진으로 보컬 WAV 생성'}</Button>{busy&&externalAbortRef.current&&<Button onClick={()=>externalAbortRef.current?.abort()}>진행 중인 가창 취소</Button>}<Status>{bridgeState}</Status></div>
   {capability&&<div className="mv11-engine"><div><strong>{capability.name||'외부 엔진'}</strong><span>모드: {capability.message} · 모델 수: {capability.models.length} · 준비 상태: {capability.inferenceReady?'엔진 신고상 준비':'준비 확인 안 됨'}</span></div>
     {capability.models.length>0&&<Field label="엔진에서 사용 가능한 모델"><select value={engineModelId} onChange={e=>setEngineModelId(e.target.value)}>{capability.models.map(m=><option key={m.id} value={m.id}>{m.name} · {m.engineId||'종류 미상'} ({m.id})</option>)}</select></Field>}
     <Notice>{capability.mode==='neural'?'신경망 모드는 외부 엔진의 자체 신고입니다. 프로그램이 AI 모델이나 학습 품질을 검증한 것은 아닙니다.':capability.mode==='demo'?'데모 엔진입니다. 실제 목소리나 가사를 부르지 않습니다.':capability.message}</Notice>
   </div>}
   <Notice>긴 곡은 최대 360초·2048음표의 별도 싱크를 사용합니다. 기본값은 각 음표 경계에서 분할 생성한 실제 WAV를 결합하며 한국어 발음 시간표도 전달합니다. 전곡 요청 지원 엔진을 사용하는 경우에만 위 옵션을 켜세요. 실제 신경망 모델·음질은 별도 확인이 필요합니다.</Notice>
   <Notice>엔진 계약: <code>GET /health</code> → JSON, <code>POST /v1/sing</code> → WAV(PCM RIFF) 응답. 연결 검사 성공은 AI 모델 학습/추론 성공을 뜻하지 않습니다. 엔진 설치 및 체크포인트 호환성은 별도로 확인해야 합니다.</Notice>
  </Panel>
  <Panel title="렌더링 결과 · 프로젝트 적용" description="내장 가창 가이드·로컬 샘플러·별도 엔진에서 생성된 WAV를 재생, 저장하거나 음악 편집 타임라인에 오디오 트랙으로 추가할 수 있습니다.">
   {result?<><div className="mv10-strip"><div><strong>{result.kind==='rvc-neural'?'외부 Singing + RVC 실제 WAV 결과':result.kind==='engine'?'별도 로컬 엔진 결과':result.kind==='offline-guide'?'내장 오프라인 가창 가이드':result.kind==='offline-guide-selection'?'선택 구간 오프라인 가창 미리 듣기':'모음 샘플 기반 결과'}</strong><span>{result.count}개 음표 · {(result.file.size/1024/1024).toFixed(2)}MB</span></div><Status ready>WAV 생성됨</Status></div><audio src={url} controls className="mv10-player"/></>:<Notice>아직 렌더링된 WAV가 없습니다.</Notice>}
   <div className="mv7-actions"><Button icon="download" disabled={!result||busy} onClick={()=>download(result.file,result.file.name)}>WAV 저장</Button><Button icon="plus" variant="primary" disabled={!result||busy} onClick={addTrack}>프로젝트 오디오 트랙에 추가</Button>{sourceVocal?.projectId===p.id&&<Button icon="download" disabled={busy} onClick={()=>download(sourceVocal.file,sourceVocal.file.name)}>변환 전 Singing 원본 WAV 저장</Button>}</div>
   {status&&<Notice>{status}</Notice>}
  </Panel>
  <Panel title="최근 보컬 생성 기록" description="프로젝트별 최근 20개 작업의 결과와 사용한 엔진을 저장합니다. WAV 원본은 트랙에 추가해야 유지됩니다.">
   {(p.singingJobs||[]).length? <div className="mv11-history">{[...(p.singingJobs||[])].reverse().map(j=><div key={j.id}><strong>{j.mode} · {j.result}</strong><span>{j.at?.slice(0,19).replace('T',' ')} · {j.notes}음표 · {j.engine}</span></div>)}</div>:<Notice>기록된 외부 보컬 생성 작업이 없습니다.</Notice>}
  </Panel>
  <Notice>보컬의 정체성과 권리는 등록된 목소리의 사용 권한을 확인한 뒤 선택해 주세요. 이 기능은 오프라인 모음 가이드를 합성하거나 기존 음성 조각을 조합하고, 명시적으로 선택한 별도 로컬 엔진에 요청을 보내는 도구입니다. 내장 신경망 보컬 학습 모델은 포함되어 있지 않습니다.</Notice>
 </>;
}
