import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {generateMusicGenAudio} from '../lib/musicGenClient.js';
import {generateMusicGenSequence} from '../lib/musicGenSequence.js';
import {readMusicGenPreferences,writeMusicGenPreferences} from '../lib/musicGenPreferences.js';
import {musicGenSectionPrompts} from '../lib/musicGenSectionPrompts.js';
import {readAudioInfo} from '../lib/audioEngine';
import {genId} from '../lib/schema';
import {putFileNew,removeFile} from '../lib/assetDb';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
export default function MusicGenPanel({project,onChange,notify}){
 const [paths]=useState(()=>{try{return readMusicGenPreferences(window.localStorage)}catch{return {}}});
 const [python,setPython]=useState(paths.python||''),[modelDir,setModelDir]=useState(paths.modelDir||''),[prompt,setPrompt]=useState('cinematic instrumental music'),[seconds,setSeconds]=useState('12'),[seed,setSeed]=useState('42');
 const [wav,setWav]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [sequence,setSequence]=useState(false),[continuation,setContinuation]=useState(false),[segments,setSegments]=useState('4'),[fade,setFade]=useState('0.5'),[partPrompts,setPartPrompts]=useState(''),[progress,setProgress]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 useEffect(()=>{setWav(null);setUrl('');setError('')},[project.id]);
 const clear=()=>{setWav(null);setUrl('')};
 const generate=async()=>{
  if(busy)return;const initial=latest.current,controller=new AbortController();active.current=controller;setBusy(true);clear();setError('');setProgress('');
  try{
   const settings={python,modelDir,prompt,seconds:Number(seconds),seed:Number(seed)};
   const file=sequence
    ?await generateMusicGenSequence(settings,{segments:Number(segments),crossfadeSec:Number(fade),continuation,prompts:partPrompts.split(/\r?\n/),signal:controller.signal,onProgress:(done,total)=>setProgress(`${done}/${total}개 MusicGen 구간 생성 완료`)})
    :await generateMusicGenAudio(settings,{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==initial)throw Error('생성 작업이 취소되거나 프로젝트가 변경됐습니다.');
   setWav({file,projectId:initial.id});setUrl(URL.createObjectURL(file));notify(sequence?'실제 MusicGen 오디오 구간을 크로스페이드해 WAV를 만들었습니다. 구간별 음악적 연속성은 보장하지 않습니다.':'실제 로컬 MusicGen WAV를 수신했습니다. 미리 듣고 저장할 수 있습니다.');
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false)}
 };
 const attach=async()=>{
  if(!wav||busy)return;let assetId='';setBusy(true);setError('');
  try{
   const original=latest.current;if(original.id!==wav.projectId)throw Error('프로젝트가 바뀌었습니다.');
   const decoded=await readAudioInfo(wav.file);
   assetId=genId('musicgen');
   const track=makeImportedVocalTrack(original,wav.file,assetId,decoded.duration);
   track.id=genId('trk');track.name='MusicGen 신경망 반주';track.type='instrument';track.volume=75;
   await putFileNew(assetId,wav.file);
   if(original!==latest.current)throw Error('저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),track]}));
   assetId='';clear();notify('MusicGen WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.');
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
    {sequence&&<label><input type="checkbox" disabled={busy} checked={continuation} onChange={e=>setContinuation(e.target.checked)}/> 이전 MusicGen 음원을 참조하는 실제 오디오 연속 생성 (구간당 최대 20초)</label>}
    {sequence&&<div className="mv10-grid">
      <Field label="연속 구간 수 (2~8)"><input type="number" min="2" max="8" value={segments} disabled={busy} onChange={e=>setSegments(e.target.value)}/></Field>
      <Field label="구간 사이 크로스페이드 초 (0.1~1.5)"><input type="number" step=".1" min=".1" max="1.5" value={fade} disabled={busy} onChange={e=>setFade(e.target.value)}/></Field>
      <Field label="구간별 설명 (한 줄당 한 구간, 선택)"><textarea rows={4} disabled={busy} value={partPrompts} onChange={e=>setPartPrompts(e.target.value)} placeholder={'피아노 인트로\n록 기타 후렴\n스트링과 드럼 마지막 후렴'}/></Field>
    </div>}
    {sequence&&<Button disabled={busy} onClick={()=>{try{const guide=musicGenSectionPrompts(latest.current,prompt);setSegments(String(guide.segments));setPartPrompts(guide.prompts.join("\n"));notify("현재 프로젝트의 실제 곡 구간 설명을 긴 반주 프롬프트에 적용했습니다.")}catch(e){setError(e.message)}}}>현재 Intro·Verse·Chorus 구간 반영</Button>}
    <Button disabled={busy} onClick={()=>{try{writeMusicGenPreferences(window.localStorage,{python,modelDir});notify('MusicGen 실행 경로만 이 PC에 저장했습니다. 녹음·음원은 저장하지 않습니다.')}catch(e){setError(e.message)}}}>로컬 Python·모델 경로 기억</Button>
    <p className="muted">길이 설정은 구간 하나당 초이며, 긴 반주는 구간별 독립적인 AI 오디오를 이어 붙입니다. 연속 생성은 이전 6초를 모델 입력으로 사용합니다. 장편 음악의 멜로디·리듬 일관성은 모델에 따라 달라지며 보장되지 않습니다.</p>
   </div>
   <div className="mv7-actions"><Button variant="primary" disabled={busy||!python||!modelDir} onClick={generate}>{busy?(progress||'MusicGen 생성 중'):(sequence?'긴 AI 반주 WAV 일괄 생성':'로컬 AI 반주 WAV 생성')}</Button>
    {busy&&<Button onClick={()=>active.current?.abort()}>생성 취소</Button>}
    {wav&&<Button disabled={busy} onClick={attach}>확인한 반주 WAV를 프로젝트 트랙에 추가</Button>}</div>
   {progress&&<p role="status" className="muted">{progress}</p>}
   {url&&<audio controls preload="metadata" src={url}/>} {error&&<p role="alert" className="mv4-error">{error}</p>}
   <Notice>Python에 torch·transformers, 모델 폴더에 로컬 MusicGen 가중치가 있어야 합니다. 인터넷에서 자동 다운로드하지 않으며 가창 음색 학습이나 사람 목소리 Singing 기능이 아닙니다. 3~28초 반주 클립 생성으로 전체 곡 편곡은 추가 작업입니다.</Notice>
 </Panel>;
}