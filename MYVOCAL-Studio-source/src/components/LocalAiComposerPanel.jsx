import React,{useState} from 'react';
import {Button,Notice} from './UI';
import {getInstalledLocalModels,composeWithLocalAI} from '../lib/localAiComposer.js';

// Optional, fully local inference. This component never changes the project:
// a separate Apply button in Songwriter commits the inspected result.
export default function LocalAiComposerPanel({options,onDraft,notify}){
 const [models,setModels]=useState([]);
 const [model,setModel]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
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
 return <div className="mv7-item" style={{marginTop:16}}>
  <strong>실제 로컬 AI 작사·코드 제안 (선택)</strong>
  <p className="mv7-hint">사용자가 직접 설치·실행한 Ollama의 언어모델로 한국어 가사와 코드·조성·BPM을 생성합니다. 인터넷 유료 API를 호출하지 않습니다. MIDI는 기존 로컬 편곡 엔진으로 생성하며 AI 가창·MV·모델 학습은 아닙니다.</p>
  <div className="mv7-actions"><Button disabled={busy} onClick={load}>{busy?'처리 중':'설치된 로컬 모델 조회'}</Button>
   <select aria-label="로컬 AI 모델 선택" disabled={busy||!models.length} value={model} onChange={e=>setModel(e.target.value)}><option value="">모델 선택</option>{models.map(name=><option key={name} value={name}>{name}</option>)}</select>
   <Button variant="primary" disabled={busy||!model||!loaded} onClick={create}>{busy?'생성 중':'로컬 AI로 가사·코드 만들기'}</Button></div>
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  <Notice>모델이 없다면 이 버튼은 비활성화됩니다. 기존 규칙 기반 작곡과 프로젝트 편집 기능은 그대로 작동합니다. AI 결과는 원본을 자동 덮어쓰지 않습니다.</Notice>
 </div>;
}