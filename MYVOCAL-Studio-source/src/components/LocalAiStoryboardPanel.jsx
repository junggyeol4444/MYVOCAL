import React,{useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {getInstalledLocalModels} from '../lib/localAiComposer.js';
import {planLocalAiStoryboard,applyLocalAiStoryboard} from '../lib/localAiStoryboard.js';
import {canReplaceDefaultStoryboard} from '../lib/songStoryboard.js';
export default function LocalAiStoryboardPanel({project,onChange,notify}){
 const [models,setModels]=useState([]),[model,setModel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[plan,setPlan]=useState(null);
 const allowed=canReplaceDefaultStoryboard(project);
 const load=async()=>{if(busy)return;setBusy(true);setError('');try{const found=await getInstalledLocalModels();setModels(found);setModel(m=>found.includes(m)?m:found[0]||'');if(!found.length)setError('설치된 로컬 AI 모델이 없습니다. Ollama를 실행하고 모델을 추가하세요.')}catch(e){setError(e.message)}finally{setBusy(false)}};
 const generate=async()=>{if(busy)return;setBusy(true);setError('');setPlan(null);try{const result=await planLocalAiStoryboard(project,model);setPlan(result);notify('실제 로컬 AI에서 장면 설명을 받았습니다. 적용 전 확인하세요.')}catch(e){setError(e.message)}finally{setBusy(false)}};
 const apply=()=>{try{const next=applyLocalAiStoryboard(project,plan);onChange(next);setPlan(null);setError('');notify('AI 콘티 텍스트를 기존 프로젝트 시간축에 적용했습니다. 실제 영상 프레임 생성은 별도로 진행하세요.')}catch(e){setError(e.message)}};
 return <Panel title="로컬 AI 자동 스토리보드 (설치 모델)" description="실제 로컬 Ollama가 곡 구간과 가사를 분석해 새로운 영상 콘티 텍스트를 제안합니다. 영상 프레임이나 립싱크를 생성하는 기능은 아닙니다.">
  <div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button disabled={busy} onClick={load}>설치 모델 조회</Button><select aria-label="콘티 로컬 모델" value={model} onChange={e=>setModel(e.target.value)} disabled={busy||!models.length}><option value="">모델 선택</option>{models.map(n=><option key={n}>{n}</option>)}</select><Button disabled={!allowed||!model||busy} variant="primary" onClick={generate}>{busy?'생성 중':'AI 스토리보드 만들기'}</Button></div>
  {!allowed&&<Notice>이미 사용자 편집이나 이미지·클립이 포함된 장면이 있어 덮어쓰지 않습니다. 빈 기본 장면에서만 생성할 수 있습니다.</Notice>}
  {error&&<p className="mv4-error" role="alert">{error}</p>}
  {plan&&<><div className="mv7-list">{plan.scenes.map(s=><div className="mv7-item" key={s.id}><strong>{s.title}</strong><p>{s.start}~{s.end}초 · {s.description}</p><small>{s.location} · {s.action} · {s.camera}</small></div>)}</div><Button variant="primary" onClick={apply}>검토한 AI 콘티 적용</Button></>}
  <Notice>기존 캐릭터·미디어 원본은 삭제·교체하지 않습니다. 모델은 사용자 PC에서 별도로 실행해야 하며, 미설치 상태에서는 실행되지 않습니다.</Notice>
 </Panel>;
}