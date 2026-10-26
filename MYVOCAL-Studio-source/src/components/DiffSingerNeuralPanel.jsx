import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {parseDiffSingerDictionary,synthesizeDiffSingerWav} from '../lib/diffSingerNative.js';
import {listedDiffSingerModels} from '../lib/diffSingerVoiceRegistry.js';
import {downloadDiffSingerTrainingDictionary} from '../lib/diffSingerTrainingClient.js';
import {readAudioInfo} from '../lib/audioEngine';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
import {genId} from '../lib/schema';
import {putFilesAtomic,deleteFilesAtomic,getFile} from '../lib/assetDb';
import {sha256File} from '../lib/voiceTraining.js';
import {convertRegisteredRVC} from '../lib/rvcStoredConversion.js';
import {readRVCPreferences} from '../lib/rvcPreferences.js';
import {convertLongSingingWithRVC} from '../lib/rvcLongConversion.js';
import {isPhonemePlanStale} from '../lib/phonemePlan.js';
import {isAlignmentStale} from '../lib/lyricAlignment';

const KEY='MYVOCAL_NATIVE_DIFFSINGER_V1';
const readPaths=()=>{try{const v=JSON.parse(window.localStorage.getItem(KEY)||'{}');
 return {python:String(v.python||''),root:String(v.root||''),experiment:String(v.experiment||'')};
 }catch{return {python:'',root:'',experiment:''}}};
