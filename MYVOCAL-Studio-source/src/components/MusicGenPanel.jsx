import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {generateMusicGenAudio} from '../lib/musicGenClient.js';
import {readAudioInfo} from '../lib/audioEngine';
import {genId} from '../lib/schema';
import {putFileNew,removeFile} from '../lib/assetDb';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
export default function MusicGenPanel({project,onChange,notify}){
 const [python,setPython]=useState(''),[modelDir,setModelDir]=useState(''),[prompt,setPrompt]=useState('cinematic instrumental music'),[seconds,setSeconds]=useState('12'),[seed,setSeed]=useState('42');
 const [wav,setWav]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 useEffect(()=>{setWav(null);setUrl('');setError('')},[project.id]);
 const clear=()=>{setWav(null);setUrl('')};
 const generate=async()=>{
  if(busy)return;const initial=latest.current,controller=new AbortController();active.current=controller;setBusy(true);clear();setError('');
  try{
   const file=await generateMusicGenAudio({python,modelDir,prompt,seconds:Number(seconds),seed:Number(seed)},{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==initial)throw Error('생성 작업이 취소되거나 프로젝트가 변경됐습니다.');
   setWav({file,projectId:initial.id});setUrl(URL.createObjectURL(file));notify('실제 로컬 MusicGen WAV를 수신했습니다. 미리 듣고 저장할 수 있습니다.');
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
   <div className="mv7-actions"><Button variant="primary" disabled={busy||!python||!modelDir} onClick={generate}>{busy?'MusicGen 생성 중':'로컬 AI 반주 WAV 생성'}</Button>
    {busy&&<Button onClick={()=>active.current?.abort()}>생성 취소</Button>}
    {wav&&<Button disabled={busy} onClick={attach}>확인한 반주 WAV를 프로젝트 트랙에 추가</Button>}</div>
   {url&&<audio controls preload="metadata" src={url}/>} {error&&<p role="alert" className="mv4-error">{error}</p>}
   <Notice>Python에 torch·transformers, 모델 폴더에 로컬 MusicGen 가중치가 있어야 합니다. 인터넷에서 자동 다운로드하지 않으며 가창 음색 학습이나 사람 목소리 Singing 기능이 아닙니다. 3~28초 반주 클립 생성으로 전체 곡 편곡은 추가 작업입니다.</Notice>
 </Panel>;
}