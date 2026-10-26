import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {parseDiffSingerDictionary} from '../lib/diffSingerNative.js';
import {exportSingingTakeDataset,planSingingTakePhrases} from '../lib/singingTakeDataset.js';
import {isAlignmentStale} from '../lib/lyricAlignment.js';

// 기존 Windows EXE Singing Workbench의 사용자 녹음→학습용 PCM/음소 페어 내보내기.
export default function SingingTakeDatasetPanel({project,voice,alignment,notify,onDatasetReady}){
 const [recording,setRecording]=useState(null),[dictionaryFile,setDictionaryFile]=useState(null);
 const [recordingStartSec,setRecordingStartSec]=useState('0');
 const [rights,setRights]=useState(false),[busy,setBusy]=useState(false);
 const [status,setStatus]=useState(''),[error,setError]=useState('');
 const latest=useRef(project),abort=useRef(null);latest.current=project;
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{abort.current?.abort();setRecording(null);setDictionaryFile(null);
  setRights(false);setRecordingStartSec('0');setStatus('');setError('');},[project.id,voice?.id]);
 const available=alignment&&!isAlignmentStale(project,alignment)&&
  ['self','owned','licensed'].includes(voice?.rights);
 let planned=0,planError='';
 if(available)try{planned=planSingingTakePhrases(project,alignment,
  {recordingStartSec:Number(recordingStartSec)}).length;}
 catch(e){planError=e.message;}
 async function save(){
  if(busy)return;
  const current=latest.current,controller=new AbortController();
  abort.current=controller;setBusy(true);setError('');setStatus('실제 WAV 구간을 추출하고 한국어 음소 라벨을 작성 중');
  try{
   if(!available||!rights)throw Error('현재 프로젝트와 녹음·가사·모델의 사용 권한을 확인하세요.');
   if(!recording||!dictionaryFile)throw Error('실제 노래 녹음 WAV와 모델 한국어 발음 사전을 선택하세요.');
   if(dictionaryFile.size>2*1024*1024)throw Error('한국어 발음 사전은 2MB 이하여야 합니다.');
   const dictionary=parseDiffSingerDictionary(await dictionaryFile.text());
   const bundle=await exportSingingTakeDataset(current,alignment,recording,dictionary,{
    voice,recordingStartSec:Number(recordingStartSec),rightsConfirmed:true,signal:controller.signal});
   if(controller.signal.aborted||latest.current!==current)
    throw Error('프로젝트가 바뀌었거나 학습 자료 제작이 취소됐습니다.');
   const readyFile=new File([bundle.bytes],bundle.fileName,{type:'application/zip'});
   onDatasetReady?.({file:readyFile,projectId:current.id,voiceId:voice.id});
   const url=URL.createObjectURL(readyFile);
   try{const a=document.createElement('a');a.href=url;a.download=bundle.fileName;a.click();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),5000);}
   setStatus('실제 녹음에서 '+bundle.manifest.phrases.length+'개 WAV·가사·MIDI 음소 라벨을 내보냈습니다. 신경망 학습은 아직 실행하지 않았습니다.');
   notify('원본 녹음을 보존하고 가창 학습용 데이터를 만들어 Windows 신경망 학습 화면에도 전달했습니다.');
  }catch(e){setError(e.message||String(e));notify('가창 학습 자료 생성 실패: '+(e.message||String(e)));}
  finally{if(abort.current===controller)abort.current=null;setBusy(false);}
 }
 return <Panel title="한국어 실제 가창 녹음·MIDI 학습 자료" description="내가 부른 실제 노래 WAV와 같은 곡의 가사·MIDI를 연결해 신경망 학습 전처리용 PCM 구간과 음소 라벨을 만듭니다. 기존 음성·프로젝트는 변경하지 않습니다.">
  <div className="mv7-columns">
   <Field label="본인 또는 허가받은 실제 노래 녹음 (16비트 PCM WAV)">
    <input type="file" accept=".wav,audio/wav" disabled={busy}
     onChange={e=>setRecording(e.target.files?.[0]||null)}/>
   </Field>
   <Field label="현재 DiffSinger 학습 모델 한국어 발음 사전 (탭 구분 TXT)">
    <input type="file" accept=".txt,.dict,text/plain" disabled={busy}
     onChange={e=>setDictionaryFile(e.target.files?.[0]||null)}/>
   </Field>
   <Field label="선택 녹음의 첫 샘플이 원곡에서 시작하는 시각 (초)">
    <input type="number" min="0" max="360" step="0.01" value={recordingStartSec}
     disabled={busy} onChange={e=>setRecordingStartSec(e.target.value)}/>
   </Field>
  </div>
  <label className="mv7-hint"><input type="checkbox" checked={rights} disabled={busy}
   onChange={e=>setRights(e.target.checked)}/> 녹음·가사·발음 사전·가창 모델의 학습 및 사용 권한을 확인했습니다.</label>
  <div className="mv7-actions">
   <Button icon="download" variant="primary" disabled={busy||!available||!rights||!recording||!dictionaryFile||!!planError}
    onClick={save}>실제 가창 PCM·음소 학습 데이터 ZIP</Button>
   <Button disabled={!busy} onClick={()=>abort.current?.abort()}>제작 취소</Button>
   <Status>{available?(planError?'구간 설정 확인':'학습용 후보 '+planned+'구간'):'가사·MIDI 싱크와 권한 있는 Voice 필요'}</Status>
  </div>
  {planError&&<Notice>{planError}</Notice>}
  {status&&<Notice>{status}</Notice>}
  {error&&<Notice>오류: {error}</Notice>}
  <Notice>이 기능은 실제 녹음 PCM을 자르고 현재 MIDI 음정·가사에서 음소 시간을 추정합니다. 녹음 발음의 강제 정렬이나 DiffSinger 모델 학습·GPU 실행은 하지 않습니다. 학습 전 음소 라벨 검수와 설치한 모델에 맞는 전처리가 필요합니다.</Notice>
 </Panel>;
}
