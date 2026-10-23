import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {generateMusicGenAudio} from '../lib/musicGenClient.js';
import {splitMusicGenStems} from '../lib/musicStemsClient.js';
import {generateMusicGenSequence} from '../lib/musicGenSequence.js';
import {renderAndStoreNeuralAudioStems} from '../lib/neuralInstrumentAudioStems.js';
import {latestCompleteNeuralScore} from '../lib/neuralScoreBatch.js';
import {planScoreMatchedMusicGenSegments} from '../lib/neuralStemScoreTiming.js';
import {buildNeuralMusicPrompts} from '../lib/neuralMusicPromptTimeline.js';
import {readMusicGenPreferences,writeMusicGenPreferences} from '../lib/musicGenPreferences.js';
import {musicGenSectionPrompts} from '../lib/musicGenSectionPrompts.js';
import {readAudioInfo} from '../lib/audioEngine';
import {renderStemRemixMaster} from '../lib/stemRemixMaster.js';
import {parseStemMixPreset,serializeStemMixPreset} from '../lib/stemMixPreset.js';
import {renderEditedStemTracks} from '../lib/stemTimelineExport.js';
import {runMusicProductionPipeline} from '../lib/musicProductionPipeline.js';
import {persistNeuralMusicTracks} from '../lib/musicProductionCommit.js';
import {transcribeStemToMidi} from '../lib/stemMidiClient.js';
import {genId} from '../lib/schema';
import {putFileNew,removeFile,putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
export default function MusicGenPanel({project,onChange,notify}){
 const [paths]=useState(()=>{try{return readMusicGenPreferences(window.localStorage)}catch{return {}}});
 const [python,setPython]=useState(paths.python||''),[modelDir,setModelDir]=useState(paths.modelDir||''),[prompt,setPrompt]=useState('cinematic instrumental music'),[seconds,setSeconds]=useState('12'),[seed,setSeed]=useState('42');
 const [wav,setWav]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [demucsRepo,setDemucsRepo]=useState(''),[demucsModel,setDemucsModel]=useState('htdemucs'),[demucsDevice,setDemucsDevice]=useState('auto'),[stems,setStems]=useState(null);
 const [sequence,setSequence]=useState(false),[scoreMatch,setScoreMatch]=useState(false),[continuation,setContinuation]=useState(false),[segments,setSegments]=useState('4'),[fade,setFade]=useState('0.5'),[partPrompts,setPartPrompts]=useState(''),[progress,setProgress]=useState('');
 const [stemMix,setStemMix]=useState({}),[remix,setRemix]=useState(null);
 const [midiPython,setMidiPython]=useState(''),[midiStem,setMidiStem]=useState('bass'),[midiResult,setMidiResult]=useState(null);
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 useEffect(()=>{setWav(null);setUrl('');setStems(null);setRemix(null);setStemMix({});setMidiResult(null);setError('')},[project.id]);
 const clear=()=>{setWav(null);setUrl('');setStems(null);setRemix(null);setStemMix({});setMidiResult(null)};
 const neuralScoreReady=!!latestCompleteNeuralScore(project)&&!!project.neuralAutoScore;
 const neuralScoreSeconds=Number(project.neuralAutoScore?.durationSec)||Number(project.neuralAutoScore?.bars)*4*60/Number(project.bpm);
 const neuralScoreLengthOK=Number.isFinite(neuralScoreSeconds)&&neuralScoreSeconds>=150&&neuralScoreSeconds<=360;
 // 기존 신경망 MIDI 원곡이 있을 때만 실제 MusicGen 모델에 시간표를 전달한다.
 const scoreSequenceOptions=source=>{
  if(!sequence||!scoreMatch)return null;
  if(!latestCompleteNeuralScore(source))
   throw Error('MIDI 동기화 음악 제작에는 동일 회차의 신경망 6악기 MIDI가 필요합니다.');
  const duration=Number(source.neuralAutoScore?.durationSec)||
   Number(source.neuralAutoScore?.bars)*4*60/Number(source.bpm);
  const parts=duration<=210?11:20;
  const timing=planScoreMatchedMusicGenSegments(duration,parts,{fadeSec:.5});
  const prompts=buildNeuralMusicPrompts(source,{segments:parts,seconds:18,
   crossfadeSec:.5,segmentSeconds:timing.segmentSeconds,basePrompt:prompt});
  if(prompts.length!==parts)throw Error('MIDI 원곡 구간을 MusicGen으로 연결할 수 없습니다.');
  return {segments:parts,crossfadeSec:.5,continuation:true,prompts,
   segmentSeconds:timing.segmentSeconds,trimToSeconds:timing.targetSec};
 };
 const generate=async()=>{
  if(busy)return;const initial=latest.current,controller=new AbortController();active.current=controller;setBusy(true);clear();setError('');setProgress('');
  try{
   const scoreOptions=scoreSequenceOptions(initial);
   const settings={python,modelDir,prompt,seconds:scoreOptions?18:Number(seconds),seed:Number(seed)};
   const file=sequence
    ?await generateMusicGenSequence(settings,{segments:Number(segments),crossfadeSec:Number(fade),continuation,prompts:partPrompts.split(/\r?\n/),...scoreOptions,signal:controller.signal,onProgress:(done,total)=>setProgress(`${done}/${total}개 MusicGen 구간 생성 완료`)})
    :await generateMusicGenAudio(settings,{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==initial)throw Error('생성 작업이 취소되거나 프로젝트가 변경됐습니다.');
   setWav({file,projectId:initial.id});setUrl(URL.createObjectURL(file));notify(sequence?'실제 MusicGen 오디오 구간을 크로스페이드해 WAV를 만들었습니다. 구간별 음악적 연속성은 보장하지 않습니다.':'실제 로컬 MusicGen WAV를 수신했습니다. 미리 듣고 저장할 수 있습니다.');
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false)}
 };
 const generateSixNeuralStems=async()=>{
  if(busy||!python||!modelDir||!neuralScoreReady||!neuralScoreLengthOK)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setProgress('MIDI 원곡 길이에 맞춘 독립 6악기 MusicGen 오디오 생성 중');
  try{
   const result=await renderAndStoreNeuralAudioStems(initial,{
    python,modelDir,seconds:18,segments:neuralScoreSeconds<=210?11:20,
    crossfadeSec:.5,audible:true,session:window.__MYVOCAL_SESSION_KEY,
    signal:controller.signal,current:()=>latest.current,onChange,
    newId:genId,readInfo:readAudioInfo,createTrack:makeImportedVocalTrack,
    save:putFilesAtomic,remove:deleteFilesAtomic,onProgress:setProgress
   });
   notify('기존 프로젝트에 원천 생성 6악기 MusicGen WAV '+result.tracks+'트랙을 추가했습니다. MIDI 원곡 길이 '+result.durationSec.toFixed(2)+'초에 맞췄습니다.');
  }catch(e){setError(e.message)}
  finally{active.current=null;setBusy(false);setProgress('')}
 };
 const oneClickProduction=async()=>{
  if(busy||!python||!modelDir||!demucsRepo)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setProgress('MusicGen 신경망 → Demucs 악기 분리 → PCM 마스터 생성 중');
  try{
   const scoreOptions=scoreSequenceOptions(initial);
   const result=await runMusicProductionPipeline({
    settings:{python,modelDir,prompt,seconds:scoreOptions?18:Number(seconds),seed:Number(seed)},
    sequence,segments:Number(segments),crossfadeSec:Number(fade),continuation,
    prompts:partPrompts.split(/\r?\n/),...scoreOptions,
    demucs:{python,repo:demucsRepo,model:demucsModel,device:demucsDevice},
    stemMix,signal:controller.signal,onProgress:setProgress
   });
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 제작 취소');
   // All neural model outputs become real editable audio assets in ONE project commit.
   // Demucs stems play independently; the master remains muted as a preview
   // because playing both would double the audio level.
   const saved=await persistNeuralMusicTracks(initial,result,{current:()=>latest.current,onChange,signal:controller.signal,
      info:readAudioInfo,createTrack:makeImportedVocalTrack,newId:genId,
      save:putFilesAtomic,remove:deleteFilesAtomic});
   setWav({file:result.wav,projectId:initial.id});
   setStems({...result.stems,projectId:initial.id});
   setRemix({file:result.master,projectId:initial.id});
   setUrl(URL.createObjectURL(result.wav));
   notify('실제 MusicGen·Demucs 결과 '+saved.assets+'개를 독립 WAV 트랙으로 저장했습니다. 마스터 참고 트랙은 중복 재생을 막기 위해 음소거했습니다.');
  }catch(e){setError(e.message)}
  finally{active.current=null;setBusy(false);setProgress('')}
 };
 const separate=async()=>{
  if(!wav||busy||wav.projectId!==latest.current.id)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;setBusy(true);setError('');setProgress('로컬 Demucs 신경망으로 실제 악기 분리 중');setStems(null);setRemix(null);setMidiResult(null);
  try{
   const result=await splitMusicGenStems(wav.file,{python,repo:demucsRepo,model:demucsModel,device:demucsDevice},{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 분리 취소');
   setStems({...result,projectId:initial.id});notify(`로컬 Demucs 신경망으로 ${result.stems.length}개 악기·보컬 WAV를 생성했습니다.`);
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false);setProgress('')}
 };
 const transcribeMidi=async()=>{
  if(!stems||busy||stems.projectId!==latest.current.id)return;
  const selected=stems.stems.find(x=>x.name===midiStem);
  if(!selected)return setError('MIDI로 변환할 악기 WAV를 선택하세요.');
  const original=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setProgress('설치된 Basic Pitch 신경망으로 악기 MIDI 음표 추출 중');setMidiResult(null);
  try{
   const {file,parsed}=await transcribeStemToMidi(selected.file,midiPython||python,{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==original)throw Error('MIDI 변환 중 프로젝트가 변경되거나 취소됐습니다.');
   const sourceBpm=parsed.bpm||120,projectBpm=Number(original.bpm)||120,scale=projectBpm/sourceBpm;
   const newTracks=parsed.tracks.map((t,i)=>({id:genId('trk'),name:`Basic Pitch ${midiStem} ${i+1}`,type:'instrument',
    instrument:midiStem==='other'?'piano':midiStem,volume:75,
    midiNotes:t.notes.map(n=>({...n,startBeat:+(n.startBeat*scale).toFixed(5),length:+(n.length*scale).toFixed(5)}))}));
   if(!newTracks.length)throw Error('편집할 MIDI 음표가 없습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...newTracks]}));
   setMidiResult({file,projectId:original.id});
   notify(`Basic Pitch 실제 신경망이 추정한 MIDI ${newTracks.length}트랙을 프로젝트에 추가했습니다. 음표·정확도는 편집기로 확인하세요.`);
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false);setProgress('')}
 };
 const attachStems=async()=>{
  if(!stems||busy)return;setBusy(true);setError('');const ids=[];
  try{
   const original=latest.current;if(original.id!==stems.projectId)throw Error('프로젝트가 변경됐습니다.');
   const entries=[],tracks=[];
   for(const item of stems.stems){
    const assetId=genId('demucs'),track=makeImportedVocalTrack(original,item.file,assetId,item.info.durationSec);
    track.id=genId('trk');track.name={'drums':'Demucs 드럼','bass':'Demucs 베이스','other':'Demucs 기타 악기','vocals':'Demucs 보컬','guitar':'Demucs 기타','piano':'Demucs 피아노'}[item.name];track.type=item.name==='vocals'?'vocal':'instrument';track.volume=75;
    ids.push(assetId);entries.push([assetId,item.file]);tracks.push(track);
   }
   await putFilesAtomic(entries);
   if(original!==latest.current)throw Error('분리 트랙 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...tracks]}));
   ids.length=0;setStems(null);notify(`분리한 ${tracks.length}개 WAV를 편집 가능한 별도 프로젝트 트랙으로 추가했습니다. 기존 트랙은 유지됩니다.`);
  }catch(e){if(ids.length)await deleteFilesAtomic(ids).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
 const attachEditedStems=async()=>{
  if(!stems||busy||stems.projectId!==latest.current.id)return;
  const original=latest.current,controller=new AbortController();active.current=controller;setBusy(true);setError('');setProgress('비파괴 편집된 트랙 WAV 생성 중');const ids=[];
  try{
   const rendered=await renderEditedStemTracks(stems.stems,stemMix,{signal:controller.signal,onProgress:(done,total)=>setProgress(`편집 WAV ${done}/${total}개 생성`)});
   if(controller.signal.aborted||latest.current!==original)throw Error('편집 도중 취소되거나 프로젝트가 변경됐습니다.');
   const entries=[],tracks=[];
   for(const item of rendered){
    const info=await readAudioInfo(item.file),id=genId('demucsedited'),track=makeImportedVocalTrack(original,item.file,id,info.duration);
    track.id=genId('trk');track.name=`편집된 ${item.name} WAV`;track.type=item.name==='vocals'?'vocal':'instrument';track.volume=75;
    ids.push(id);entries.push([id,item.file]);tracks.push(track);
   }
   if(controller.signal.aborted||latest.current!==original)throw Error('편집 중 프로젝트가 변경됐습니다.');
   await putFilesAtomic(entries);
   if(controller.signal.aborted||latest.current!==original)throw Error('저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...tracks]}));
   ids.length=0;notify(`비파괴 편집된 ${tracks.length}개 WAV를 새로운 편집 트랙으로 저장했습니다.`);
  }catch(e){if(ids.length)await deleteFilesAtomic(ids).catch(()=>{});setError(e.message)}
  finally{active.current=null;setBusy(false);setProgress('')}
 };
 const remixStems=async()=>{
  if(!stems||busy||stems.projectId!==latest.current.id)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setRemix(null);setProgress('실제 WAV 스테레오 믹싱·마스터링 중');
  try{
   const file=await renderStemRemixMaster(stems.stems,stemMix,{signal:controller.signal,onProgress:(done,total)=>setProgress(`실제 PCM 믹싱 ${done}/${total}프레임`)});
   if(controller.signal.aborted||latest.current!==initial)throw Error('믹싱이 취소되거나 프로젝트가 변경됐습니다.');
   setRemix({file,projectId:initial.id});notify('분리 WAV의 실제 샘플을 믹싱해 -1dBFS 피크 제한 마스터 WAV를 만들었습니다.');
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false);setProgress('')}
 };
 const attachRemix=async()=>{
  if(!remix||busy)return;setBusy(true);setError('');let id='';
  try{
   const original=latest.current;if(original.id!==remix.projectId)throw Error('프로젝트가 변경됐습니다.');
   const info=await readAudioInfo(remix.file);id=genId('stemremix');
   const track=makeImportedVocalTrack(original,remix.file,id,info.duration);
   track.id=genId('trk');track.name='Demucs 분리 트랙 스테레오 믹스';track.type='instrument';track.volume=75;
   await putFileNew(id,remix.file);
   if(original!==latest.current)throw Error('믹스 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),track]}));
   id='';setRemix(null);notify('실제 믹싱 WAV를 새 편집 트랙으로 추가했습니다. 기존 WAV·트랙은 그대로입니다.');
  }catch(e){if(id)await removeFile(id).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
 const attach=async()=>{
  if(!wav||busy)return;let assetId='';setBusy(true);setError('');
  try{
   const original=latest.current;if(original.id!==wav.projectId)throw Error('프로젝트가 바뀌었습니다.');
   const decoded=await readAudioInfo(wav.file);
   assetId=genId('musicgen');
   const track=makeImportedVocalTrack(original,wav.file,assetId,decoded.duration);
   track.id=genId('trk');track.name=wav.fromLocal?'사용자 WAV 반주':'MusicGen 신경망 반주';track.type='instrument';track.volume=75;
   await putFileNew(assetId,wav.file);
   if(original!==latest.current)throw Error('저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),track]}));
   assetId='';clear();notify(wav.fromLocal?'선택한 WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.':'MusicGen WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.');
  }catch(e){if(assetId)await removeFile(assetId).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
 return <Panel title="로컬 신경망 반주 MusicGen" description="사용자 PC에 설치한 Transformers MusicGen 모델로 실제 새 오디오 WAV를 생성해 반주 트랙으로 추가합니다.">
   <div className="mv10-grid">
    <Field label="설치된 Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\AI\python.exe"/></Field>
    <Field label="로컬 MusicGen 모델 폴더"><input value={modelDir} disabled={busy} onChange={e=>setModelDir(e.target.value)} placeholder="D:\AI\models\musicgen-small"/></Field>
    <Field label="음악 프롬프트"><textarea rows={2} value={prompt} maxLength={600} disabled={busy} onChange={e=>setPrompt(e.target.value)}/></Field>
    <Field label="길이(초)"><input type="number" min="3" max="28" value={seconds} disabled={busy} onChange={e=>setSeconds(e.target.value)}/></Field>
    <Field label="랜덤 시드"><input type="number" min="0" value={seed} disabled={busy} onChange={e=>setSeed(e.target.value)}/></Field>
   </div>
   <div className="mv7-item">
    <label><input type="checkbox" checked={sequence} disabled={busy} onChange={e=>setSequence(e.target.checked)}/> 여러 실제 MusicGen 구간을 긴 반주 WAV로 결합</label>
    {sequence&&neuralScoreReady&&<label><input type="checkbox" disabled={busy||!neuralScoreLengthOK} checked={scoreMatch} onChange={e=>setScoreMatch(e.target.checked)}/> 현재 MIDI 6악기의 실제 3~6분 길이·PCM 시간표로 MusicGen 자동 생성</label>}
    {sequence&&<label><input type="checkbox" disabled={busy||scoreMatch} checked={continuation||scoreMatch} onChange={e=>setContinuation(e.target.checked)}/> 이전 MusicGen 음원을 참조하는 실제 오디오 연속 생성 (구간당 최대 20초)</label>}
    {sequence&&<div className="mv10-grid">
      <Field label="연속 구간 수 (2~20)"><input type="number" min="2" max="20" value={segments} disabled={busy} onChange={e=>setSegments(e.target.value)}/></Field>
      <Field label="구간 사이 크로스페이드 초 (0.1~1.5)"><input type="number" step=".1" min=".1" max="1.5" value={fade} disabled={busy} onChange={e=>setFade(e.target.value)}/></Field>
      <Field label="구간별 설명 (한 줄당 한 구간, 선택)"><textarea rows={4} disabled={busy} value={partPrompts} onChange={e=>setPartPrompts(e.target.value)} placeholder={'피아노 인트로\n록 기타 후렴\n스트링과 드럼 마지막 후렴'}/></Field>
    </div>}
    {sequence&&<Button disabled={busy} onClick={()=>{try{const guide=musicGenSectionPrompts(latest.current,prompt);setSegments(String(guide.segments));setPartPrompts(guide.prompts.join("\n"));notify("현재 프로젝트의 실제 곡 구간 설명을 긴 반주 프롬프트에 적용했습니다.")}catch(e){setError(e.message)}}}>현재 Intro·Verse·Chorus 구간 반영</Button>}
    <Button disabled={busy} onClick={()=>{try{writeMusicGenPreferences(window.localStorage,{python,modelDir});notify('MusicGen 실행 경로만 이 PC에 저장했습니다. 녹음·음원은 저장하지 않습니다.')}catch(e){setError(e.message)}}}>로컬 Python·모델 경로 기억</Button>
    {sequence&&<p className="muted">예상 완성 길이: {scoreMatch&&neuralScoreLengthOK?neuralScoreSeconds.toFixed(2):Number.isFinite(Number(segments)*Number(seconds)-(Number(segments)-1)*Number(fade)) ? Math.max(0,Number(segments)*Number(seconds)-(Number(segments)-1)*Number(fade)).toFixed(1) : "계산 불가"}초 / 최대 360초. 실제 MusicGen 연속 생성은 설치된 모델에 따라 음악적 일관성이 달라집니다.</p>}
    <p className="muted">길이 설정은 구간 하나당 초이며, 긴 반주는 구간별 독립적인 AI 오디오를 이어 붙입니다. 연속 생성은 이전 6초를 모델 입력으로 사용합니다. 장편 음악의 멜로디·리듬 일관성은 모델에 따라 달라지며 보장되지 않습니다.</p>
   </div>
   <div className="mv7-actions"><Button variant="primary" disabled={busy||!python||!modelDir} onClick={generate}>{busy?(progress||'MusicGen 생성 중'):(sequence?'긴 AI 반주 WAV 일괄 생성':'로컬 AI 반주 WAV 생성')}</Button>
    {busy&&<Button onClick={()=>active.current?.abort()}>생성 취소</Button>}
    {wav&&<Button disabled={busy} onClick={attach}>확인한 반주 WAV를 프로젝트 트랙에 추가</Button>}</div>
   {neuralScoreReady&&<div className="mv7-item">
    <p className="muted">동일 AI 작곡 회차의 멜로디·코드·베이스·드럼·기타·패드 MIDI를 기준으로 6개 MusicGen WAV를 독립 생성하여 편집 트랙에 저장합니다. Demucs 사후 분리가 아니며 악기 격리 품질은 로컬 모델에 따라 달라집니다.</p>
    <p className="muted">MIDI 곡 길이: {neuralScoreLengthOK?neuralScoreSeconds.toFixed(2)+'초':'3~6분 원곡 정보 확인 필요'}</p>
    <div className="mv7-actions"><Button disabled={busy||!python||!modelDir||!neuralScoreLengthOK} onClick={generateSixNeuralStems}>MIDI 동기화 6악기 MusicGen WAV 생성·트랙 저장</Button></div>
   </div>}
   <div className="mv7-item">
    <Field label="기존 WAV 불러와서 분리"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={async e=>{
     const file=e.target.files?.[0];e.target.value='';if(!file)return;
     try{if(file.size<44||file.size>72*1024*1024)throw Error('WAV 크기는 최대 72MiB입니다.');
      const decoded=await readAudioInfo(file);if(!Number.isFinite(decoded.duration)||decoded.duration<.1||decoded.duration>360)throw Error('분리할 WAV는 0.1~360초입니다.');
      if(latest.current.id!==project.id)throw Error('프로젝트가 변경됐습니다.');
      clear();setStems(null);setWav({file,projectId:project.id,fromLocal:true});setUrl(URL.createObjectURL(file));setError('');
     }catch(err){setError(err.message)}
    }}/></Field>
    <div className="mv7-actions"><Button variant="primary" disabled={busy||!python||!modelDir||!demucsRepo} onClick={oneClickProduction}>실제 AI 반주 생성→악기 분리→믹싱·프로젝트 저장 원클릭</Button></div>
    {wav&&<p className="muted">MusicGen 결과 또는 직접 불러온 WAV를 로컬 Demucs 신경망으로 드럼·베이스·기타 악기·보컬 4개 또는 기타·피아노 포함 6개로 분리합니다. 사용자 PC에 설치된 가중치만 사용하며 자동 다운로드하지 않습니다. 원본 WAV·기존 트랙은 변경하지 않습니다.</p>}
    <div className="mv10-grid">
     <Field label="로컬 Demucs 가중치 폴더"><input value={demucsRepo} disabled={busy} onChange={e=>setDemucsRepo(e.target.value)} placeholder="D:\\AI\\demucs-models"/></Field>
     <Field label="설치된 모델 이름"><input value={demucsModel} disabled={busy} onChange={e=>setDemucsModel(e.target.value)}/></Field>
     <Field label="분리 실행 장치"><select value={demucsDevice} disabled={busy} onChange={e=>setDemucsDevice(e.target.value)}><option value="auto">자동</option><option value="cuda">CUDA GPU</option><option value="cpu">CPU</option></select></Field>
    </div>
    <div className="mv7-actions"><Button disabled={busy||!demucsRepo||!wav} onClick={separate}>실제 AI 악기 4/6트랙 분리</Button>
     {stems?.projectId===project.id&&<Button disabled={busy} onClick={attachStems}>분리된 WAV {stems.stems.length}개를 프로젝트에 추가</Button>}
     {stems?.projectId===project.id&&<Button disabled={busy} onClick={()=>{const link=URL.createObjectURL(stems.zip),a=document.createElement('a');a.href=link;a.download='MYVOCAL-Demucs-Stems.zip';a.click();setTimeout(()=>URL.revokeObjectURL(link),4000)}}>신경망 악기 WAV ZIP 저장</Button>}
    </div>
    {stems?.projectId===project.id&&<div className="mv7-item">
     <div className="mv7-item">
      <p className="muted">설치된 Basic Pitch 신경망으로 분리 악기 WAV를 실제 MIDI 음표로 추정합니다. 생성된 MIDI는 원본 WAV와 별개로 편집하며, 자동 추출 정확도는 악기마다 다릅니다.</p>
      <div className="mv10-grid">
       <Field label="Basic Pitch 설치 Python.exe"><input value={midiPython} disabled={busy} onChange={e=>setMidiPython(e.target.value)} placeholder={python||'D:\\AI\\python.exe'}/></Field>
       <Field label="MIDI 음표를 추출할 분리 트랙"><select value={midiStem} disabled={busy} onChange={e=>setMidiStem(e.target.value)}>{stems.stems.filter(x=>x.name!=='drums').map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></Field>
      </div>
      <div className="mv7-actions"><Button disabled={busy} onClick={transcribeMidi}>Basic Pitch 실제 MIDI 추출·새 편집 트랙 추가</Button>
       {midiResult?.projectId===project.id&&<Button disabled={busy} onClick={()=>{const url=URL.createObjectURL(midiResult.file),a=document.createElement('a');a.href=url;a.download='MYVOCAL-BasicPitch.mid';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000)}}>변환 MIDI 저장</Button>}
      </div>
     </div>
     <p className="muted">분리 WAV를 PCM으로 믹싱합니다. 트랙별 음량·EQ·배치 위치·원본 앞뒤 자르기·페이드를 비파괴적으로 편집합니다. 원본 WAV는 변경하지 않습니다.</p>
     {stems.stems.map(item=><div key={item.name} className="mv10-grid">
      <span>{item.name}</span>
      <Field label="음량 dB"><input type="number" min="-60" max="12" step="1" disabled={busy} value={stemMix[item.name]?.gainDb??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],gainDb:v}}));setRemix(null)}}/></Field>
      <Field label="좌우 밸런스"><input type="number" min="-100" max="100" step="10" disabled={busy} value={Math.round((stemMix[item.name]?.balance??0)*100)} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],balance:v/100}}));setRemix(null)}}/></Field>
      {['eqLowDb','eqMidDb','eqHighDb'].map((key,i)=><Field key={key} label={['저음 160Hz EQ(dB)','중음 1kHz EQ(dB)','고음 6kHz EQ(dB)'][i]}><input type="number" min="-12" max="12" step="1" disabled={busy} value={stemMix[item.name]?.[key]??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],[key]:v}}));setRemix(null)}}/></Field>)}
      {[
       ['offsetSec','트랙 시작 위치(초)'],['trimStartSec','원본 앞 자르기(초)'],['trimEndSec','원본 뒤 자르기(초)'],
       ['fadeInSec','트랙 페이드 인(초)'],['fadeOutSec','트랙 페이드 아웃(초)']
      ].map(([key,label])=><Field key={key} label={label}><input type="number" min="0" max={key.startsWith('fade')?10:360} step="0.1" disabled={busy} value={stemMix[item.name]?.[key]??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],[key]:v}}));setRemix(null)}}/></Field>)}
      <label><input type="checkbox" disabled={busy} checked={!!stemMix[item.name]?.mute} onChange={e=>{const v=e.target.checked;setStemMix(m=>({...m,[item.name]:{...m[item.name],mute:v}}));setRemix(null)}}/> 음소거</label>
     </div>)}
     <Field label="마스터 목표 LUFS (미설정=기존 피크 제한만)"><select disabled={busy} value={stemMix._master?.targetLufs??''} onChange={e=>{const value=e.target.value;setStemMix(m=>({...m,_master:{...m._master,targetLufs:value===''?null:Number(value)}}));setRemix(null)}}><option value="">기존 피크 제한만</option><option value="-24">-24 LUFS</option><option value="-18">-18 LUFS</option><option value="-16">-16 LUFS</option><option value="-14">-14 LUFS</option><option value="-12">-12 LUFS</option><option value="-9">-9 LUFS</option></select></Field>
     <div className="mv10-grid">{['fadeInSec','fadeOutSec'].map((key,i)=><Field key={key} label={['마스터 페이드 인(초)','마스터 페이드 아웃(초)'][i]}><input type="number" min="0" max="10" step="0.1" disabled={busy} value={stemMix._master?.[key]??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,_master:{...m._master,[key]:v}}));setRemix(null)}}/></Field>)}</div>
     <div className="mv10-grid">
      <label><input type="checkbox" disabled={busy} checked={!!stemMix._master?.duckEnabled} onChange={e=>{const enabled=e.target.checked;setStemMix(m=>({...m,_master:{...m._master,duckEnabled:enabled}}));setRemix(null)}}/> 보컬 감지 반주 자동 감쇠(사이드체인)</label>
      {[
       ['duckThresholdDb','보컬 감지 기준(dBFS)',-60,-1,1,-28],
       ['duckReductionDb','반주 최대 감쇠(dB)',0,18,1,8],
       ['duckAttackMs','감쇠 시작(ms)',5,250,5,30],
       ['duckReleaseMs','감쇠 복원(ms)',50,1500,50,350]
      ].map(([key,label,min,max,step,fallback])=><Field key={key} label={label}><input type="number" min={min} max={max} step={step} disabled={busy||!stemMix._master?.duckEnabled} value={stemMix._master?.[key]??fallback} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,_master:{...m._master,[key]:v}}));setRemix(null)}}/></Field>)}
     </div>
     <div className="mv7-actions">
      <Button disabled={busy} onClick={()=>{try{const text=serializeStemMixPreset(stemMix,stems.stems.length),link=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=link;a.download='MYVOCAL-믹싱설정.json';a.click();setTimeout(()=>URL.revokeObjectURL(link),4000)}catch(e){setError(e.message)}}}>믹싱 설정 JSON 저장</Button>
      <label>믹싱 설정 JSON 불러오기 <input type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>65536)throw Error('믹싱 설정은 64KiB 이하여야 합니다.');const loaded=parseStemMixPreset(await file.text(),stems.stems.length);setStemMix(loaded);setRemix(null);notify('믹싱 설정만 불러왔습니다. 기존 음원과 프로젝트는 유지됩니다.')}catch(err){setError(err.message)}}}/></label>
     </div>
     <div className="mv7-actions"><Button disabled={busy} onClick={attachEditedStems}>시간·EQ 편집된 개별 WAV를 새 프로젝트 트랙에 추가</Button><Button disabled={busy} onClick={remixStems}>실제 WAV 믹싱·마스터링</Button>
      {remix?.projectId===project.id&&<Button disabled={busy} onClick={attachRemix}>믹스 WAV를 새 프로젝트 트랙에 추가</Button>}
      {remix?.projectId===project.id&&<Button disabled={busy} onClick={()=>{const link=URL.createObjectURL(remix.file),a=document.createElement('a');a.href=link;a.download='MYVOCAL-Stems-Master.wav';a.click();setTimeout(()=>URL.revokeObjectURL(link),4000)}}>마스터 WAV 저장</Button>}
     </div>
    </div>}
   </div>
   {progress&&<p role="status" className="muted">{progress}</p>}
   {url&&<audio controls preload="metadata" src={url}/>} {error&&<p role="alert" className="mv4-error">{error}</p>}
   <Notice>Python에 torch·transformers, 모델 폴더에 로컬 MusicGen 가중치가 있어야 합니다. 인터넷에서 자동 다운로드하지 않으며 가창 음색 학습이나 사람 목소리 Singing 기능이 아닙니다. 3~28초 반주 클립 생성으로 전체 곡 편곡은 추가 작업입니다.</Notice>
 </Panel>;
}