export default function DiffSingerNeuralPanel({project,onChange,notify,voice,registeredModels=[],trainedSuggestion=null}){
 const [initial]=useState(readPaths);
 const [python,setPython]=useState(initial.python),[root,setRoot]=useState(initial.root),
  [experiment,setExperiment]=useState(initial.experiment),[dictionaryFile,setDictionaryFile]=useState(null),
  [rights,setRights]=useState(false),[alsoRvc,setAlsoRvc]=useState(false),[registeredRvcId,setRegisteredRvcId]=useState(''),
  [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [selectedSavedModel,setSelectedSavedModel]=useState('');
 const modelSelection=useRef(0);
 const latest=useRef(project),abort=useRef(null);latest.current=project;
 // Each new trained model has its own immutable pronunciation lexicon.
 // Load stored assets by ID, or obtain a newly finished job's lexicon from the
 // local EXE session. Never substitute a different singer's dictionary.
 async function linkedDictionary(model){
  let blob=null;
  if(model?.dictionaryAssetId){
   blob=await getFile(model.dictionaryAssetId);
   if(!(blob instanceof Blob)||blob.size<10||blob.size>2*1024*1024)
    throw Error('등록된 Acoustic 모델의 학습 발음 사전 파일이 없습니다.');
   if(model.dictionarySha256&&await sha256File(blob)!==model.dictionarySha256)
    throw Error('등록된 학습 발음 사전이 저장 당시와 다릅니다.');
  }else if(model?.trainingJobId){
   blob=await downloadDiffSingerTrainingDictionary(model.trainingJobId,{
    session:window.__MYVOCAL_SESSION_KEY});
  }
  if(!blob)return null; // Legacy models may still need a manual .txt selection.
  const file=blob instanceof File?blob:new File([blob],
   model.dictionaryName||'MYVOCAL-DiffSinger-dictionary.txt',{type:'text/plain'});
  parseDiffSingerDictionary(await file.text());
  return file;
 }
 async function useNewTrainedModel(){
  if(busy||trainedSuggestion?.voiceId!==voice?.id)return;
  if(!trainedSuggestion.python||!trainedSuggestion.root||!trainedSuggestion.experiment){
   setError('실제 학습 모델 설치 정보를 확인할 수 없습니다.');return;
  }
  const requestId=++modelSelection.current;
  setError('');
  try{
   const dict=await linkedDictionary(trainedSuggestion);
   if(requestId!==modelSelection.current||trainedSuggestion.voiceId!==voice?.id)return;
   setPython(trainedSuggestion.python);setRoot(trainedSuggestion.root);
   setExperiment(trainedSuggestion.experiment);setDictionaryFile(dict);
   setSelectedSavedModel(trainedSuggestion.id||'');
   setRights(false);
   setStatus(dict?'실제 학습 체크포인트와 해당 한국어 발음 사전을 불러왔습니다. 보코더 호환성을 확인하고 가창을 실행하세요.':
    '학습 체크포인트 경로를 불러왔습니다. 같은 모델에서 사용한 한국어 발음 사전을 별도로 선택하세요.');
  }catch(e){if(requestId===modelSelection.current)setError(e.message||String(e));}
 }
 async function selectStoredModel(id){
  const requestId=++modelSelection.current;
  setSelectedSavedModel(id);setError('');setRights(false);
  const saved=savedDiffSingerModels.find(model=>model.id===id);
  if(!saved)return;
  try{
   const dict=await linkedDictionary(saved);
   if(requestId!==modelSelection.current||saved.voiceId!==voice?.id)return;
   setRoot(saved.root);setPython(saved.python);setExperiment(saved.experiment);
   setDictionaryFile(dict);
   setStatus(dict?'Voice Library의 Acoustic 학습 모델과 등록된 한국어 발음 사전을 자동 연결했습니다.':
    '기존 Acoustic 학습 경로를 불러왔습니다. 해당 모델의 한국어 발음 사전을 직접 선택하세요.');
  }catch(e){if(requestId===modelSelection.current){setError(e.message||String(e));setDictionaryFile(null);}}
 }
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{modelSelection.current++;abort.current?.abort();setStatus('');setError('');setRights(false);setDictionaryFile(null);},[project.id]);
 useEffect(()=>{modelSelection.current++;setSelectedSavedModel('');setDictionaryFile(null);setRights(false);},[voice?.id]);
 const aligned=project.vocalAlignment;
 const eligibleModels=registeredModels.filter(m=>m?.engineId==='rvc'&&m.voiceId===voice?.id&&m.assetId&&/^[a-f0-9]{64}$/i.test(String(m.sha256||'')));
 const savedDiffSingerModels=listedDiffSingerModels(voice,registeredModels);
 const alignment=aligned&&!isAlignmentStale(project,aligned)?aligned:null;
 const canRender=alignment?.format==='MYVOCAL_LYRIC_ALIGNMENT'&&
  Array.isArray(alignment.cues)&&alignment.cues.length>0&&['self','owned','licensed'].includes(voice?.rights);
 async function create(){
  if(busy)return;
  const before=latest.current,controller=new AbortController();
  abort.current=controller;setBusy(true);setError('');setStatus('한국어 가사·MIDI를 실제 신경망 모델 입력으로 준비 중');
  let savedIds=[];
  try{
   if(!canRender||before!==project)throw Error('권한 있는 본인 목소리와 가사·MIDI를 선택하세요.');
   if(!dictionaryFile||dictionaryFile.size>2*1024*1024)
    throw Error('학습한 DiffSinger 모델에 사용한 한국어 발음 사전을 선택하세요.');
   const dictionary=parseDiffSingerDictionary(await dictionaryFile.text());
   if(controller.signal.aborted||latest.current!==before)throw Error('프로젝트가 변경됐습니다.');
   setStatus('로컬 DiffSinger 실제 Acoustic+Vocoder 음성 합성 중');
   const source=await synthesizeDiffSingerWav(alignment,{
    python,root,experiment,dictionary,phonemePlan:project.phonemePlan&&!isPhonemePlanStale(alignment,project.phonemePlan)?project.phonemePlan:null,
    rightsConfirmed:rights,signal:controller.signal});
   let converted=null;
   if(alsoRvc){
    const saved=readRVCPreferences(window.localStorage);
    if(!saved)throw Error('기존 RVC 패널에서 본인 모델 .pth와 Python 실행 경로를 먼저 저장하세요.');
    setStatus('신경망 한국어 가창 WAV를 본인 RVC 모델로 실제 음색 변환 중');
    const preferred=eligibleModels.find(m=>m.id===registeredRvcId);
    const rvcOptions={
     session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal,
     onProgress:(done,total)=>setStatus('본인 음색 RVC 추론 '+done+'/'+total+' 구간')
    };
    let settings={...saved,rightsConfirmed:true};
    if(preferred){
     const modelFile=await getFile(preferred.assetId);
     if(!(modelFile instanceof Blob)||await sha256File(modelFile)!==preferred.sha256)
      throw Error('등록된 본인 RVC 모델이 없거나 파일 해시가 일치하지 않습니다.');
     let indexFile=null;
     if(preferred.indexAssetId){
      indexFile=await getFile(preferred.indexAssetId);
      if(!(indexFile instanceof Blob)||!preferred.indexSha256||
       await sha256File(indexFile)!==preferred.indexSha256)
       throw Error('등록된 본인 RVC 인덱스가 없거나 파일 해시가 일치하지 않습니다.');
     }
     if(Number(saved.indexRate)>0&&!indexFile)
      throw Error('등록된 본인 RVC 인덱스가 없으면 적용 비율을 0으로 변경하세요.');
     settings={root:saved.root,python:saved.python,f0:saved.f0,pitch:saved.pitch,
      indexRate:saved.indexRate,rightsConfirmed:true};
     rvcOptions.convert=(part,opts,extra)=>
      convertRegisteredRVC(part,{...opts,modelFile,indexFile},extra);
    }
    if(controller.signal.aborted||latest.current!==before)
     throw Error('본인 음색 모델 연결 중 프로젝트가 변경됐습니다.');
    converted=await convertLongSingingWithRVC(source,settings,rvcOptions);
   }
   if(controller.signal.aborted||latest.current!==before)throw Error('생성이 취소됐거나 프로젝트가 변경됐습니다.');
   const files=converted?[source,converted]:[source],entries=[],newTracks=[];
   for(const [index,file] of files.entries()){
    const info=await readAudioInfo(file);
    if(!Number.isFinite(info.duration)||info.duration<=0||info.duration>360)
     throw Error('실제 신경망 가창 WAV 길이가 올바르지 않습니다.');
    const assetId=genId('neural_singing'),track=makeImportedVocalTrack(before,file,assetId,info.duration);
    track.id=genId('neural_voice_track');
    track.name=index?'본인 음색 RVC 신경망 가창':'DiffSinger 실제 한국어 신경망 가창';
    track.generatedBy=index?'diffsinger-rvc-neural':'diffsinger-acoustic';
    track.sourceVoiceId=voice.id;
    track.sourceExperiment=experiment;
    track.mute=!!converted&&index===0;
    savedIds.push(assetId);entries.push([assetId,file]);newTracks.push(track);
   }
   if(controller.signal.aborted||latest.current!==before)throw Error('프로젝트가 변경됐습니다.');
   await putFilesAtomic(entries);
   if(controller.signal.aborted||latest.current!==before)throw Error('보컬 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...before,tracks:[...(before.tracks||[]),...newTracks]}));
   savedIds=[];
   const label=converted?'DiffSinger + 본인 RVC':'DiffSinger';
   setStatus(label+' 실제 신경망 WAV '+files.length+'개를 새 보컬 편집 트랙으로 저장했습니다.');
   notify('한국어 MIDI 가창 신경망 WAV를 원본 녹음·MIDI를 보존하면서 저장했습니다. 생성 품질은 사용자 실기기에서 확인하세요.');
  }catch(e){
   if(savedIds.length)try{await deleteFilesAtomic(savedIds)}catch(rollback){setError('신규 자산 복구 실패: '+rollback.message+' / '+e.message);return}
   setError(e.message);
  }finally{abort.current=null;setBusy(false)}
 }
 return <Panel title="핵심 가창 엔진 · 한국어 MIDI 신경망 Singing" description="기존 Windows EXE에서 학습한 DiffSinger Acoustic+Vocoder를 직접 실행해 가사·MIDI로 실제 노래 WAV를 생성합니다. 선택하면 본인 RVC 모델 음색을 이어서 적용합니다.">
  <Notice>가창 모델은 사전에 실제 학습되어 있어야 합니다. DiffSinger 원본 가중치와 발음 사전, 보코더는 설치된 로컬 폴더에서만 읽으며 다운로드하지 않습니다. RVC만으로 새 가사 발음을 만들 수는 없습니다.</Notice>
  {savedDiffSingerModels.length>0&&<Field label="Voice Library에 등록된 실제 Acoustic 학습 기록">
   <select value={selectedSavedModel} disabled={busy} onChange={event=>{void selectStoredModel(event.target.value)}}>
    <option value="">기존 모델 직접 입력 또는 Voice Library 모델 선택</option>
    {savedDiffSingerModels.map(model=><option key={model.id} value={model.id}>{model.name} · 추론 미검증</option>)}
   </select>
  </Field>}
  <div className="mv10-grid">
   <Field label="DiffSinger Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\\DiffSinger\\venv\\Scripts\\python.exe"/></Field>
   <Field label="DiffSinger 로컬 설치 폴더"><input value={root} disabled={busy} onChange={e=>setRoot(e.target.value)} placeholder="D:\\DiffSinger"/></Field>
   <Field label="학습 완료 Acoustic 실험 이름"><input value={experiment} disabled={busy} onChange={e=>setExperiment(e.target.value)} placeholder="my_korean_voice"/></Field>
   <Field label="학습 모델의 한국어 발음 사전"><input type="file" accept=".txt,text/plain" disabled={busy} onChange={e=>setDictionaryFile(e.target.files?.[0]||null)}/>
   {dictionaryFile&&<p className="muted">선택된 발음 사전: {dictionaryFile.name} ({dictionaryFile.size} bytes)</p>}</Field>
  </div>
  <div className="mv7-actions">{trainedSuggestion?.voiceId===voice?.id&&<Button disabled={busy} onClick={useNewTrainedModel}>이번 실제 학습 체크포인트로 가창 모델 선택</Button>}
  <Button disabled={busy} onClick={()=>{try{window.localStorage.setItem(KEY,JSON.stringify({python,root,experiment}));notify('DiffSinger 실행 경로만 현재 PC에 저장했습니다. 원본 모델·녹음은 저장하지 않았습니다.')}catch(e){setError(e.message)}}}>로컬 가창 모델 경로 기억</Button></div>
  <label className="check-item"><input type="checkbox" checked={alsoRvc} disabled={busy} onChange={e=>setAlsoRvc(e.target.checked)}/>합성한 신경망 가창을 실제 본인 RVC 음색 모델로 추가 변환</label>
  {alsoRvc&&eligibleModels.length>0&&<Field label="프로젝트에 저장한 본인 RVC 체크포인트"><select disabled={busy} value={registeredRvcId} onChange={e=>setRegisteredRvcId(e.target.value)}>
   <option value="">기존 RVC 설정의 로컬 .pth 모델 파일 사용</option>
   {eligibleModels.map(m=><option key={m.id} value={m.id}>{m.name||'등록 본인 가창 음색'} {m.indexAssetId?'· FAISS 인덱스 포함':''}</option>)}
  </select></Field>}
  <label className="check-item"><input type="checkbox" checked={rights} disabled={busy} onChange={e=>setRights(e.target.checked)}/>이 가창 모델·목소리·한국어 가사 사용 권한을 확인했습니다.</label>
  <p className="muted">MIDI 음표 {alignment?.cues?.length||0}개 · 저장된 한국어 발음 타임라인이 있으면 음절별 길이를 실제 모델 입력에 적용합니다. 사전에 없는 글자는 임의로 대체하지 않습니다. 음소 내부 발음 배분은 실제 모델 품질에 따릅니다.</p>
  <div className="mv7-actions"><Button variant="primary" disabled={busy||!canRender||!dictionaryFile||!rights||!python||!root||!experiment} onClick={create}>{busy?'실제 가창 모델 실행 중':'한국어 신경망 Singing WAV 생성·편집 트랙 저장'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>추론 취소</Button>}</div>
  {status&&<p role="status" className="muted">{status}</p>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
 </Panel>;
}
