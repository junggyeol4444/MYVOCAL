import React,{useState} from 'react';
import {Button,Notice} from './UI';
import {getInstalledLocalModels,composeWithLocalAI} from '../lib/localAiComposer.js';
import {composeNeuralMidiArrangement,appendNeuralMidiToProject} from '../lib/neuralMidiComposer.js';
import {genId} from '../lib/schema.js';

// Optional, fully local inference. This component never changes the project:
// a separate Apply button in Songwriter commits the inspected result.
export default function LocalAiComposerPanel({options,onDraft,notify,project,onChange}){
 const [models,setModels]=useState([]);
 const [model,setModel]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [targetSeconds,setTargetSeconds]=useState(180),[neuralProgress,setNeuralProgress]=useState('');
 const load=async()=>{
  if(busy)return;
  setBusy(true);setError('');
  try{
   const next=await getInstalledLocalModels();setModels(next);setModel(m=>next.includes(m)?m:(next[0]||''));setLoaded(true);
   if(!next.length)setError('설치된 로컬 모델이 없습니다. Ollama에 모델을 설치하고 다시 조회하세요.');
  }catch(e){setLoaded(false);setError(e.message)}finally{setBusy(false)}
 };
 const create=async()=>{
  if(busy)return;
  setBusy(true);setError('');
  try{
   const requested=options();
   const draft=await composeWithLocalAI(requested,{model});
   onDraft(draft);
   notify('설치된 로컬 AI 모델에서 가사·코드 제안을 받았습니다. 미리보기 후 직접 적용하세요.');
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const createNeuralMidi=async()=>{
  if(busy||!model)return;
  const original=project;
  const signal=new AbortController();
  setBusy(true);setError('');setNeuralProgress('');
  try{
   const o=options();
   const result=await composeNeuralMidiArrangement({...o,model,targetSeconds,session:window.__MYVOCAL_SESSION_KEY,
    signal:signal.signal,onProgress:(done,total)=>setNeuralProgress('신경망 작곡 '+done+'/'+total+' 구간')});
   const saved=await appendNeuralMidiToProject(original,result,{current:()=>project,onChange,newId:genId});
   notify('실제 설치된 로컬 신경망이 작곡한 '+saved.addedTracks+'개 MIDI 악기 트랙을 추가했습니다. 기존 녹음·악기 트랙은 보존했습니다.');
  }catch(e){setError(e.message)}finally{setBusy(false);setNeuralProgress('')}
 };
 return <div className="mv7-item" style={{marginTop:16}}>
  <strong>실제 로컬 AI 작사·코드 제안 (선택)</strong>
  <p className="mv7-hint">사용자가 직접 설치·실행한 Ollama의 언어모델로 한국어 가사와 코드·조성·BPM을 생성합니다. 인터넷 유료 API를 호출하지 않습니다. MIDI는 기존 로컬 편곡 엔진으로 생성하며 AI 가창·MV·모델 학습은 아닙니다.</p>
  <div className="mv7-actions"><Button disabled={busy} onClick={load}>{busy?'처리 중':'설치된 로컬 모델 조회'}</Button>
   <select aria-label="로컬 AI 모델 선택" disabled={busy||!models.length} value={model} onChange={e=>setModel(e.target.value)}><option value="">모델 선택</option>{models.map(name=><option key={name} value={name}>{name}</option>)}</select>
   <Button variant="primary" disabled={busy||!model||!loaded} onClick={create}>{busy?'생성 중':'로컬 AI로 가사·코드 만들기'}</Button></div>
  <div className="mv7-item">
   <strong>실제 로컬 신경망 악기별 MIDI 작곡</strong>
   <p className="mv7-hint">설치된 Ollama 모델이 각 구간의 음표를 직접 생성합니다. 6개 편집 가능 악기 트랙을 기존 프로젝트에 추가하며, AI 오디오 생성·사람 목소리 합성은 별도입니다.</p>
   <select aria-label="신경망 작곡 길이" value={targetSeconds} disabled={busy} onChange={e=>setTargetSeconds(Number(e.target.value))}><option value={180}>약 3분</option><option value={360}>최대 6분</option></select>
   <Button disabled={busy||!model||!loaded||!project?.id} onClick={createNeuralMidi}>로컬 AI로 멜로디·악기별 MIDI 전체 작곡</Button>
   {neuralProgress&&<p role="status">{neuralProgress}</p>}
  </div>
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Notice>모델이 없다면 이 버튼은 비활성화됩니다. 기존 규칙 기반 작곡과 프로젝트 편집 기능은 그대로 작동합니다. AI 결과는 원본을 자동 덮어쓰지 않습니다.</Notice>
 </div>;
}