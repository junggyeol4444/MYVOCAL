import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {startDiffSingerTraining,readDiffSingerTrainingStatus,stopDiffSingerTraining,downloadDiffSingerWeights} from '../lib/diffSingerTrainingClient.js';

// #06·#08·#33: 권리 있는 실제 노래 WAV·한국어 가사/MIDI 데이터→로컬 신경망 학습.
// 모델 설치/호환 스크립트가 없으면 학습했다고 표시하지 않는다.
const KEY='MYVOCAL_DIFFSINGER_TRAINING_PATHS';
const defaults={mode:'official',root:'',python:'',config:'',script:'',args:'["--dataset","{dataset}","--output","{output}"]'};
function restore(){try{const v=JSON.parse(window.localStorage.getItem(KEY)||'{}');return {
 mode:v.mode==='custom'?'custom':'official',root:String(v.root||''),python:String(v.python||''),config:String(v.config||''),script:String(v.script||''),args:String(v.args||defaults.args)};
 }catch{return defaults;}}
const session=()=>window.__MYVOCAL_SESSION_KEY;
const dl=file=>{const url=URL.createObjectURL(file),anchor=document.createElement('a');
 anchor.href=url;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
export default function DiffSingerTrainingPanel({voice,notify,suggestedBundle}){
 const [config,setConfig]=useState(restore),[bundle,setBundle]=useState(null),[rights,setRights]=useState(false);
 const [busy,setBusy]=useState(false),[state,setState]=useState(null),[error,setError]=useState('');
 const previousVoice=useRef(voice?.id),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{previousVoice.current=voice?.id;setRights(false);setBundle(null);setError('');},[voice?.id]);
 useEffect(()=>{if(suggestedBundle&&!busy)setBundle(suggestedBundle);},[suggestedBundle]);
 useEffect(()=>{let cancelled=false;
  const poll=async()=>{try{const v=await readDiffSingerTrainingStatus({session:session()});
   if(!cancelled&&alive.current)setState(v);}catch(e){if(!cancelled&&alive.current)setError(e.message);}};
  poll();const timer=setInterval(poll,3500);
  return()=>{cancelled=true;clearInterval(timer)};
 },[]);
 const change=(key,value)=>setConfig(s=>({...s,[key]:value}));
 async function begin(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   if(!voice||!['self','owned','licensed'].includes(voice.rights))
    throw Error('본인 또는 사용 허가가 있는 가창 Voice가 필요합니다.');
   if(!bundle)throw Error('Singing Workbench의 학습 자료에서 내보낸 실제 WAV ZIP을 선택하세요.');
   const original=voice.id;
   const v=await startDiffSingerTraining(bundle,{...config,voiceId:original,rightsConfirmed:rights},{session:session()});
   if(previousVoice.current!==original)throw Error('학습 시작 후 Voice가 변경됐습니다. 다른 목소리로 저장하지 않습니다.');
   setState({...v,voiceId:original});setRights(false);
   notify('설치된 로컬 DiffSinger 학습 스크립트를 실제 실행했습니다. 학습 완료와 가중치 사용 가능 여부는 별개입니다.');
  }catch(e){setError(e.message||String(e));}finally{if(alive.current)setBusy(false);}
 }
 async function cancel(){try{await stopDiffSingerTraining({session:session()});setState(await readDiffSingerTrainingStatus({session:session()}));}
  catch(e){setError(e.message||String(e));}}
 async function saveWeights(){if(busy)return;setBusy(true);setError('');
  try{
   if(state?.state!=='completed'||state.voiceId!==voice?.id)throw Error('현재 Voice의 학습 완료 가중치가 없습니다.');
   const file=await downloadDiffSingerWeights(state.id,{session:session()});
   if(previousVoice.current!==voice.id)throw Error('Voice가 변경되어 다른 목소리의 가중치를 저장하지 않습니다.');
   dl(file);notify('실제로 생성된 가중치 파일을 다운로드했습니다. DiffSinger 추론 모델 호환·품질은 별도 확인이 필요합니다.');
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 const working=state?.state==='running'||state?.state==='preparing';
 return <Panel title="본인 한국어 Singing · 실제 로컬 DiffSinger 학습" description="기존 EXE 안에서 내 노래 녹음·가사·MIDI의 학습 ZIP을 설치된 DiffSinger 신경망 학습 스크립트에 전달합니다. 실제 GPU 학습은 로컬 환경과 설치 모델에 달려 있습니다.">
  {suggestedBundle&&<Notice>이 프로젝트의 실제 녹음에서 추출한 한국어 가사·MIDI 학습 데이터가 자동으로 전달됐습니다. 새 학습을 시작할 때 권한 확인은 별도로 필요합니다.</Notice>}
  <Field label="Singing Workbench에서 내보낸 실제 가창 학습 데이터 ZIP">
   <input type="file" accept=".zip,application/zip" disabled={busy||working}
    onChange={e=>setBundle(e.target.files?.[0]||null)}/>
  </Field>
  <Field label="학습 방식"><select disabled={busy||working} value={config.mode} onChange={e=>change('mode',e.target.value)}>
  <option value="official">공식 DiffSinger: 실제 가창 데이터 이진화 + Acoustic 신경망 학습</option>
  <option value="custom">별도로 설치한 호환 학습 스크립트</option>
 </select></Field>
 <Field label="설치된 DiffSinger 원본 폴더">
   <input disabled={busy||working} value={config.root} onChange={e=>change('root',e.target.value)} placeholder="D:\\DiffSinger"/>
  </Field>
  <Field label="설치된 Python.exe">
   <input disabled={busy||working} value={config.python} onChange={e=>change('python',e.target.value)} placeholder="D:\\DiffSinger\\venv\\Scripts\\python.exe"/>
  </Field>
  {config.mode==='official'?<>
   <Field label="사용자가 준비한 Acoustic 학습 설정 YAML (DiffSinger 폴더 내부)">
    <input disabled={busy||working} value={config.config} onChange={e=>change('config',e.target.value)} placeholder="D:\\DiffSinger\\configs\\my_acoustic.yaml"/>
   </Field>
   <Notice>공식 DiffSinger의 scripts/binarize.py → scripts/train.py 를 설치된 Python에서 실제 실행합니다. 원본 WAV는 작업별 데이터 폴더에 격리하며 매 작업마다 새 myvocal-* 실험 폴더를 만듭니다. 기존 가중치/실험에는 --reset을 사용하지 않습니다. 사용자의 YAML과 기반 발음 사전, 설치된 CUDA/보코더는 실제로 호환되어야 합니다. Acoustic 체크포인트는 원본 프로젝트와 분리된 새 이름으로 생성합니다.</Notice>
  </>:<>
   <Field label="설치한 별도 호환 신경망 학습 스크립트 (.py)">
    <input disabled={busy||working} value={config.script} onChange={e=>change('script',e.target.value)} placeholder="D:\\DiffSinger\\custom_train.py"/>
   </Field>
   <Field label="호환 학습 스크립트 CLI 인수(JSON 배열)">
    <textarea rows={3} disabled={busy||working} value={config.args} onChange={e=>change('args',e.target.value)}/>
   </Field>
   <Notice><code>{'{dataset}'}</code>는 실제 녹음 사본, <code>{'{output}'}</code>은 새 체크포인트 출력 폴더입니다. 이 방식은 해당 인수를 직접 지원하는 사용자 설치 스크립트가 필요합니다.</Notice>
  </>}
  <label className="check-item"><input type="checkbox" disabled={busy||working} checked={rights} onChange={e=>setRights(e.target.checked)}/> 실제 녹음, 가사, 음소 사전과 모델 학습 권한을 확인했습니다.</label>
  <div className="mv7-actions">
   <Button variant="primary" disabled={busy||working||!voice||!bundle||!rights} onClick={begin}>{config.mode==='official'?'공식 DiffSinger 전처리·신경망 학습 시작':'사용자 설치 신경망 학습 시작'}</Button>
   <Button disabled={!working} onClick={cancel}>학습 중지</Button>
   <Button disabled={busy} onClick={async()=>{try{setState(await readDiffSingerTrainingStatus({session:session()}));}catch(e){setError(e.message);}}}>학습 상태 새로고침</Button>
   <Button disabled={busy||state?.state!=='completed'||state.voiceId!==voice?.id} onClick={saveWeights}>생성된 실제 신경망 가중치 저장</Button>
   <Button disabled={busy||working} onClick={()=>{try{window.localStorage.setItem(KEY,JSON.stringify(config));notify('설치 경로와 CLI 설정만 이 PC에 저장했습니다. 개인 녹음은 저장하지 않았습니다.');}catch(e){setError(e.message);}}}>현재 PC의 학습 경로 기억</Button>
  </div>
  <Status>{state?.state||'실행 전'} · {state?.message||'실제 학습은 실행하지 않았습니다.'}</Status>
  {state?.log&&<pre style={{whiteSpace:'pre-wrap',maxHeight:170,overflow:'auto'}}>{state.log}</pre>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Notice>원본 녹음·기존 모델·프로젝트·IndexedDB를 덮어쓰지 않습니다. 로컬 학습이 새로운 .ckpt/.pth를 생성해도 한국어 발음, RVC 음색 유지, 가창 품질 및 Windows GPU 동작을 자동 증명하지 않습니다.</Notice>
 </Panel>;
}
