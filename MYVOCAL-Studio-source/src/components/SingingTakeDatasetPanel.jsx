import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {parseDiffSingerDictionary} from '../lib/diffSingerNative.js';
import {exportSingingTakeDataset,planSingingTakePhrases} from '../lib/singingTakeDataset.js';
import {isAlignmentStale} from '../lib/lyricAlignment.js';

// 기존 Windows EXE Singing Workbench의 사용자 녹음→학습용 PCM/음소 페어 내보내기.
export default function SingingTakeDatasetPanel({project,voice,alignment,notify,onDatasetReady}){
 const [recording,setRecording]=useState(null),[extraRecordings,setExtraRecordings]=useState([]),
  [dictionaryFile,setDictionaryFile]=useState(null);
 const [recordingStartSec,setRecordingStartSec]=useState('0');
 const [rights,setRights]=useState(false),[busy,setBusy]=useState(false);
 const [status,setStatus]=useState(''),[error,setError]=useState('');
 const latest=useRef(project),abort=useRef(null);latest.current=project;
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{abort.current?.abort();setRecording(null);setExtraRecordings([]);setDictionaryFile(null);
  setRights(false);setRecordingStartSec('0');setStatus('');setError('');},[project.id,voice?.id]);
 const available=alignment&&!isAlignmentStale(project,alignment)&&
  ['self','owned','licensed'].includes(voice?.rights);
 let planned=0,planError='';
 if(available)try{planned=planSingingTakePhrases(project,alignment,
  {recordingStartSec:Number(recordingStartSec),clipToRange:extraRecordings.length>0}).length;}
 catch(e){planError=e.message;}
 const validFirst=String(recordingStartSec).trim()!==''&&
  Number.isFinite(Number(recordingStartSec))&&Number(recordingStartSec)>=0&&Number(recordingStartSec)<360;
 const validExtras=extraRecordings.length<=11&&extraRecordings.every(t=>
  t.file instanceof Blob&&String(t.startSec).trim()!==''&&
  Number.isFinite(Number(t.startSec))&&Number(t.startSec)>=0&&Number(t.startSec)<360);
 async function save(){
  if(busy)return;
  const current=latest.current,controller=new AbortController();
  abort.current=controller;setBusy(true);setError('');setStatus('실제 WAV 구간을 추출하고 한국어 음소 라벨을 작성 중');
  try{
   if(!available||!rights)throw Error('현재 프로젝트와 녹음·가사·모델의 사용 권한을 확인하세요.');
   if(!recording||!dictionaryFile)throw Error('실제 노래 녹음 WAV와 모델 한국어 발음 사전을 선택하세요.');
   if(!validFirst||!validExtras)throw Error('첫 녹음과 추가 녹음 11개 이하의 원곡 시작 초를 정확히 입력하세요.');
   if(dictionaryFile.size>2*1024*1024)throw Error('한국어 발음 사전은 2MB 이하여야 합니다.');
   const dictionary=parseDiffSingerDictionary(await dictionaryFile.text());
   const input=extraRecordings.length?
    [{file:recording,startSec:Number(recordingStartSec)},
     ...extraRecordings.map(t=>({file:t.file,startSec:Number(t.startSec)}))]:recording;
   const bundle=await exportSingingTakeDataset(current,alignment,input,dictionary,{
    voice,recordingStartSec:Number(recordingStartSec),rightsConfirmed:true,signal:controller.signal});
   if(controller.signal.aborted||latest.current!==current)
    throw Error('프로젝트가 바뀌었거나 학습 자료 제작이 취소됐습니다.');
   const readyFile=new File([bundle.bytes],bundle.fileName,{type:'application/zip'});
   onDatasetReady?.({file:readyFile,projectId:current.id,voiceId:voice.id});
   const url=URL.createObjectURL(readyFile);
   try{const a=document.createElement('a');a.href=url;a.download=bundle.fileName;a.click();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),5000);}
   setStatus('실제 녹음에서 '+bundle.manifest.phrases.length+'개 WAV·가사·MIDI 음소 라벨을 내보냈습니다. 신경망 학습은 아직 실행하지 않았습니다.');
   notify('실제 녹음 '+bundle.manifest.recordings.length+'개 원본을 보존하고 학습용 데이터를 Windows 신경망 학습 화면에도 전달했습니다.');
  }catch(e){setError(e.message||String(e));notify('가창 학습 자료 생성 실패: '+(e.message||String(e)));}
  finally{if(abort.current===controller)abort.current=null;setBusy(false);}
 }
 return <Panel title="한국어 실제 가창 녹음·MIDI 학습 자료" description="내가 부른 실제 노래 WAV와 같은 곡의 가사·MIDI를 연결해 신경망 학습 전처리용 PCM 구간과 음소 라벨을 만듭니다. 기존 음성·프로젝트는 변경하지 않습니다.">
  <div className="mv7-columns">
   <Field label="본인 또는 허가받은 실제 노래 녹음 (16비트 PCM WAV)">
    <input type="file" accept=".wav,audio/wav" disabled={busy}
     onChange={e=>setRecording(e.target.files?.[0]||null)}/>
   </Field>
   <Field label="추가 가창 녹음 WAV (최대 11개 · 각 녹음의 원곡 시작 초를 별도 지정)">
    <input type="file" multiple accept=".wav,audio/wav" disabled={busy}
     onChange={e=>setExtraRecordings([...e.target.files].map((file,index)=>({file,startSec:'',key:index+'-'+file.name})))}/>
   </Field>
   {extraRecordings.map((take,index)=><Field key={take.key} label={(index+2)+'번 녹음 '+take.file.name+' · 첫 샘플의 원곡 시작 초'}>
    <input type="number" min="0" max="360" step="0.01" value={take.startSec}
     disabled={busy} placeholder="원곡 시작 초 필수"
     onChange={e=>setExtraRecordings(old=>old.map((item,i)=>i===index?{...item,startSec:e.target.value}:item))}/>
   </Field>)}
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
   <Button icon="download" variant="primary" disabled={busy||!available||!rights||!recording||!dictionaryFile||!!planError||!validFirst||!validExtras}
    onClick={save}>실제 가창 PCM·음소 학습 데이터 ZIP</Button>
   <Button disabled={!busy} onClick={()=>abort.current?.abort()}>제작 취소</Button>
   <Status>{available?(planError?'구간 설정 확인':extraRecordings.length?
    '실제 녹음 '+(extraRecordings.length+1)+'개 · 파일별 MIDI 범위는 추출 시 확인':
    '학습용 후보 '+planned+'구간'):'가사·MIDI 싱크와 권한 있는 Voice 필요'}</Status>
  </div>
  {planError&&<Notice>{planError}</Notice>}
  {status&&<Notice>{status}</Notice>}
  {error&&<Notice>오류: {error}</Notice>}
  <Notice>여러 가창 WAV를 추가하면 각 파일의 원곡 시작 초에 해당하는 MIDI 구간만 추출하고 하나의 학습 ZIP으로 합칩니다. 잘린 음표는 자동 보정하거나 가짜 녹음으로 채우지 않습니다. 이 기능은 실제 녹음 PCM을 자르고 현재 MIDI 음정·가사에서 음소 시간을 추정합니다. 녹음 발음의 강제 정렬이나 DiffSinger 모델 학습·GPU 실행은 하지 않습니다. 학습 전 음소 라벨 검수와 설치한 모델에 맞는 전처리가 필요합니다.</Notice>
 </Panel>;
}
