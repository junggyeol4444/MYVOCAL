import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {packageTrainingPlan,validateCheckpoint,buildCheckpointRecord,sha256File} from '../lib/voiceTraining';
import {putFileNew,removeFile} from '../lib/assetDb';
import {genId} from '../lib/schema';
import {startLocalRVCTraining,getLocalRVCTrainingStatus,cancelLocalRVCTraining,getLocalRVCTrainedModel} from '../lib/rvcTrainingClient';

const session=()=>window.__MYVOCAL_SESSION_KEY;
export default function RvcTrainingPanel({voice,plans,add,notify}){
 const [planId,setPlanId]=useState(''),[root,setRoot]=useState(''),[python,setPython]=useState(''),[script,setScript]=useState('');
 const [args,setArgs]=useState('["--dataset","{dataset}","--output","{output}"]');
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(null),[error,setError]=useState('');
 const selected=(plans||[]).find(x=>x.id===planId&&x.engineId==='rvc')||(plans||[]).find(x=>x.engineId==='rvc');
 const ref=useRef(voice?.id);ref.current=voice?.id;
 useEffect(()=>{setConfirmed(false);setError('');},[voice?.id]);
 const poll=async()=>{try{setStatus(await getLocalRVCTrainingStatus({session:session()}));}catch(e){setError(e.message)}};
 useEffect(()=>{let cancelled=false;const p=async()=>{try{const result=await getLocalRVCTrainingStatus({session:session()});if(!cancelled)setStatus(result);}catch{}};p();const handle=setInterval(p,2500);return()=>{cancelled=true;clearInterval(handle)}},[]);
 const begin=async()=>{if(busy||!selected||!voice)return;setBusy(true);setError('');const originalVoice=voice.id;
  try{
   if(!['self','owned','licensed'].includes(voice.rights))throw Error('이 목소리로 학습할 권한이 없습니다.');
   const data=await packageTrainingPlan(selected,voice);
   if(ref.current!==originalVoice)throw Error('작업 중 목소리 선택이 변경됐습니다.');
   const job=await startLocalRVCTraining(new Blob([data.bytes],{type:'application/zip'}),{root,python,script,args,voiceId:originalVoice,rightsConfirmed:confirmed},{session:session()});
   setStatus({...job,voiceId:originalVoice});notify('설치된 로컬 학습 프로그램을 시작했습니다. 학습 성공과 모델 호환성은 결과 확인 후 판단합니다.');
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const save=async()=>{if(busy||!status||status.state!=='completed'||status.voiceId!==voice?.id)return;
  setBusy(true);setError('');let assetId='';
  try{
   const id=voice.id;const model=await getLocalRVCTrainedModel(status.id,{session:session()});
   if(ref.current!==id)throw Error('모델 다운로드 중 목소리 선택이 변경됐습니다.');
   validateCheckpoint(model,voice);const digest=await sha256File(model);
   assetId=genId('checkpoint');await putFileNew(assetId,model);
   if(ref.current!==id)throw Error('저장 중 목소리 선택이 변경됐습니다.');
   const rec=buildCheckpointRecord(voice,model,digest,'rvc',assetId);
   add('voiceModels',{...rec,notice:'외부 RVC 학습 명령으로 생성된 모델을 보관했습니다. 실제 추론·가창 품질은 검증되지 않았습니다.'});
   assetId='';notify('학습 명령의 결과 체크포인트를 새 모델로 등록했습니다. 기존 모델은 유지됩니다.');
  }catch(e){if(assetId)await removeFile(assetId).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
 return <Panel title="5. 설치된 RVC 엔진으로 실제 학습 실행" description="등록된 내 목소리 학습 데이터셋을 사용자가 설치한 로컬 신경망 학습 스크립트에 전달합니다.">
  <Notice>사용자 PC에 Python·RVC 학습 환경을 설치해야 합니다. 이 버튼은 {dataset} 입력 폴더와 {output} 모델 파일 인수를 지원하는 **별도 호환 학습 스크립트**를 실행합니다. RVC 공식 WebUI의 train/train.py는 전처리·F0·HuBERT·config/filelist 생성 없이 이 두 인수만으로 학습되지 않습니다. 사용하는 RVC 버전에 맞춘 단계별 실행 스크립트를 지정해야 합니다. GPU 모델 설치·학습 성공을 자동 보증하지 않습니다.</Notice>
  <Field label="RVC 학습 준비 작업"><select aria-label="학습할 작업" value={selected?.id||''} onChange={e=>setPlanId(e.target.value)}>{(plans||[]).filter(p=>p.engineId==='rvc').map(p=><option key={p.id} value={p.id}>{p.id} · 원본 {p.sampleIds?.length||0}개</option>)}</select></Field>
  <Field label="학습 코드 설치 폴더"><input value={root} disabled={busy} onChange={e=>setRoot(e.target.value)} placeholder="D:\\RVC"/></Field>
  <Field label="Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\\RVC\\runtime\\python.exe"/></Field>
  <Field label="설치된 학습 스크립트 (.py)"><input value={script} disabled={busy} onChange={e=>setScript(e.target.value)} placeholder="D:\\RVC\\train.py"/></Field>
  <Field label="학습 실행 인수 (JSON 배열)"><textarea value={args} disabled={busy} rows={3} onChange={e=>setArgs(e.target.value)}/></Field>
  <Notice><code>{'{dataset}'}</code>는 원본 복사본이 담긴 격리 작업 폴더이고, <code>{'{output}'}</code>은 새로 생성할 모델의 절대 경로입니다. 외부 스크립트가 실제로 두 인수를 지원해야 학습할 수 있습니다.</Notice>
  <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> 사용 권한이 있는 음성으로 직접 로컬 학습을 실행합니다.</label>
  <div className="mv7-actions"><Button variant="primary" disabled={busy||!selected||!confirmed||!voice||status?.state==='running'} onClick={begin}>실제 로컬 모델 학습 시작</Button>
  <Button disabled={status?.state!=='running'} onClick={async()=>{try{await cancelLocalRVCTraining({session:session()});await poll()}catch(e){setError(e.message)}}}>학습 중지</Button>
  <Button onClick={poll} disabled={busy}>학습 상태 새로고침</Button>
  <Button disabled={busy||status?.state!=='completed'||status?.voiceId!==voice?.id} onClick={save}>생성된 RVC 모델을 새 체크포인트로 등록</Button></div>
  <Status>{status?.state||'실행 전'} · {status?.message||'실제 학습은 사용자가 시작해야 합니다.'}</Status>
  {status?.log&&<pre style={{whiteSpace:'pre-wrap',maxHeight:180,overflow:'auto'}}>{status.log}</pre>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Notice>학습 데이터 원본과 기존 체크포인트를 교체·삭제하지 않습니다. 프로그램 종료 시 진행 중인 외부 학습 프로세스는 중단됩니다. 학습 후에도 RVC 추론 엔진에서 직접 결과를 검증해야 합니다.</Notice>
 </Panel>;
}