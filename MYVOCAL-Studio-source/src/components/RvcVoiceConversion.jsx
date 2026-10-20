import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {convertVoiceWithRVC} from '../lib/rvcVoiceConversion.js';
import {genId} from '../lib/schema';
import {putFileNew,removeFile} from '../lib/assetDb';
import {readAudioInfo} from '../lib/audioEngine';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';

export default function RvcVoiceConversion({project,onChange,notify}){
 const [source,setSource]=useState(null),[root,setRoot]=useState(''),[python,setPython]=useState(''),[model,setModel]=useState(''),[rightsConfirmed,setRightsConfirmed]=useState(false);
 const [pitch,setPitch]=useState('0'),[indexRate,setIndexRate]=useState('0'),[f0,setF0]=useState('rmvpe');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[converted,setConverted]=useState(null),[url,setUrl]=useState('');
 const abort=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 useEffect(()=>{setConverted(null);setUrl('');setError('');},[project.id]);
 const clearOutput=()=>{setConverted(null);setUrl('')};
 const convert=async()=>{
  if(!source||busy)return;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);setError('');clearOutput();
  const base=latest.current;
  try{
   const settings={root,python,model,pitch,indexRate,f0,rightsConfirmed};
   const result=await convertVoiceWithRVC(source,settings,{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal});
   if(controller.signal.aborted||latest.current!==base)throw Error('RVC 처리 중 프로젝트가 변경됐거나 취소되었습니다.');
   setConverted({file:result,projectId:base.id});setUrl(URL.createObjectURL(result));
   notify('설치된 RVC 모델에서 실제 WAV를 수신했습니다. 재생한 후 프로젝트 트랙에 적용하세요.');
  }catch(err){setError(err.message)}finally{abort.current=null;setBusy(false)}
 };
 const attach=async()=>{
  if(!converted||busy)return;setBusy(true);setError('');
  let assetId='';
  try{
   if(latest.current.id!==converted.projectId)throw Error('프로젝트가 변경되어 변환 WAV를 다시 확인해야 합니다.');
   const current=latest.current;
   const info=await readAudioInfo(converted.file);
   if(!Number.isFinite(info.duration)||info.duration<=0||info.duration>300)throw Error('변환한 보컬 WAV의 길이가 올바르지 않습니다.');
   assetId=genId('vocal_wav');
   const track=makeImportedVocalTrack(current,converted.file,assetId,info.duration);
   track.name='RVC 로컬 음색 변환 보컬';
   await putFileNew(assetId,converted.file);
   if(latest.current!==current)throw Error('보컬 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...current,tracks:[...(current.tracks||[]),track]}));
   assetId=''; // The committed project now owns this new asset.
   notify('RVC 실제 WAV를 원본과 구분된 새로운 보컬 트랙에 추가했습니다.');
   clearOutput();
  }catch(err){if(assetId)await removeFile(assetId).catch(()=>{});setError(err.message)}
  finally{setBusy(false)}
 };
 return <Panel title="D. 설치된 RVC 모델로 실제 음색 변환" description="직접 설치한 RVC 신경망 음색 모델(.pth)로 이미 녹음하거나 부른 WAV를 변환합니다. 실제 RVC infer/cli.py를 호출하며 결과를 WAV로 받습니다.">
  <Notice>RVC 음색 변환은 학습이나 한국어 가사 발성 생성 기능이 아닙니다. **이미 노래한 WAV**를 준비하고 권한을 보유한 목소리 모델을 선택해야 합니다. 외부 유료 API는 사용하지 않습니다.</Notice>
  <Field label="변환할 원본 가창 WAV"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={e=>{setSource(e.target.files?.[0]||null);clearOutput()}}/></Field>
  <div className="mv10-grid">
   <Field label="RVC 설치 폴더 (절대 경로)"><input value={root} onChange={e=>setRoot(e.target.value)} placeholder="D:\\RVC" disabled={busy}/></Field>
   <Field label="RVC Python.exe (절대 경로)"><input value={python} onChange={e=>setPython(e.target.value)} placeholder="D:\\RVC\\runtime\\python.exe" disabled={busy}/></Field>
   <Field label="RVC 학습 완료 모델 .pth"><input value={model} onChange={e=>setModel(e.target.value)} placeholder="D:\\RVC\\assets\\weights\\myvoice.pth" disabled={busy}/></Field>
   <Field label="피치 이동 (반음)"><input value={pitch} type="number" min="-24" max="24" onChange={e=>setPitch(e.target.value)} disabled={busy}/></Field>
   <Field label="인덱스 비율 (0~1)"><input value={indexRate} type="number" min="0" max="1" step="0.05" onChange={e=>setIndexRate(e.target.value)} disabled={busy}/></Field>
   <Field label="F0 추출 방식"><select value={f0} onChange={e=>setF0(e.target.value)} disabled={busy}><option value="rmvpe">RMVPE</option><option value="pm">PM</option></select></Field>
  </div>
  <label className="check-item"><input type="checkbox" checked={rightsConfirmed} disabled={busy} onChange={e=>setRightsConfirmed(e.target.checked)}/>녹음 및 RVC 모델을 사용할 정당한 권한이 있습니다.</label>
  <div className="mv7-actions">
   <Button variant="primary" disabled={busy||!source||!rightsConfirmed} onClick={convert}>{busy?'RVC 변환 중':'설치된 RVC로 실제 WAV 변환'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>변환 취소</Button>}
   {converted&&<Button disabled={busy} onClick={attach}>확인한 WAV를 새 보컬 트랙에 추가</Button>}
  </div>
  {url&&<audio src={url} controls preload="metadata"/>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Status>모델·Python·RVC 코드의 설치가 필요합니다. 실행하지 않았거나 변환에 실패한 경우 성공이라고 기록하지 않습니다.</Status>
 </Panel>;
}