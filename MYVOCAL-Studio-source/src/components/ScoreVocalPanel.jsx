import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Panel} from './UI';
import {isAlignmentStale,makeImportedVocalTrack} from '../lib/lyricAlignment';
import {renderRecordedScoreVocal,scoreVocalNotes} from '../lib/scoreVocalClient.js';
import {readAudioInfo} from '../lib/audioEngine';
import {genId} from '../lib/schema';
import {putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {readMusicGenPreferences} from '../lib/musicGenPreferences.js';

// Added to the EXISTING Singing Workbench tab, never a replacement app.
export default function ScoreVocalPanel({project,onChange,notify}){
 const [python,setPython]=useState(()=>{try{return readMusicGenPreferences(window.localStorage).python||''}catch{return ''}});
 const [recording,setRecording]=useState(null),[strength,setStrength]=useState('1');
 const [harmony,setHarmony]=useState('0'),[rights,setRights]=useState(false);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>{active.current?.abort();setRecording(null);setStatus('');setError('');setRights(false)},[project.id]);
 const alignment=project.vocalAlignment&&!isAlignmentStale(project,project.vocalAlignment)?project.vocalAlignment:null;
 let noteCount=0;try{if(alignment)noteCount=scoreVocalNotes(alignment).length}catch{}
 async function create(){
  if(busy)return;
  const original=latest.current;
  if(!recording||!alignment)return setError('가사·MIDI 싱크와 실제 녹음 WAV가 필요합니다.');
  const controller=new AbortController();active.current=controller;setBusy(true);setError('');setStatus('녹음 가이드 실제 PCM 음정 보정 중…');
  const ids=[];
  try{
   const files=[await renderRecordedScoreVocal(recording,alignment,{python,strength:Number(strength),rightsConfirmed:rights},{signal:controller.signal})];
   const interval=Number(harmony);
   if(interval!==0){
    setStatus('같은 녹음으로 MIDI 화음 PCM WAV 생성 중…');
    files.push(await renderRecordedScoreVocal(recording,alignment,{python,strength:Number(strength),interval,rightsConfirmed:rights},{signal:controller.signal}));
   }
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 보컬 음정 보정 취소');
   const entries=[],tracks=[];
   for(let i=0;i<files.length;i++){
    const file=files[i],info=await readAudioInfo(file),id=genId('score_vocal');
    const track=makeImportedVocalTrack(original,file,id,info.duration);
    track.name=i?'녹음 기반 보컬 화음 WAV':'녹음 기반 MIDI 음정 보정 WAV';
    ids.push(id);entries.push([id,file]);tracks.push(track);
   }
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 보컬 음정 보정 취소');
   await putFilesAtomic(entries);
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 보컬 음정 보정 취소');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...tracks]}));
   ids.length=0;
   setStatus(`${tracks.length}개 실제 PCM WAV를 새 프로젝트 트랙으로 추가했습니다.`);
   notify('녹음 기반 MIDI 음정 보정·화음 WAV를 기존 프로젝트에 추가했습니다. 실제 신경망 Singing은 아닙니다.');
  }catch(e){if(ids.length)await deleteFilesAtomic(ids).catch(()=>{});setError(e.message)}
  finally{active.current=null;setBusy(false)}
 }
 return <Panel title="녹음 가이드 → MIDI 음정 보정·화음" description="이미 녹음한 가사/보컬을 실제 음표 높이로 보정하고 별도 WAV 트랙으로 추가합니다.">
  <p className="muted">실제 음성 PCM을 분석·변환합니다. 가사를 새로 발음시키는 신경망 Singing은 아닙니다. 원본 녹음은 읽기만 하며 삭제·덮어쓰기하지 않습니다. 음표 시간과 녹음 구간이 맞아야 합니다.</p>
  <div className="mv10-grid">
   <Field label="설치된 Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\\AI\\python.exe"/></Field>
   <Field label="가사가 들어 있는 녹음 WAV"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={e=>setRecording(e.target.files?.[0]||null)}/></Field>
   <Field label="음정 보정 강도 0~1"><input type="number" min="0" max="1" step="0.1" value={strength} disabled={busy} onChange={e=>setStrength(e.target.value)}/></Field>
   <Field label="추가 화음 반음 이동 (0=없음)"><input type="number" min="-12" max="12" step="1" value={harmony} disabled={busy} onChange={e=>setHarmony(e.target.value)}/></Field>
  </div>
  <label className="check-item"><input type="checkbox" checked={rights} disabled={busy} onChange={e=>setRights(e.target.checked)}/>녹음 및 보컬 음성 사용 권한을 확인했습니다.</label>
  <p className="muted">유효한 MIDI 음표: {noteCount}개 (최대 400개). Python에 numpy, librosa, soundfile이 설치돼 있어야 합니다.</p>
  <div className="mv7-actions"><Button disabled={busy||!recording||!alignment||!rights||!python||!noteCount} onClick={create}>{busy?'처리 중':'실제 녹음 WAV 음정 보정·화음 트랙 생성'}</Button>
   {busy&&<Button onClick={()=>active.current?.abort()}>보컬 변환 취소</Button>}</div>
  {status&&<p role="status" className="muted">{status}</p>}{error&&<p role="alert" className="mv4-error">{error}</p>}
 </Panel>;
}
