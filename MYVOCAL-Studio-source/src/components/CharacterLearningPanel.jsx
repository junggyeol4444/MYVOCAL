import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {
 startCharacterIdentityTraining,getCharacterIdentityTrainingStatus,
 cancelCharacterIdentityTraining,downloadCharacterIdentityLoRA
} from '../lib/characterIdentityTrainingClient.js';

// Original #48/#49: real installed sd-scripts training, not a metadata-only
// identity plan. No original images, profiles or trained models are overwritten.
const activeSession=()=>window.__MYVOCAL_SESSION_KEY;
const permissible=new Set(['self','owned','licensed']);
const restore=()=>{try{
 const x=JSON.parse(window.localStorage.getItem('MYVOCAL_CHARACTER_LORA_PATHS')||'{}');
 return {root:String(x.root||''),python:String(x.python||''),base:String(x.base||''),
  steps:Number(x.steps)||500,rank:Number(x.rank)||16};
}catch{return {root:'',python:'',base:'',steps:500,rank:16}}};
export default function CharacterLearningPanel({profile,onSave,notify}){
 const [config,setConfig]=useState(restore),[selected,setSelected]=useState([]),
  [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),
  [job,setJob]=useState(null),[error,setError]=useState(''),
  [message,setMessage]=useState('');
 const latest=useRef(profile),abort=useRef(null);
 latest.current=profile;
 useEffect(()=>{setSelected([]);setConsent(false);setJob(null);setError('');setMessage('');
  abort.current?.abort();abort.current=null;},[profile?.id]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{
  let live=true;
  const poll=async()=>{
   try{
    const latestJob=await getCharacterIdentityTrainingStatus({session:activeSession()});
    if(live)setJob(latestJob);
   }catch(e){if(live)setError(e.message);}
  };
  if(activeSession()){poll();const timer=setInterval(poll,4000);return()=>{live=false;clearInterval(timer);}}
  return()=>{live=false};
 },[]);
 if(!profile||!['character','person'].includes(profile.kind))return null;
 const originals=(profile.assets||[]).filter(a=>
  ['image/png','image/jpeg'].includes(a.type)&&/\.(png|jpe?g)$/i.test(a.name));
 const valid=permissible.has(profile.rights)&&
  (profile.kind!=='person'||['self','licensed'].includes(profile.rights))&&
  (profile.rights!=='licensed'||String(profile.rightsNote||'').trim());
 const running=job?.state==='running'||job?.state==='preparing';
 const myJob=job?.characterId===profile.id;
 const change=(key,value)=>setConfig(c=>({...c,[key]:value}));
 const toggle=id=>setSelected(current=>current.includes(id)?
  current.filter(v=>v!==id):current.length>=20?current:[...current,id]);
 async function start(){
  if(busy||running)return;
  const originalProfile=latest.current;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);setError('');setMessage('등록 사진·원화의 실제 PCM 아닌 이미지 원본을 읽는 중');
  try{
   const started=await startCharacterIdentityTraining(originalProfile,{
    ...config,assetIds:selected,consent
   },{session:activeSession(),loadAsset:getFile,signal:controller.signal,
    onProgress:(count,total)=>setMessage('기존 원본 이미지 사본 준비 '+count+'/'+total)});
   if(latest.current!==originalProfile||controller.signal.aborted)
    throw Error('캐릭터 선택이 변경됐습니다. 원본 프로젝트는 보존했습니다.');
   setJob({...started,characterId:originalProfile.id,kind:originalProfile.kind});
   setConsent(false);
   setMessage('설치된 sd-scripts LoRA 신경망 학습이 실행 중입니다. CUDA 학습 결과는 상태에서 확인합니다.');
  }catch(e){setError(e.message||String(e));}
  finally{if(abort.current===controller)abort.current=null;setBusy(false);}
 }
 async function stop(){
  try{await cancelCharacterIdentityTraining({session:activeSession()});
   setMessage('LoRA 신경망 학습 취소 요청을 전달했습니다.');
  }catch(e){setError(e.message||String(e));}
 }
 async function download(){
  if(busy||!myJob||job.state!=='completed')return;
  setBusy(true);setError('');
  try{
   const file=await downloadCharacterIdentityLoRA(job.id,{session:activeSession()});
   if(latest.current?.id!==job.characterId)throw Error('대상 캐릭터가 변경됐습니다.');
   const url=URL.createObjectURL(file),anchor=document.createElement('a');
   try{anchor.href=url;anchor.download=file.name;anchor.click();}
   finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
   notify?.('실제 sd-scripts 신규 LoRA .safetensors 가중치를 저장했습니다. 기존 기반 모델·사진은 유지됩니다.');
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 }
 function register(){
  try{
   if(!myJob||job.state!=='completed'||job.modelAvailable!==true||!valid)
    throw Error('실제 학습 완료 및 사용 권한이 확인된 캐릭터만 등록할 수 있습니다.');
   if(profile.identityTraining?.jobId===job.id)
    throw Error('현재 완료한 학습 가중치는 이미 프로필에 연결되어 있습니다.');
   const record={version:1,engine:'sd-scripts-local-lora',
    jobId:job.id,kind:profile.kind,
    trainedImageCount:selected.length||null,steps:config.steps,rank:config.rank,
    modelFileName:'mv'+job.id+'.safetensors',
    status:'trained-checkpoint-produced-in-unverified-environment',
    createdAt:new Date().toISOString(),
    notes:'실제 설치된 sd-scripts가 신규 safetensors 가중치를 생성했다는 로컬 학습 기록. GPU·모델 호환성·정체성 재현 품질은 별도로 확인. 원본 자료 보존.'};
   onSave({...profile,identityTraining:record});
   notify?.('기존 자료를 유지하면서 새로운 실제 학습 LoRA 체크포인트 기록을 캐릭터 프로필에 추가했습니다.');
  }catch(e){setError(e.message||String(e));}
 }
 const stateLabel={idle:'실행 전',preparing:'데이터 준비',running:'학습 실행',
  completed:'체크포인트 생성',cancelled:'중지됨',failed:'학습 실패'};
 return <Panel title={profile.kind==='person'?'원본 49항 · 본인·허가 인물 LoRA 신경망 학습':'원본 48항 · 내 캐릭터 LoRA 신경망 학습'}
  description="등록된 이미지 4~20개로 Windows PC의 실제 SD 1.5 sd-scripts LoRA 학습을 실행합니다. 모델·원본을 수정하거나 다운로드하지 않습니다.">
  <Notice>학습하려면 이미 설치된 sd-scripts, Python.exe, SD 1.5 기반 가중치와 CUDA 환경이 필요합니다. 자동 설치·기존 모델 교체는 하지 않습니다. 기존 캐릭터 기준 이미지들은 읽기만 하며 작업마다 고유 출력 폴더가 생성됩니다.</Notice>
  <Field label={'실제 '+(profile.kind==='person'?'본인/허가 인물 사진':'내 캐릭터 원화')+' 선택 (최소 4장 · 최대 20장)'}>
   <div className="asset-grid">
    {originals.map(asset=><label key={asset.id} className="asset-card">
     <input type="checkbox" disabled={busy||running} checked={selected.includes(asset.id)}
      onChange={()=>toggle(asset.id)}/> {asset.name} · {asset.role||'이미지'}
    </label>)}
   </div>
  </Field>
  {originals.length<4&&<Notice>현재 등록된 PNG/JPEG 원본이 {originals.length}장입니다. 먼저 캐릭터 편집 화면에서 서로 다른 원본을 4장 이상 등록하세요.</Notice>}
  <div className="form-two">
   <Field label="설치된 sd-scripts 폴더"><input disabled={busy||running} value={config.root}
    onChange={e=>change('root',e.target.value)} placeholder="D:\AI\sd-scripts"/></Field>
   <Field label="sd-scripts 가상환경 Python.exe"><input disabled={busy||running} value={config.python}
    onChange={e=>change('python',e.target.value)} placeholder="D:\AI\venv\Scripts\python.exe"/></Field>
   <Field label="권한 있는 SD 1.5 기반 모델 (읽기 전용)"><input disabled={busy||running} value={config.base}
    onChange={e=>change('base',e.target.value)} placeholder="D:\AI\models\my_sd15.safetensors"/></Field>
   <Field label="실제 LoRA 학습 스텝 (100~3000)"><input type="number" min={100} max={3000} step={50} disabled={busy||running}
    value={config.steps} onChange={e=>change('steps',Number(e.target.value))}/></Field>
   <Field label="LoRA 학습 차원"><select disabled={busy||running} value={config.rank}
    onChange={e=>change('rank',Number(e.target.value))}>
    <option value={8}>8</option><option value={16}>16</option><option value={32}>32</option>
   </select></Field>
  </div>
  <label className="check-item"><input type="checkbox" checked={consent} disabled={busy||running}
   onChange={e=>setConsent(e.target.checked)}/>
   본인 또는 명시적으로 허가된 실제 사진·캐릭터 원화이며 신경망 학습·결과 사용 권한이 있습니다.</label>
  <div className="mv7-actions">
   <Button variant="primary" disabled={busy||running||!valid||!consent||selected.length<4||selected.length>20}
    onClick={start}>실제 로컬 LoRA 학습 실행</Button>
   <Button disabled={!running} onClick={stop}>학습 중지</Button>
   <Button disabled={busy} onClick={async()=>{try{setJob(await getCharacterIdentityTrainingStatus({session:activeSession()}))}catch(e){setError(e.message)}}}>학습 진행 상태</Button>
   <Button disabled={busy||!myJob||job.state!=='completed'||!job.modelAvailable} onClick={download}>신규 .safetensors 가중치 저장</Button>
   <Button disabled={busy||!myJob||job.state!=='completed'||!job.modelAvailable||profile.identityTraining?.jobId===job.id}
    onClick={register}>실제 학습 모델을 캐릭터 프로필에 등록</Button>
   <Button disabled={busy||running} onClick={()=>{try{
     window.localStorage.setItem('MYVOCAL_CHARACTER_LORA_PATHS',JSON.stringify(config));
     notify?.('이 Windows 프로필에 설치 경로와 학습 설정만 저장했습니다.');
    }catch(e){setError(e.message)}}}>현재 PC 설치 경로 기억</Button>
  </div>
  {profile.identityTraining?.engine==='sd-scripts-local-lora'&&
   <Notice>이전에 등록한 LoRA: {profile.identityTraining.modelFileName} · 학습 파일 생성 기록. MV에서 재현되는 외형 품질은 미검증입니다.</Notice>}
  <p role="status" className="muted">학습 상태: {myJob?(stateLabel[job.state]||job.state)+' · '+(job.message||''):'현재 인물의 학습 실행 내역 없음'} · {message}</p>
  {myJob&&job.log&&<pre style={{maxHeight:170,overflow:'auto',whiteSpace:'pre-wrap'}}>{job.log}</pre>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Notice>LoRA 학습은 실제 GPU·CUDA 환경에서 실행될 때만 결과가 나옵니다. 완료 후 출력물의 얼굴·의상·체형 동일성은 자동 보장하지 않으며 기존 SD 1.5 기반 모델과 동일한 계열로 추론해야 합니다.</Notice>
 </Panel>;
}
