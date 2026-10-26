import React,{useEffect,useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {planMvBatch,runMvBatch} from '../lib/mvBatchProduction.js';
import {runFullLocalMv} from '../lib/fullMvProduction.js';
import {readMvLipPlacement} from '../lib/mvLipPlacement.js';
import {personPhotoAssets} from '../lib/imageToMv.js';
import {characterArtworkAssets} from '../lib/characterToMv.js';
import {automaticSingingVisemes,reviewedCharacterMouthPlacement} from '../lib/autoMvPhonemeLip.js';
import {audioEnd,readAudioInfo,mixdownWav} from '../lib/audioEngine.js';
import {runMusicProductionPipeline} from '../lib/musicProductionPipeline.js';
import {persistNeuralMusicTracks} from '../lib/musicProductionCommit.js';
import {readMusicGenPreferences} from '../lib/musicGenPreferences.js';
import {readNativeProductionPaths,storeNativeProductionPaths} from '../lib/localProductionPaths55.js';
import {makeImportedVocalTrack} from '../lib/lyricAlignment.js';
import {genId} from '../lib/schema.js';
import {putFilesAtomic,deleteFilesAtomic,getFile} from '../lib/assetDb.js';
import {exportOriginalNeuralWav,NEURAL_STEM_EXPORT_LABELS} from '../lib/neuralStemWavExport.js';
import {exportOriginalNeuralWavBundle} from '../lib/neuralStemBundleZip.js';
import {importOriginalNeuralMidiWavBundle} from '../lib/neuralStemBundleImport.js';
import {extendMvToFullSong,bindRegisteredDuetToAutoScenes} from '../lib/fullSongMvScenes.js';
import {analyzeRecordedDuetScenes,recordedDuetCueSheet} from '../lib/duetVocalSceneActivity.js';
import {generateAndStoreMvSinging} from '../lib/autoMvSinging.js';
import {generateAndStoreDiffSingerMvSinging} from '../lib/diffSingerMvSinging.js';
import {generateAndStoreDiffSingerMvHarmony} from '../lib/diffSingerMvHarmony.js';
import {generateAndStoreDiffSingerMvAdlib} from '../lib/diffSingerMvAdlib.js';
import {listedDiffSingerModels} from '../lib/diffSingerVoiceRegistry.js';
import {trainedKoreanVoiceRoute,identityReadyForMv} from '../lib/autoProductionVoiceRouting.js';
import {generateAndStoreMvHarmony} from '../lib/mvHarmonySinging.js';
import {generateAndStoreMvAdlib} from '../lib/mvNeuralAdlib.js';
import {SINGING_STYLES} from '../lib/singingStyleControl.js';
import {DIFFSINGER_EXPRESSIVE_STYLES} from '../lib/diffSingerExpressiveF0.js';
import {readRVCPreferences} from '../lib/rvcPreferences.js';
import {generateNeuralScoreForMv} from '../lib/autoMvNeuralScore.js';
import {directAutoMvScenesWithLocalAI} from '../lib/autoMvNeuralSceneDirection.js';
import {buildNeuralMusicPrompts} from '../lib/neuralMusicPromptTimeline.js';
import {planScoreMatchedMusicGenSegments} from '../lib/neuralStemScoreTiming.js';
import {renderAndStoreNeuralMidiStems} from '../lib/autoMvSourceStems.js';
import {renderAndStoreNeuralAudioStems} from '../lib/neuralInstrumentAudioStems.js';
import {getInstalledLocalModels} from '../lib/localAiComposer.js';
import {applyNeuralFaceLipToMv} from '../lib/autoMvRealPersonLip.js';
import {convertRecordedWebMToMP4} from '../lib/mvMp4Export.js';
import {persistProductionDeliverables} from '../lib/productionOutputPersist.js';
export default function LocalMvBatchPanel({project,data,checkpoint,videoModel,imagePort,imageSteps,imageSize,videoFrames,videoFps,videoSteps,videoMotion,current,commit,session,notify}){
 const cancelRef=useRef(null),stemExportCancelRef=useRef(null),duetSceneCancelRef=useRef(null);
 const dataRef=useRef(data);dataRef.current=data;
 const [includeReferences,setIncludeReferences]=useState(()=>
  project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.musicVideo===true&&
  !!project.characterId&&identityReadyForMv(project,data));
 const [duetPcmCasting,setDuetPcmCasting]=useState(false);
 const [duetSceneBusy,setDuetSceneBusy]=useState(false),[duetSceneStatus,setDuetSceneStatus]=useState('');
 const [autoVirtualSinger,setAutoVirtualSinger]=useState(()=>project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.musicVideo===true&&project.videoMode==='auto'&&!project.characterId);
 const [saveFullMovie,setSaveFullMovie]=useState(()=>project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.musicVideo===true),[fullMouth,setFullMouth]=useState(false);
 const [makeMp4,setMakeMp4]=useState(true),[exportWav,setExportWav]=useState(true);
 const [makeNeuralMusic,setMakeNeuralMusic]=useState(()=>project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.composition===true||project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.arrangement===true),[musicDuration,setMusicDuration]=useState(180);
 const [makeNeuralSinging,setMakeNeuralSinging]=useState(()=>project.productionLaunch55?.version===1&&project.productionLaunch55?.requested?.singing===true),[singingPort,setSingingPort]=useState('7867');
 const [singingVoiceId,setSingingVoiceId]=useState(project.voiceId||''),[singingRights,setSingingRights]=useState(false);
 const trainedRoute=trainedKoreanVoiceRoute(project,data);
 const [singingBackend,setSingingBackend]=useState(()=>
   project.productionLaunch55?.version===1&&trainedRoute?'diffsinger':'external');
 const [diffSingerModelId,setDiffSingerModelId]=useState(()=>
   project.productionLaunch55?.version===1?trainedRoute?.modelId||'':'');
 const [diffSingerDuetModelId,setDiffSingerDuetModelId]=useState('');
 const [singingStyle,setSingingStyle]=useState(()=>
  (project.productionLaunch55?.version===1&&
   trainedKoreanVoiceRoute(project,data)&&
   !DIFFSINGER_EXPRESSIVE_STYLES.includes(project.singingStyle))
    ?'Natural':project.singingStyle||'Natural');
 const [makeHarmony,setMakeHarmony]=useState(false),[harmonyDirection,setHarmonyDirection]=useState('above');
 const [makeDuet,setMakeDuet]=useState(false),[duetVoiceId,setDuetVoiceId]=useState('');
 const [duetLeadCharacterId,setDuetLeadCharacterId]=useState(''),[duetHarmonyCharacterId,setDuetHarmonyCharacterId]=useState('');
 const [makeNeuralAdlib,setMakeNeuralAdlib]=useState(false);
 const [alsoConvertRVC,setAlsoConvertRVC]=useState(false),[registeredRVCId,setRegisteredRVCId]=useState('');
 const [makeAutoScore,setMakeAutoScore]=useState(()=>
  project.productionLaunch55?.version===1&&
  (project.productionLaunch55?.requested?.lyrics===true||
   project.productionLaunch55?.requested?.composition===true));
 const [scoreModel,setScoreModel]=useState('');
 const [makeNeuralSceneDirection,setMakeNeuralSceneDirection]=useState(false);
 const [makeSourceStems,setMakeSourceStems]=useState(false),[soundfontDll,setSoundfontDll]=useState(()=>readNativeProductionPaths(window.localStorage).soundfontDll||''),
  [soundfontFile,setSoundfontFile]=useState(()=>readNativeProductionPaths(window.localStorage).soundfontFile||'');
 const [makeNeuralAudioStems,setMakeNeuralAudioStems]=useState(false);
 const [stemExportRole,setStemExportRole]=useState('melody'),[stemExportBusy,setStemExportBusy]=useState(false),[stemExportStatus,setStemExportStatus]=useState('');
 const [scoreModels,setScoreModels]=useState([]),[scorePrompt,setScorePrompt]=useState(project.title||'');
 const [scoreModelError,setScoreModelError]=useState('');
 // Resolve the models already installed on this Windows PC for the one-click
 // flow. Never download or silently substitute a different model.
 useEffect(()=>{
  if(project.productionLaunch55?.version!==1||
     !(project.productionLaunch55?.requested?.lyrics||
       project.productionLaunch55?.requested?.composition))return;
  let active=true;
  getInstalledLocalModels().then(names=>{
   if(!active)return;
   setScoreModels(names);
   setScoreModel(previous=>previous&&names.includes(previous)?previous:'');
   if(!names.length)setScoreModelError('PC에 설치된 로컬 작사·작곡 Ollama 모델이 없습니다.');
  }).catch(err=>{if(active)setScoreModelError('로컬 작사 모델 조회 실패: '+err.message);});
  return()=>{active=false};
 },[project.id,project.productionLaunch55?.version]);
 const [faceNeuralSync,setFaceNeuralSync]=useState(false),[personId,setPersonId]=useState('');
 const [faceRights,setFaceRights]=useState(false),[faceModelRights,setFaceModelRights]=useState(false);
 const [facePython,setFacePython]=useState(''),[faceRoot,setFaceRoot]=useState(''),[faceCheckpoint,setFaceCheckpoint]=useState('');
 const permittedPeople=(data.characters||[]).filter(c=>['self','owned','licensed'].includes(c.rights));

 const voices=(data.voices||[]).filter(v=>['self','owned','licensed'].includes(v.rights));
 const duetCharacters=(data.characters||[]).filter(c=>['self','owned','licensed'].includes(c.rights)&&
  (c.rights!=='licensed'||String(c.rightsNote||'').trim()));
 const selectedRVCSinger=voices.find(v=>v.id===(singingVoiceId||project.voiceId))||voices[0];
 const registeredRVCModels=(data.voiceModels||[]).filter(m=>
  m?.engineId==='rvc'&&m.voiceId===selectedRVCSinger?.id&&m.assetId&&m.sha256);
 const availableDiffSingerModels=listedDiffSingerModels(selectedRVCSinger,data.voiceModels||[]);
 const selectedDiffSingerModel=availableDiffSingerModels.find(model=>model.id===diffSingerModelId)||null;
 const duetSinger=voices.find(v=>v.id===duetVoiceId);
 const availableDuetDiffSingerModels=listedDiffSingerModels(duetSinger,data.voiceModels||[]);
 const selectedDuetDiffSingerModel=availableDuetDiffSingerModels.find(model=>model.id===diffSingerDuetModelId)||null;
 const [musicPaths]=useState(()=>{try{
   const prior=readMusicGenPreferences(window.localStorage);
   const saved=readNativeProductionPaths(window.localStorage);
   return {...prior,...saved};
  }catch{return {}}});
 const [musicPython,setMusicPython]=useState(musicPaths.musicPython||musicPaths.python||'');
 const [musicModelDir,setMusicModelDir]=useState(musicPaths.musicModelDir||musicPaths.modelDir||'');
 const [demucsRoot,setDemucsRoot]=useState(musicPaths.demucsRoot||'');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 let info;try{info=planMvBatch(project,{includeReferences})}catch(e){info={total:0,already:0,linked:0,error:e.message}}
 const exportSelectedStem=async()=>{
  if(busy||stemExportBusy)return;
  const source=current();
  if(!source||source.id!==project.id){setStemExportStatus('원곡 프로젝트가 변경됐습니다.');return;}
  const controller=new AbortController();stemExportCancelRef.current=controller;
  setStemExportBusy(true);setStemExportStatus('6악기 실제 PCM 시간축 확인 중');
  try{
   const result=await exportOriginalNeuralWav(source,{
    role:stemExportRole,current,loadFile:getFile,signal:controller.signal,
    onProgress:(done,total)=>setStemExportStatus('실제 원천 악기 확인 '+done+'/'+total)
   });
   const url=URL.createObjectURL(result.file),a=document.createElement('a');
   try{a.href=url;a.download=result.file.name;document.body.append(a);a.click();a.remove();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
   setStemExportStatus(NEURAL_STEM_EXPORT_LABELS[result.role]+
    ' 실제 MusicGen WAV '+result.durationSec.toFixed(2)+'초 / '+
    result.sampleRate+'Hz / '+result.frames+'프레임 다운로드 시작');
  }catch(e){setStemExportStatus('원본 보존 · 악기 내보내기 중단: '+e.message);}
  finally{stemExportCancelRef.current=null;setStemExportBusy(false);}
 };
 const exportAllNeuralStems=async()=>{
  if(busy||stemExportBusy)return;
  const source=current();
  if(!source||source.id!==project.id){setStemExportStatus('원곡 프로젝트가 변경됐습니다.');return;}
  const controller=new AbortController();stemExportCancelRef.current=controller;
  setStemExportBusy(true);setStemExportStatus('6악기 원본 PCM을 순서대로 확인하는 중');
  try{
   const result=await exportOriginalNeuralWavBundle(source,{
    current,loadFile:getFile,signal:controller.signal,
    onProgress:(step,total,detail)=>setStemExportStatus('6악기 MIDI+WAV ZIP '+step+'/'+total+' · '+detail)
   });
   if(controller.signal.aborted||current()!==source)throw Error('저장 중 취소하거나 원곡이 변경됐습니다.');
   const url=URL.createObjectURL(result.file),a=document.createElement('a');
   try{a.href=url;a.download=result.file.name;document.body.append(a);a.click();a.remove();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
   setStemExportStatus('원본 PCM 악기 WAV 6개 + 원곡 MIDI 6개 · '+result.durationSec.toFixed(2)+'초 · '+
    result.sampleRate+'Hz · '+(result.file.size/1024/1024).toFixed(1)+'MiB ZIP 저장 시작');
  }catch(e){setStemExportStatus('기존 음악·악기 파일 보존 · 6악기 내보내기 중단: '+e.message);}
  finally{stemExportCancelRef.current=null;setStemExportBusy(false);}
 };
 const importAllNeuralStems=async event=>{
  const chosen=event?.target?.files?.[0];
  if(event?.target)event.target.value='';
  if(!chosen||busy||stemExportBusy)return;
  const source=current();
  if(!source||source.id!==project.id){setStemExportStatus('가져올 원곡 프로젝트가 변경됐습니다.');return;}
  const controller=new AbortController();stemExportCancelRef.current=controller;
  setStemExportBusy(true);setStemExportStatus('실제 MIDI·원천 WAV ZIP의 13개 항목 확인 중');
  try{
   const result=await importOriginalNeuralMidiWavBundle(source,chosen,{
    current,onChange:commit,newId:genId,
    createTrack:makeImportedVocalTrack,save:putFilesAtomic,remove:deleteFilesAtomic,
    signal:controller.signal,
    onProgress:(done,total,detail)=>setStemExportStatus('원본 MIDI·WAV 읽기 '+done+'/'+total+' · '+detail)
   });
   setStemExportStatus('기존 트랙 보존 · 새 편집 MIDI '+result.midiTracks+
    '개 + 원본 WAV '+result.wavTracks+'개 추가 · '+result.durationSec.toFixed(2)+'초');
   notify('신경망 원곡 악기 MIDI·WAV 새 트랙 12개를 현재 프로젝트에 추가했습니다.');
  }catch(e){setStemExportStatus('원본 프로젝트·자산 보존 · ZIP 가져오기 중단: '+e.message);}
  finally{stemExportCancelRef.current=null;setStemExportBusy(false);}
 };
 const analyzeDuetSceneWavs=async(apply=false)=>{
  if(busy||stemExportBusy||duetSceneBusy)return;
  const source=current();
  if(!source||source.id!==project.id){setDuetSceneStatus('원곡 프로젝트가 변경됐습니다.');return;}
  const controller=new AbortController();duetSceneCancelRef.current=controller;
  setDuetSceneBusy(true);setDuetSceneStatus('실제 두 가수 WAV PCM 분석 준비 중');
  try{
   if(apply&&!includeReferences)
    throw Error('장면에 등록 인물을 배치하려면 허가된 원본 사진·원화 사용에 동의하세요.');
   const result=await analyzeRecordedDuetScenes(source,{
    loadFile:getFile,current,signal:controller.signal,onProgress:setDuetSceneStatus
   });
   if(controller.signal.aborted||current()!==source)
    throw Error('보컬 분석이 취소되거나 원곡이 변경됐습니다.');
   if(apply){
    const linked=bindRegisteredDuetToAutoScenes(result.project,
     dataRef.current?.characters||[],{includeReferences});
    if(result.updated||linked.updated)await Promise.resolve(commit(linked.project));
    setDuetSceneStatus('실제 WAV 분석 '+result.analyzed+'장면 · 가수 역할 '+
     result.updated+'개·등록 인물 '+linked.updated+'개 반영. 기존 이미지·영상 보존');
   }else{
    const cueFile=recordedDuetCueSheet(source,result);
    const url=URL.createObjectURL(cueFile),a=document.createElement('a');
    try{a.href=url;a.download=cueFile.name;document.body.append(a);a.click();a.remove();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
    setDuetSceneStatus('실제 WAV 발성량 '+result.analyzed+
     '장면 분석 완료 · 가수별 RMS와 타임라인 JSON 내보내기 시작');
   }
  }catch(e){setDuetSceneStatus('원본 보존 · 실제 듀엣 장면 분석 중단: '+e.message);}
  finally{duetSceneCancelRef.current=null;setDuetSceneBusy(false);}
 };
 const create=async()=>{
  if(busy||(!info.total&&!saveFullMovie))return;
  const controller=new AbortController();cancelRef.current=controller;setBusy(true);setMessage('시작 중…');setError('');
  let warmed=null;
  try{
   if(makeNeuralSinging&&singingBackend==='diffsinger'){
    if(!selectedDiffSingerModel||!selectedDiffSingerModel.dictionaryAssetId)
     throw Error('한 번에 MV 제작에 사용할 학습 완료 DiffSinger 모델과 발음 사전을 선택하세요.');
    if(makeHarmony&&makeDuet&&
       (!selectedDuetDiffSingerModel||!selectedDuetDiffSingerModel.dictionaryAssetId||
        !selectedDuetDiffSingerModel.dictionarySha256))
     throw Error('두 번째 가수에게 실제 학습 완료 DiffSinger 모델과 발음 사전을 지정하세요.');
   }
   if(makeNeuralSinging&&makeHarmony&&makeDuet){
    if(!includeReferences)
     throw Error('동일한 두 가수의 외형을 유지하려면 등록 사진·캐릭터 참조 이미지 사용을 선택하세요.');
    const lead=duetCharacters.find(c=>c.id===duetLeadCharacterId);
    const second=duetCharacters.find(c=>c.id===duetHarmonyCharacterId);
    const hasImage=c=>c&&(c.kind==='person'?personPhotoAssets(c):
       c.kind==='character'?characterArtworkAssets(c):[]).some(a=>a?.id);
    if(!hasImage(lead)||!hasImage(second))
     throw Error('실제 두 가수 각각에 등록된 본인·허가 원화 또는 사진이 필요합니다.');
   }
   const [width,height]=String(imageSize).split('x').map(Number);
   const base={project,data,checkpoint,videoModel,port:Number(imagePort),session:session(),
     imageSteps:Number(imageSteps),width,height,frames:Number(videoFrames),fps:Number(videoFps),videoSteps:Number(videoSteps),
     motion:Number(videoMotion),includeReferences,autoVirtualSinger,current,currentData:()=>dataRef.current,commit,signal:controller.signal};
   if(saveFullMovie){
    // Create/resume AudioContext immediately during this user click, BEFORE the
    // potentially long model inference. WebView2 may otherwise block autoplay.
    if(audioEnd(current())>0||makeNeuralMusic||makeNeuralSinging||makeSourceStems||makeNeuralAudioStems){
     const C=window.AudioContext||window.webkitAudioContext;
     if(!C)throw Error('음악 포함 MV 녹화를 지원하지 않는 WebView2입니다.');
     warmed=new C();await warmed.resume();
    }
    let lipPlacement=null;
    if(fullMouth){
     const saved=readMvLipPlacement(window.localStorage,project.id);
     lipPlacement=Object.keys(saved).length?saved:reviewedCharacterMouthPlacement(current(),dataRef.current?.characters||[]);
     if(!lipPlacement&&!(makeDuet||current()?.duetSingers?.version===1))
       throw Error('MV 입 위치 저장 또는 검토된 2D 캐릭터 입 영역이 필요합니다.');
    }
    let movieProject=base.project;
    if(makeAutoScore){
     const source=current();
     if(!source||source.id!==project.id)throw Error('신경망 작사·작곡 중 프로젝트 변경');
     const scored=await generateNeuralScoreForMv(source,{
      model:scoreModel,prompt:scorePrompt||source.title||source.prompt||'한국어 오리지널 노래',
      genre:source.genre||'K-pop',key:source.key||'C Major',targetSeconds:musicDuration,
      session:base.session,current,onChange:commit,newId:genId,signal:controller.signal,onProgress:setMessage
     });
     movieProject=scored.project;
     setMessage('한국어 AI 가사 + '+scored.tracks+'악기 MIDI + '+scored.cues+'개 음표·음소 싱크 작성 완료');
    }
    if(makeSourceStems){
     const source=current();
     if(!source||source.id!==project.id)throw Error('원천 악기 제작 중 프로젝트가 변경됐습니다.');
     const rendered=await renderAndStoreNeuralMidiStems(source,{
      python:musicPython,library:soundfontDll,soundfont:soundfontFile,gain:.2,
      session:base.session,signal:controller.signal,current,onChange:commit,newId:genId,
      readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
      save:putFilesAtomic,remove:deleteFilesAtomic,onProgress:setMessage
     });
     movieProject=rendered.project;
     setMessage('원천 MIDI 6악기 SoundFont PCM WAV를 편집 트랙으로 저장했습니다.');
    }
    if(makeNeuralAudioStems){
     const source=current();
     if(!source||source.id!==project.id)throw Error('독립 신경망 악기 생성 중 프로젝트가 변경됐습니다.');
     const result=await renderAndStoreNeuralAudioStems(source,{
      python:musicPython,modelDir:musicModelDir,
      // 실제 저장된 MIDI 곡 길이를 기준으로 구간 수를 선택한다.
      // UI 선택 길이와 원본 AI 작곡 길이가 달라도 3~6분 WAV가 잘리지 않는다.
      segments:Number(source.neuralAutoScore?.durationSec)>210?20:11,
      audible:!makeNeuralMusic,session:base.session,signal:controller.signal,
      current,onChange:commit,newId:genId,
      readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
      save:putFilesAtomic,remove:deleteFilesAtomic,onProgress:setMessage
     });
     movieProject=result.project;
     setMessage('MusicGen 개별 신경망 악기 WAV 6개를 신규 편집 트랙으로 저장했습니다.');
    }
    if(makeNeuralMusic){
     if(!musicPython||!musicModelDir||!demucsRoot)throw Error('실제 MusicGen·Demucs Python, 모델 및 폴더 경로를 입력하세요.');
     const source=current();
     if(!source||source.id!==project.id)throw Error('음악 제작 중 프로젝트가 변경됐습니다.');
     if(!includeReferences&&source.scenes.some(s=>s.personMv||s.characterMv))
      throw Error('등록된 실제 사람·캐릭터의 사진을 사용하려면 원본 참조 이미지 생성 동의 항목을 먼저 선택하세요.');
     setMessage('실제 MusicGen 연속 작곡 → Demucs 4~6개 악기 분리 → PCM 마스터링 중');
     // One-click model pipeline uses real installed models, not a silent demo.
     const scoreDuration=Number(source.neuralAutoScore?.durationSec);
     const targetSec=Number.isFinite(scoreDuration)&&scoreDuration>=150&&scoreDuration<=360?
      scoreDuration:musicDuration;
     const sections=targetSec>210?20:11;
     const timing=planScoreMatchedMusicGenSegments(targetSec,sections,{fadeSec:.5,bpm:Number(source.bpm)});
     const prompts=buildNeuralMusicPrompts(source,{segments:sections,seconds:18,crossfadeSec:.5,
      segmentSeconds:timing.segmentSeconds,
      basePrompt:source.prompt||source.title||'오리지널 한국어 노래'});
     const generated=await runMusicProductionPipeline({
      settings:{python:musicPython,modelDir:musicModelDir,prompt:source.prompt||source.title||'original Korean music',seconds:18,seed:42},
      sequence:true,segments:sections,crossfadeSec:.5,continuation:true,prompts,
      segmentSeconds:timing.segmentSeconds,trimToSeconds:timing.targetSec,
      demucs:{python:musicPython,repo:demucsRoot,model:'htdemucs',device:'auto'},
      signal:controller.signal,onProgress:setMessage
     });
     if(controller.signal.aborted||current()!==source)throw Error('음악 모델 작업 취소 또는 프로젝트 변경');
     const saved=await persistNeuralMusicTracks(source,generated,{
      current,onChange:commit,signal:controller.signal,
      info:readAudioInfo,createTrack:makeImportedVocalTrack,newId:genId,
      save:putFilesAtomic,remove:deleteFilesAtomic
     });
     if(controller.signal.aborted)throw Error('음악 생성 또는 저장 취소');
     const info=await readAudioInfo(generated.master);
     const linked=current();
     if(!linked||linked.id!==source.id)throw Error('악기 저장 후 프로젝트가 변경됐습니다.');
     // Append only new, unrendered scenes. Never overwrite existing shots.
     const filled=extendMvToFullSong(linked,info.duration,{newId:genId});
     if(filled.added){commit(filled.project);setMessage('신규 MV 장면 '+filled.added+'개 추가 후 로컬 AI 영상 생성 준비 중');}
     movieProject=current();
     setMessage('신경망 음악 + '+saved.assets+'개 PCM 악기 저장 완료. 실제 SD/SVD 영상·최종 WebM 렌더링 중');
    }
    if(makeNeuralSinging){
     let vocalProject=current();
     if(!vocalProject||vocalProject.id!==project.id)throw Error('가창 생성 중 프로젝트가 변경됐습니다.');
     const singer=(dataRef.current?.voices||[]).find(v=>v.id===(singingVoiceId||vocalProject.voiceId))
      ||(dataRef.current?.voices||[]).find(v=>['self','owned','licensed'].includes(v.rights));
     if(!singer)throw Error('등록된 본인 또는 사용 허가 목소리가 필요합니다.');
     const rvcOptions=alsoConvertRVC?readRVCPreferences(window.localStorage):null;
     const registeredRVCModel=alsoConvertRVC?registeredRVCModels.find(m=>m.id===registeredRVCId)||null:null;
     const commonOptions={
      voice:singer,session:base.session,convertRVC:alsoConvertRVC,rvcOptions,
      registeredRVCModel,confirmed:singingRights,singingStyle,signal:controller.signal,onProgress:setMessage,
      saveOptions:{current,onChange:commit,newId:genId,readInfo:readAudioInfo,
       createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic}
     };
     // Use the registered, completed Korean acoustic model directly inside
     // the EXE; do not require an unrelated HTTP Singing server on this path.
     const sung=singingBackend==='diffsinger'?
      await generateAndStoreDiffSingerMvSinging(vocalProject,{
       ...commonOptions,model:selectedDiffSingerModel
      }):await generateAndStoreMvSinging(vocalProject,{
       ...commonOptions,port:Number(singingPort),singingStyle,
       modelId:vocalProject.singingEngine?.modelId||''
      });
     if(controller.signal.aborted||current()?.id!==vocalProject.id)throw Error('신경망 가창 저장 중 취소 또는 프로젝트 변경');
     movieProject=sung.project;
     if(makeHarmony&&singingBackend==='diffsinger'){
      const secondSinger=makeDuet?voices.find(v=>v.id===duetVoiceId):null;
      const leadCharacter=makeDuet?duetCharacters.find(c=>c.id===duetLeadCharacterId):null;
      const harmonyCharacter=makeDuet?duetCharacters.find(c=>c.id===duetHarmonyCharacterId):null;
      const originalTrackIds=new Set((vocalProject.tracks||[]).map(t=>t.id));
      const leadTrack=(sung.project.tracks||[]).filter(t=>!originalTrackIds.has(t.id)&&
       t.type==='vocal'&&!t.mute).at(-1);
      if(makeDuet&&(!secondSinger||secondSinger.id===singer.id||!leadTrack||!leadCharacter||
        !harmonyCharacter||leadCharacter.id===harmonyCharacter.id))
       throw Error('두 가수의 실제 독립 모델·캐릭터·원본 보컬 WAV를 선택하세요.');
      const harmonic=await generateAndStoreDiffSingerMvHarmony(current(),{
       voice:makeDuet?secondSinger:singer,
       model:makeDuet?selectedDuetDiffSingerModel:selectedDiffSingerModel,
       session:base.session,confirmed:singingRights,singingStyle,direction:harmonyDirection,
       convertRVC:makeDuet?false:alsoConvertRVC,
       rvcOptions:makeDuet?null:rvcOptions,
       registeredRVCModel:makeDuet?null:registeredRVCModel,
       ...(makeDuet?{duet:{leadVoice:singer,leadCharacter,harmonyCharacter,leadTrackId:leadTrack.id}}:{}),
       signal:controller.signal,onProgress:setMessage,
       saveOptions:{current,onChange:commit,newId:genId,readInfo:readAudioInfo,
        createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic}
      });
      movieProject=harmonic.project;
      setMessage(makeDuet?'독립 학습한 두 DiffSinger 가수의 실제 신경망 보컬·화음·캐릭터 배치 저장':
       '등록 DiffSinger 모델로 독립된 실제 '+(harmonyDirection==='above'?'상성':'하성')+' 3도 화음 WAV 저장');
     }else if(makeHarmony){
      // 두 번째 Voice를 요청한 경우 신규 가창은 두 번째 목소리로만 생성한다.
      const secondSinger=makeDuet?voices.find(v=>v.id===duetVoiceId):null;
      const leadCharacter=makeDuet?duetCharacters.find(c=>c.id===duetLeadCharacterId):null;
      const harmonyCharacter=makeDuet?duetCharacters.find(c=>c.id===duetHarmonyCharacterId):null;
      const beforeIds=new Set((vocalProject.tracks||[]).map(t=>t.id));
      const newVocals=(sung.project.tracks||[]).filter(t=>!beforeIds.has(t.id)&&
       t.type==='vocal'&&!t.mute);
      const leadTrack=newVocals.at(-1);
      if(makeDuet&&(!secondSinger||secondSinger.id===singer.id||!leadCharacter||
        !harmonyCharacter||leadCharacter.id===harmonyCharacter.id||!leadTrack))
       throw Error('다른 Voice 2명·캐릭터 2명과 실제 원곡 신규 보컬 WAV가 필요합니다.');
      const harmonized=await generateAndStoreMvHarmony(current(),{
       voice:makeDuet?secondSinger:singer,port:Number(singingPort),modelId:sung.modelId,
       session:base.session,confirmed:singingRights,singingStyle,
       convertRVC:makeDuet?false:alsoConvertRVC,
       rvcOptions:makeDuet?null:rvcOptions,registeredRVCModel:makeDuet?null:registeredRVCModel,
       ...(makeDuet?{duet:{leadVoice:singer,leadCharacter,harmonyCharacter,leadTrackId:leadTrack.id}}:{}),
       direction:harmonyDirection,signal:controller.signal,onProgress:setMessage,
       saveOptions:{current,onChange:commit,newId:genId,readInfo:readAudioInfo,
        createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic}
      });
      movieProject=harmonized.project;
      setMessage(makeDuet?'두 사람의 실제 서로 다른 Voice 신경망 가창 WAV와 듀엣 캐릭터 매핑을 각각 저장했습니다.':
       '원곡 메인 가창과 독립 신경망 3도 화음 WAV를 각각 편집 트랙에 저장했습니다.');
     }else setMessage('실제 신경망 한국어 가창 '+sung.vocalAssets+'개 저장 → 노래·장면 동기화 MV 제작 중');
     if(makeNeuralAdlib){
      const adlibSave={current,onChange:commit,newId:genId,readInfo:readAudioInfo,
       createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic};
      const adlib=singingBackend==='diffsinger'?
       await generateAndStoreDiffSingerMvAdlib(current(),{
        voice:singer,model:selectedDiffSingerModel,session:base.session,confirmed:singingRights,singingStyle,
        signal:controller.signal,onProgress:setMessage,saveOptions:adlibSave
       }):await generateAndStoreMvAdlib(current(),{
        voice:singer,port:Number(singingPort),modelId:sung.modelId,
        session:base.session,confirmed:singingRights,singingStyle,
        signal:controller.signal,onProgress:setMessage,saveOptions:adlibSave
       });
      movieProject=adlib.project;
      setMessage('원곡 한국어 가사와 MIDI 휴지의 실제 신경망 Ad-lib '+adlib.notes+'음표를 신규 보컬 트랙에 저장했습니다.');
     }
    }
    // Extend only unrendered tail scenes to the actual WAV length.
    const finalSource=current();
    if(!finalSource||finalSource.id!==project.id)throw Error('최종 MV 제작 중 프로젝트가 변경됐습니다.');
    const finalDuration=audioEnd(finalSource);
    if(finalDuration>0&&finalDuration<=360&&finalSource.scenes.length<120){
     const filled=extendMvToFullSong(finalSource,finalDuration,{newId:genId});
     if(filled.added)await Promise.resolve(commit(filled.project));
    }
    // 노래 생성 뒤 확정된 두 명의 실제 Voice·캐릭터를 기존 자동 장면에 연결한다.
    // MusicGen이 가창보다 먼저 장면을 만든 경우에도 수동 장면·이미 생성된 영상은 보존한다.
    const duetSceneSource=current();
    if(duetSceneSource?.duetSingers?.version===1){
     if(duetSceneSource.id!==project.id)throw Error('듀엣 자동 MV 중 프로젝트가 변경됐습니다.');
     let castSource=duetSceneSource;
     if(duetPcmCasting){
      const activity=await analyzeRecordedDuetScenes(castSource,{
       loadFile:getFile,current,signal:controller.signal,onProgress:setMessage
      });
      if(activity.updated){
       await Promise.resolve(commit(activity.project));
       castSource=current();
      }
      setMessage('실제 두 가수 WAV PCM '+activity.analyzed+
       '장면 분석 · 노래 발성량으로 '+activity.updated+'개 가수 역할 지정');
     }
     const cast=bindRegisteredDuetToAutoScenes(castSource,dataRef.current?.characters||[],
      {includeReferences});
     if(cast.updated){
      await Promise.resolve(commit(cast.project));
      setMessage('듀엣 자동 장면 '+cast.updated+'개에 두 가수별 실제 등록 원본 사진·원화를 연결했습니다.');
     }
    }
    if(makeAutoScore&&makeNeuralSceneDirection){
     const source=current();
     if(!source||source.id!==project.id)throw Error('MV 신경망 연출 중 프로젝트 전환');
     const directed=await directAutoMvScenesWithLocalAI(source,{
      model:scoreModel,session:base.session,signal:controller.signal,
      current,onChange:commit,onProgress:setMessage
     });
     if(directed.updated)setMessage('실제 Ollama AI로 '+directed.updated+'개 신규 SD/SVD 장면의 원곡 가사·스토리 연출 완료');
    }
    movieProject=current();
    if(!lipPlacement){
     const chars=dataRef.current?.characters||[];
     const place=reviewedCharacterMouthPlacement(movieProject,chars);
     if(place&&automaticSingingVisemes(movieProject,chars))lipPlacement=place;
    }
    const result=await runFullLocalMv({...base,project:movieProject,includeAudio:true,includeCaptions:true,lipPlacement,
      duetPcmLip:fullMouth&&(makeDuet||movieProject?.duetSingers?.version===1),
      prewarmedAudioContext:warmed,onProgress:setMessage});
    const outputName='MYVOCAL-'+String(project.title||'project').replace(/[^가-힣a-zA-Z0-9_-]/g,'_').slice(0,40)+'-auto-MV';
    const finishedFiles=[];
    const download=(blob,ext,suffix='')=>{
     finishedFiles.push({kind:ext,file:blob,...(suffix==='-립싱크'?{variant:'face-lip'}:{})});
     const url=URL.createObjectURL(blob),a=document.createElement('a');
     try{a.href=url;a.download=outputName+suffix+'.'+ext;document.body.append(a);a.click();a.remove();}
     finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
    };
    const archiveFinished=async()=>{
     if(!finishedFiles.length)return;
     const source=current();
     if(!source||source.id!==project.id)throw Error('완성 결과 보관 중 프로젝트 변경');
     await persistProductionDeliverables(source,finishedFiles,{
      current,onChange:commit,newId:genId,save:putFilesAtomic,remove:deleteFilesAtomic,
      signal:controller.signal
     });
     finishedFiles.length=0;
    };
    // Even if the optional licensed Wav2Lip model fails, preserve the real
    // already-rendered music+video WebM; never invent a converted MP4.
    download(result.file,'webm');
    if(exportWav&&audioEnd(movieProject)>0){
     setMessage('실제 완성 음악·보컬 믹스를 PCM WAV로 제작 중');
     const wav=await mixdownWav(movieProject,{bitDepth:16,channels:2,sampleRate:44100});
     if(!(wav instanceof Blob)||wav.size<44)throw Error('완성 음악 PCM WAV가 만들어지지 않았습니다. 기존 WebM은 보존됩니다.');
     download(wav,'wav','-완성음악');
    }
    // MP4 변환이 실패해도 이미 만든 WebM·음악 WAV는 프로젝트와 다운로드에 남는다.
    await archiveFinished();
    if(makeMp4){
     setMessage('실제 로컬 FFmpeg로 원본 음악·MV MP4 변환 중');
     let mp4;
     try{mp4=await convertRecordedWebMToMP4(result.file,{session:base.session,signal:controller.signal});}
     catch(e){throw Error('원본 WebM·생성된 WAV는 보존됩니다. 실제 MP4 변환 실패: '+e.message);}
     download(mp4,'mp4','-원본');
    }
    // 실사 립싱크가 실패해도 앞서 만든 일반 MP4는 유지한다.
    await archiveFinished();
    if(faceNeuralSync){
     setMessage('실제 사람 Wav2Lip 얼굴/가창 신경망 립싱크 MP4 제작 중');
     const actual=current();
     if(!actual||actual.id!==project.id)throw Error('실제 사람 립싱크 전 프로젝트가 변경됐습니다.');
     const face=await applyNeuralFaceLipToMv(result.file,actual,dataRef.current?.characters||[],{
      personId,python:facePython,root:faceRoot,checkpoint:faceCheckpoint,
      resize:2,consent:faceRights,modelRights:faceModelRights,
      session:base.session,signal:controller.signal
     });
     download(face.file,'mp4','-립싱크');
     setMessage('음악+MV WebM 및 실제 Wav2Lip 얼굴 립싱크 MP4 모두 저장 완료');
    }
    await archiveFinished();
    setMessage(`전체 MV ${result.seconds.toFixed(1)}초 저장: 신규 이미지 ${result.generatedImages}장, 영상 클립 ${result.generatedVideos}개. 보컬·반주 믹스 ${result.audioIncluded?'포함':'없음'}.`);
    notify('완성 MV WebM'+(makeMp4?'·MP4':'')+(exportWav?' 및 음악 WAV':'')+' 저장을 완료했습니다.');
   }else{
    const result=await runMvBatch({...base,progress:setMessage});
    setMessage(`${result.generatedImages}장 이미지와 ${result.generatedVideos}개 영상 클립 생성·저장 완료. 완성 MV는 별도 출력도 가능합니다.`);
    notify('장면별 로컬 AI 이미지·영상 생성을 완료했습니다.');
   }
  }catch(e){setError(e.message);notify('장면별 자동 생성 중단: '+e.message)}finally{try{await warmed?.close()}catch{}cancelRef.current=null;setBusy(false)}
 };
 return <Panel title="실제 로컬 AI 이미지 → SVD 영상 일괄 생성" description="사용자가 설치한 ComfyUI SD 이미지 모델과 SVD 동영상 모델을 사용합니다. 각 빈 장면에서 실제 이미지와 짧은 영상 파일을 생성하고 기존 프로젝트에 저장합니다.">
  {project.productionLaunch55?.version===1&&<Notice>새 곡 화면에서 선택한 자동 제작 항목을 불러왔습니다. 원본 프로젝트와 등록된 권한 자료는 보존합니다. 모델·권한·이미지 참조 설정을 확인한 뒤 아래 실제 생성 버튼을 누르세요. 모델이 준비되지 않았다면 생성 성공으로 처리하지 않습니다.</Notice>}
  <p className="muted">생성 대상 {info.total}개 · 이미 영상이 있는 장면 {info.already}개 · 등록된 사람·캐릭터 연결 장면 {info.linked}개</p>
  <div className="mv7-item">
   <strong>원천 MusicGen 신경망 6악기 · 편집 가능한 WAV 개별 저장</strong>
   <label>악기 선택<select disabled={busy||stemExportBusy} value={stemExportRole} onChange={e=>setStemExportRole(e.target.value)}>
    {Object.entries(NEURAL_STEM_EXPORT_LABELS).map(([role,name])=><option value={role} key={role}>{name}</option>)}
   </select></label>
   <div className="mv7-actions">
    <Button disabled={busy||stemExportBusy} onClick={exportSelectedStem}>선택한 악기 MusicGen 원본 WAV 저장</Button>
    <Button disabled={busy||stemExportBusy} onClick={exportAllNeuralStems}>원천 신경망 6악기 MIDI+WAV 전체 ZIP 저장</Button>
    <label>기존 6악기 MIDI+WAV ZIP을 새 편집 트랙으로 가져오기<input aria-label="6악기 MIDI WAV ZIP 가져오기" disabled={busy||stemExportBusy} type="file" accept=".zip,application/zip" onChange={importAllNeuralStems}/></label>
    {stemExportBusy&&<Button onClick={()=>stemExportCancelRef.current?.abort()}>원천 악기 저장 취소</Button>}
   </div>
   {stemExportStatus&&<p role="status" className="muted">{stemExportStatus}</p>}
   <Notice>동일 회차 신경망 MIDI 6악기가 모두 있어야 하며 WAV의 실제 PCM 길이·프레임·샘플레이트가 같아야 합니다. 대용량 3~6분 원천 WAV를 인코딩·잘라내지 않고 개별 보존합니다. 전체 ZIP은 같은 회차 6악기 전부의 PCM 길이·샘플레이트를 확인하고 원래 MIDI 음표 6개 파일을 함께 담아 로컬에서 생성합니다. 가져오기에서는 기존 음악을 덮어쓰지 않고 MIDI·WAV 신규 12트랙을 추가합니다.</Notice>
  </div>
  <label><input type="checkbox" disabled={busy} checked={includeReferences} onChange={e=>setIncludeReferences(e.target.checked)}/> 등록된 본인·허가받은 사람 사진·2D 캐릭터 원화 장면도 일괄 이미지·영상 생성에 포함</label>
  <label><input type="checkbox" disabled={busy||duetSceneBusy} checked={duetPcmCasting} onChange={e=>setDuetPcmCasting(e.target.checked)}/> 두 가수 실제 WAV 발성량으로 새 자동 MV 장면의 주인공 결정 (한 번에 Music+MV 제작 시)</label>
  {project.duetSingers?.version===1&&<div className="mv7-actions">
   <Button disabled={busy||stemExportBusy||duetSceneBusy} onClick={()=>analyzeDuetSceneWavs(false)}>실제 두 가수 WAV 분석 → 장면별 발성 JSON 저장</Button>
   <Button disabled={busy||stemExportBusy||duetSceneBusy||!includeReferences} onClick={()=>analyzeDuetSceneWavs(true)}>실제 WAV 발성 → 미생성 자동 장면 두 가수 배치</Button>
   {duetSceneBusy&&<Button onClick={()=>duetSceneCancelRef.current?.abort()}>듀엣 분석 취소</Button>}
  </div>}
  {duetSceneStatus&&<p role="status" className="muted">{duetSceneStatus}</p>
  <label><input type="checkbox" disabled={busy||project.videoMode!=='auto'||!!project.characterId||
   (project.scenes||[]).some(s=>s.characterId||s.personMv||s.characterMv)}
   checked={autoVirtualSinger} onChange={e=>setAutoVirtualSinger(e.target.checked)}/>
   자료 없이 AI 자동 가수 첫 원화 생성 → 후속 장면에 같은 첫 원화를 참조해 실제 SD img2img·SVD로 연결
  </label>
  {autoVirtualSinger&&<p className="muted">등록된 사람·캐릭터가 없는 자동 MV 전용입니다. 기존에 수동으로 편집한 이미지·영상이 있는 프로젝트는 보존하고 이 기능을 거부합니다. 첫 생성 가수 이미지의 재사용은 외형 유지에 도움을 주지만 실제 동일 얼굴·의상은 보장하지 않으며 GPU 출력 확인이 필요합니다.</p>}
  <label><input type="checkbox" disabled={busy} checked={saveFullMovie} onChange={e=>setSaveFullMovie(e.target.checked)}/> 생성 후 음악·보컬·가사 포함 완성 MV WebM까지 한 번에 저장 (Windows WebView2 사용)</label>
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={exportWav} onChange={e=>setExportWav(e.target.checked)}/> 완성 음악·가창 믹스를 편집 가능한 16비트 스테레오 WAV로 함께 저장</label>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeMp4} onChange={e=>setMakeMp4(e.target.checked)}/> 완성 WebM과 함께 로컬 FFmpeg로 실제 MP4도 저장 (원본·립싱크 파일명 구분)</label>}
  {saveFullMovie&&<div className="mv7-actions"><Button disabled={busy} onClick={()=>{try{
     storeNativeProductionPaths(window.localStorage,{musicPython,musicModelDir,demucsRoot,soundfontDll,soundfontFile});
     notify('이 PC에 설치된 음악·영상 엔진 경로만 다음 프로젝트용으로 저장했습니다. 음성·녹음·모델 파일 및 사용 권한 동의는 저장하지 않았습니다.');
    }catch(error){setError('로컬 설치 경로 저장 실패: '+error.message);}
   }}>현재 PC 로컬 엔진 경로 기억</Button></div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeAutoScore} onChange={e=>{setMakeAutoScore(e.target.checked);setScoreModelError('');}}/> 로컬 AI 한국어 작사·6악기 MIDI·음소 싱크까지 자동 생성 (기존 작성 가사 보존)</label>}
  {saveFullMovie&&makeAutoScore&&<div className="mv7-item">
   <label>노래 주제와 원하는 편곡<input disabled={busy} maxLength={1200} value={scorePrompt} onChange={e=>setScorePrompt(e.target.value)} placeholder="한국어 애니메이션 록 발라드, 마지막 후렴은 웅장하게"/></label>
   <div className="mv7-actions"><Button disabled={busy} onClick={async()=>{try{
    const names=await getInstalledLocalModels();setScoreModels(names);setScoreModel(prev=>names.includes(prev)?prev:(names[0]||''));
    if(!names.length)setScoreModelError('설치된 로컬 Ollama 모델이 없습니다.');
   }catch(e){setScoreModelError(e.message)}}}>실제 로컬 AI 모델 조회</Button>
   <select value={scoreModel} disabled={busy||!scoreModels.length} onChange={e=>setScoreModel(e.target.value)}>
    <option value="">Ollama 모델 선택</option>{scoreModels.map(name=><option key={name} value={name}>{name}</option>)}
   </select></div>
   {scoreModelError&&<p role="alert">{scoreModelError}</p>}
   <Notice>작사와 악기별 MIDI는 사용자가 설치한 로컬 신경망 모델이 생성합니다. 프로젝트에 이미 작성된 가사는 덮어쓰지 않습니다. 생성된 선율의 한국어 음소 타임라인으로 실제 Singing 엔진과 연결합니다.</Notice>
  </div>}
  {saveFullMovie&&makeAutoScore&&<label><input type="checkbox" disabled={busy} checked={makeNeuralSceneDirection} onChange={e=>setMakeNeuralSceneDirection(e.target.checked)}/> 선택한 실제 로컬 Ollama 모델로 원곡 가사·구간에 맞춘 신규 3초 SD/SVD 장면 AI 연출</label>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeSourceStems} onChange={e=>setMakeSourceStems(e.target.checked)}/> 신경망 MIDI 6악기를 SoundFont PCM WAV 편집 트랙으로 추가</label>}
  {saveFullMovie&&makeSourceStems&&<div className="mv7-item">
   <label>SoundFont용 Python.exe<input disabled={busy} value={musicPython} onChange={e=>setMusicPython(e.target.value)} placeholder="C:/AI/Python/python.exe"/></label>
   <label>FluidSynth DLL<input disabled={busy} value={soundfontDll} onChange={e=>setSoundfontDll(e.target.value)} placeholder="C:/AI/FluidSynth/libfluidsynth-3.dll"/></label>
   <label>사용 권한이 있는 SoundFont SF2/SF3<input disabled={busy} value={soundfontFile} onChange={e=>setSoundfontFile(e.target.value)} placeholder="C:/AI/SoundFonts/instrument.sf2"/></label>
   <Notice>로컬 샘플 합성 PCM입니다. 신경망 원천 오디오 stems는 아닙니다. 원본은 그대로 두고 신규 6트랙에 음소거 상태로 저장합니다.</Notice>
  </div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeNeuralAudioStems} onChange={e=>setMakeNeuralAudioStems(e.target.checked)}/> MusicGen으로 악기 6종의 신경망 오디오를 각각 독립 생성해 편집 WAV 트랙에 추가</label>}
  {saveFullMovie&&makeNeuralAudioStems&&<div className="mv7-item">
   <label>실제 로컬 MusicGen Python.exe<input disabled={busy} value={musicPython} onChange={e=>setMusicPython(e.target.value)} placeholder="C:/AI/Python/python.exe"/></label>
   <label>설치된 MusicGen 모델 폴더<input disabled={busy} value={musicModelDir} onChange={e=>setMusicModelDir(e.target.value)} placeholder="C:/AI/MusicGen"/></label>
   <Notice>각 악기용 프롬프트로 로컬 신경망 WAV를 별도로 생성합니다. 단일 모델의 악기 혼입 가능성은 있으며 완벽한 악기 분리나 개별 MIDI 음정의 정확한 재현을 보장하지 않습니다. 원본 파일을 변경하지 않습니다.</Notice>
  </div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeNeuralMusic} onChange={e=>setMakeNeuralMusic(e.target.checked)}/> 반주가 없어도 MusicGen 신경망 → Demucs 악기 분리·마스터링 → 전체 MV 영상까지 일괄 제작</label>}
  {saveFullMovie&&(makeAutoScore||makeNeuralAudioStems)&&!makeNeuralMusic&&<label>목표 노래 길이<select disabled={busy} value={musicDuration} onChange={e=>setMusicDuration(Number(e.target.value))}><option value={180}>약 3분</option><option value={360}>최대 6분</option></select></label>}
  {saveFullMovie&&makeNeuralMusic&&<div className="mv7-item">
   <label>목표 노래 길이<select disabled={busy} value={musicDuration} onChange={e=>setMusicDuration(Number(e.target.value))}><option value={180}>약 3분</option><option value={360}>최대 6분</option></select></label>
   <label>실제 로컬 Python.exe<input disabled={busy} value={musicPython} onChange={e=>setMusicPython(e.target.value)} placeholder="D:\\AI\\python.exe"/></label>
   <label>설치된 MusicGen 모델 폴더<input disabled={busy} value={musicModelDir} onChange={e=>setMusicModelDir(e.target.value)} placeholder="D:\\AI\\MusicGen"/></label>
   <label>설치된 Demucs 폴더<input disabled={busy} value={demucsRoot} onChange={e=>setDemucsRoot(e.target.value)} placeholder="D:\\AI\\Demucs"/></label>
   <Notice>실제 로컬 모델과 기존 프로젝트 장면을 사용합니다. WAV 원본·등록 모델은 변경하지 않습니다. MV 실패 시 이미 정상 생성된 음악과 추가 장면은 프로젝트에 남아 복구할 수 있습니다.</Notice>
  </div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={makeNeuralSinging} onChange={e=>{setMakeNeuralSinging(e.target.checked);setSingingRights(false);}}/> 실제 한국어 신경망 Singing 가창 → 본인 음색 RVC → 음악·MV 전체 연속 제작</label>}
  {saveFullMovie&&makeNeuralSinging&&<div className="mv7-item">
   <label>가창 신경망 엔진<select value={singingBackend} disabled={busy} onChange={e=>{
    setSingingBackend(e.target.value);setSingingRights(false);
     if(e.target.value==='diffsinger'&&!DIFFSINGER_EXPRESSIVE_STYLES.includes(singingStyle))setSingingStyle('Natural');
    if(e.target.value==='diffsinger'){setMakeHarmony(false);setMakeDuet(false);setMakeNeuralAdlib(false);}
   }}>
    <option value="external">기존 로컬 Singing 엔진 (포트)</option>
    <option value="diffsinger">Voice Library 학습 완료 DiffSinger (Windows EXE 직접 추론)</option>
   </select></label>
   {singingBackend==='external'?<label>설치된 로컬 Singing 엔진 포트<input value={singingPort} disabled={busy} onChange={e=>setSingingPort(e.target.value)} inputMode="numeric" placeholder="7867"/></label>:<label>실제 학습된 로컬 DiffSinger Acoustic 모델
    <select disabled={busy||!availableDiffSingerModels.length} value={diffSingerModelId} onChange={e=>{setDiffSingerModelId(e.target.value);setSingingRights(false);}}>
     <option value="">현재 Voice의 학습된 모델 선택</option>
     {availableDiffSingerModels.map(m=><option value={m.id} key={m.id}>{m.name}{m.dictionaryAssetId?' · 발음 사전 등록':' · 발음 사전 미등록'}</option>)}
    </select>
    <Notice>저장된 한국어 발음 사전과 실제 Acoustic 체크포인트를 Windows EXE에서 실행합니다. 기존 Singing 포트는 사용하지 않습니다. 이 경로에서는 원곡 선율·3도 화음을 실제 신경망 가창으로 생성할 수 있지만, 가성·속삭임 음색 변환은 이 모델에서 지원하지 않지만, 별도의 MIDI/F0 표현 스타일은 선택할 수 있습니다. 원곡 가사의 실제 MIDI 휴지에서 Ad-lib를 생성하며, 두 가수 듀엣에는 각자의 실제 DiffSinger 모델·발음 사전이 필요합니다.</Notice>
   </label>}
   <label>가창에 사용할 등록 목소리<select value={singingVoiceId} disabled={busy} onChange={e=>{setSingingVoiceId(e.target.value);setSingingRights(false);setDiffSingerModelId('');}}>
     <option value="">프로젝트 목소리 / 첫 번째 사용 허가 목소리</option>
     {voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
   </select></label>
   <label>노래 스타일 (Voice 음색과 별도{singingBackend==='diffsinger'?' · MIDI/F0 발성 표현':''})<select disabled={busy} value={singingStyle} onChange={e=>setSingingStyle(e.target.value)}>
    {(singingBackend==='diffsinger'?DIFFSINGER_EXPRESSIVE_STYLES:SINGING_STYLES).map(style=><option key={style} value={style}>{style}</option>)}
   </select></label>
   <label><input type="checkbox" checked={makeHarmony} disabled={busy} onChange={e=>setMakeHarmony(e.target.checked)}/> 원곡 MIDI로 실제 신경망 Singing 3도 화음도 별도 WAV/DAW 트랙 생성</label>}
   {makeHarmony&&<label><input type="checkbox" disabled={busy} checked={makeDuet} onChange={e=>setMakeDuet(e.target.checked)}/> 서로 다른 실제 목소리 2명과 캐릭터 2명으로 듀엣 노래·MV 제작</label>}
   {makeHarmony&&makeDuet&&<div className="mv7-item">
    <label>두 번째 Singing Voice<select disabled={busy} value={duetVoiceId} onChange={e=>{setDuetVoiceId(e.target.value);setDiffSingerDuetModelId('');setSingingRights(false);}}>
     <option value="">첫 번째 목소리와 다른 허가 Voice 선택</option>
     {voices.filter(v=>v.id!==selectedRVCSinger?.id&&(v.rights!=='licensed'||String(v.rightsNote||'').trim())).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
    </select></label>
    {singingBackend==='diffsinger'&&<label>두 번째 가수의 독립 학습 DiffSinger 모델
     <select disabled={busy||!availableDuetDiffSingerModels.length} value={diffSingerDuetModelId}
      onChange={e=>{setDiffSingerDuetModelId(e.target.value);setSingingRights(false);}}>
      <option value="">두 번째 Voice의 별도 학습 모델 선택</option>
      {availableDuetDiffSingerModels.map(m=><option key={m.id} value={m.id}>{m.name} · {m.dictionaryAssetId?'발음 사전 등록':'발음 사전 없음'}</option>)}
     </select></label>}
    <label>첫 번째 가수 캐릭터<select disabled={busy} value={duetLeadCharacterId} onChange={e=>setDuetLeadCharacterId(e.target.value)}>
     <option value="">첫 번째 가수 캐릭터</option>{duetCharacters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    <label>두 번째 가수 캐릭터<select disabled={busy} value={duetHarmonyCharacterId} onChange={e=>setDuetHarmonyCharacterId(e.target.value)}>
     <option value="">두 번째 가수 캐릭터</option>
     {duetCharacters.filter(c=>c.id!==duetLeadCharacterId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    <Notice>실제 신경망 Singing 모델에서 두 Voice의 독립 보컬 WAV를 생성합니다. 위의 **등록 사람·캐릭터 원본 참조 이미지 포함**을 켜고 두 가수의 원화/사진을 각각 등록하세요. 두 가수의 참조 이미지를 교차 사용하지 않습니다. 첫 가수의 RVC 모델을 두 번째에 적용하지 않습니다.</Notice>
   </div>}
   {makeHarmony&&<label>3도 화음 음역<select disabled={busy} value={harmonyDirection} onChange={e=>setHarmonyDirection(e.target.value)}>
    <option value="above">메인 선율 위의 3도</option><option value="below">메인 선율 아래의 3도</option>
   </select></label>}
   <label><input type="checkbox" checked={makeNeuralAdlib} disabled={busy} onChange={e=>setMakeNeuralAdlib(e.target.checked)}/> 원곡 가사·MIDI 휴지에 실제 신경망 Ad-lib(추임새) WAV 추가 → 독립 편집 보컬 트랙</label>}
   <label><input type="checkbox" checked={alsoConvertRVC} disabled={busy} onChange={e=>setAlsoConvertRVC(e.target.checked)}/> 등록한 RVC 모델로 본인 음색까지 변환</label>
   {alsoConvertRVC&&<label>실제 RVC 모델 선택<select disabled={busy} value={registeredRVCId} onChange={e=>setRegisteredRVCId(e.target.value)}>
     <option value="">기존 로컬 경로의 모델 사용</option>
     {registeredRVCModels.map(m=><option key={m.id} value={m.id}>{m.name||m.id} {m.indexAssetId?'· FAISS 포함':''}</option>)}
   </select></label>}
   <label><input type="checkbox" checked={singingRights} disabled={busy} onChange={e=>setSingingRights(e.target.checked)}/> 해당 목소리·가창·RVC 모델 사용 권한과 실제 학습 모델 사용을 확인합니다.</label>
   <Notice>기존 가사·MIDI 싱크와 실행 가능한 실제 신경망 Singing 엔진이 있어야 합니다. RVC 선택 시 기존 로컬 경로 또는 등록된 본인 음색 모델·FAISS 인덱스를 선택합니다. 등록된 체크포인트는 SHA-256 확인 후 원본을 보존한 채 추론에 사용합니다. 실제 WAV가 생성되어야 후속 MV 단계에 진입하며, 실패 시 원본은 변경되지 않습니다.</Notice>
  </div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={faceNeuralSync} onChange={e=>{setFaceNeuralSync(e.target.checked);setFaceRights(false);setFaceModelRights(false);}}/> 동일한 등록 실제 사람이 등장하는 MV 전체를 Wav2Lip 신경망으로 추가 립싱크 MP4 제작</label>}
  {saveFullMovie&&faceNeuralSync&&<div className="mv7-item">
   <label>사용 허가된 실제 사람<select disabled={busy} value={personId} onChange={e=>{setPersonId(e.target.value);setFaceRights(false);}}>
    <option value="">실제 사람 선택</option>{permittedPeople.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
   <label>Wav2Lip Python.exe<input disabled={busy} value={facePython} onChange={e=>setFacePython(e.target.value)} placeholder="D:\\AI\\python.exe"/></label>
   <label>Wav2Lip 설치 폴더<input disabled={busy} value={faceRoot} onChange={e=>setFaceRoot(e.target.value)} placeholder="D:\\AI\\Wav2Lip"/></label>
   <label>설치된 Wav2Lip .pth 체크포인트<input disabled={busy} value={faceCheckpoint} onChange={e=>setFaceCheckpoint(e.target.value)} placeholder="D:\\AI\\Wav2Lip\\checkpoints\\wav2lip.pth"/></label>
   <label><input type="checkbox" disabled={busy} checked={faceRights} onChange={e=>setFaceRights(e.target.checked)}/> 등장하는 실제 사람·녹음·영상의 사용 권한이 있습니다.</label>
   <label><input type="checkbox" disabled={busy} checked={faceModelRights} onChange={e=>setFaceModelRights(e.target.checked)}/> Wav2Lip 학습 모델의 사용 라이선스를 확인했습니다.</label>
   <Notice>동일한 본인·허가받은 실제 사람으로 연결된 장면에만 적용합니다. 원본 MV WebM도 별도 보존하며, 실제 Wav2Lip 모델이 MP4를 생성하지 못하면 성공이라고 보고하지 않습니다.</Notice>
  </div>}
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={fullMouth} onChange={e=>setFullMouth(e.target.checked)}/> 저장된 2D 립싱크 입 모양 포함 (듀엣은 두 가수 실제 WAV PCM 사용)</label>}
  <Button variant="primary" disabled={busy||(!info.total&&!saveFullMovie)||(info.total>0&&(!checkpoint||!videoModel))||(makeNeuralMusic&&(!musicPython||!musicModelDir||!demucsRoot))||(makeSourceStems&&(!musicPython||!soundfontDll||!soundfontFile))||(makeNeuralAudioStems&&(!musicPython||!musicModelDir))||(makeNeuralSinging&&(!singingRights||!voices.length||(singingBackend==='diffsinger'&&(!selectedDiffSingerModel?.dictionaryAssetId||!selectedDiffSingerModel?.dictionarySha256||
 (makeHarmony&&makeDuet&&(!selectedDuetDiffSingerModel?.dictionaryAssetId||!selectedDuetDiffSingerModel?.dictionarySha256))))||(makeHarmony&&makeDuet&&(!duetVoiceId||!duetLeadCharacterId||!duetHarmonyCharacterId||duetLeadCharacterId===duetHarmonyCharacterId))))||(makeAutoScore&&(!scoreModel||scorePrompt.trim().length<3))||(faceNeuralSync&&(!personId||!facePython||!faceRoot||!faceCheckpoint||!faceRights||!faceModelRights))} onClick={create}>{busy?'실제 모델 + 영상 렌더 처리 중':saveFullMovie?'이미지·영상 생성부터 전체 MV 저장까지':'빈 장면 이미지·SVD 클립 일괄 생성'}</Button>
  {busy&&<Button onClick={()=>cancelRef.current?.abort()}>이후 장면 생성 취소</Button>}
  {message&&<p role="status" className="muted">{message}</p>}
  {(error||info.error)&&<p role="alert" className="mv4-error">{error||info.error}</p>}
  <Notice>이 기능은 설치된 로컬 모델이 실제 실행되는 경우에만 영상 파일을 생성합니다. 기본 설정에서는 등록 인물·캐릭터 장면을 건너뜁니다. 포함을 켜면 권한을 검사한 원본을 기존 img2img→SVD로 실제 생성합니다. 원본을 바꾸거나 일치하지 않는 사람으로 생성하지 않습니다. 한 번에 최대 20장면, 장면당 짧은 클립만 생성합니다. 완성 WebM 자동 저장을 선택하면 기존 음악·보컬 믹스를 포함해 실제 MV를 녹화합니다. 립싱크 2D 입 위치는 기존 MV 화면에서 먼저 지정해야 합니다. 등록 인물의 얼굴 추적·3D 애니메이션이나 사용자 목소리 신경망 학습은 자동 수행하지 않습니다.</Notice>
 </Panel>;
}