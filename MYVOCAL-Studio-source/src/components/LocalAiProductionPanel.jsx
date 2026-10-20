import React,{useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {getInstalledLocalModels} from '../lib/localAiComposer.js';
import {planLocalAiMusicVideo,applyLocalAiMusicVideo} from '../lib/localAiProduction.js';
export default function LocalAiProductionPanel({project,options,onChange,notify}){
 const current=useRef(project);current.current=project;
 const [models,setModels]=useState([]),[model,setModel]=useState(''),[busy,setBusy]=useState(false),
 [error,setError]=useState(''),[proposal,setProposal]=useState(null);
 const load=async()=>{setBusy(true);setError('');try{
  const list=await getInstalledLocalModels();setModels(list);setModel(m=>list.includes(m)?m:list[0]||'');
  if(!list.length)setError('Ollama 로컬 모델을 설치·실행한 후 조회하세요.');
 }catch(e){setError(e.message)}finally{setBusy(false)}};
 const prepare=async()=>{const before=current.current;setBusy(true);setError('');setProposal(null);
  try{const p=await planLocalAiMusicVideo(before,options(),model);
   if(current.current!==before)throw Error('생성 중 프로젝트를 전환했습니다.');
   setProposal(p);
  }catch(e){setError(e.message)}finally{setBusy(false)}};
 const apply=()=>{try{const updated=applyLocalAiMusicVideo(current.current,proposal);
  onChange(updated);setProposal(null);setError('');notify('로컬 AI 가사·MIDI·MV 콘티를 통합 적용했습니다.');
 }catch(e){setError(e.message);setProposal(null)}};
 return <Panel title="로컬 AI 노래 + MV 콘티 통합 제작" description="설치된 Ollama 언어모델로 가사·코드와 영상 장면 연출을 함께 생성하고, 기존 MIDI 편곡기와 결합합니다.">
  <div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button disabled={busy} onClick={load}>AI 모델 조회</Button>
  <select aria-label="음악 MV 통합 로컬 AI 모델" disabled={busy||!models.length} value={model} onChange={e=>setModel(e.target.value)}><option value="">모델 선택</option>{models.map(x=><option key={x}>{x}</option>)}</select>
  <Button variant="primary" disabled={busy||!model} onClick={prepare}>{busy?'AI 가사·MIDI·콘티 만드는 중':'가사 + MIDI + MV 콘티 일괄 생성'}</Button></div>
  {error&&<p role="alert" className="mv4-error">{error}</p>}
  {proposal&&<div className="mv7-item"><strong>{proposal.draft.title} · {proposal.draft.bpm} BPM · {proposal.draft.key}</strong>
  <p>MIDI {proposal.draft.midiTracks.reduce((n,t)=>n+t.midiNotes.length,0)}음표 / 콘티 {proposal.scenePlan.scenes.length}장면</p>
  <pre style={{whiteSpace:'pre-wrap',maxHeight:200,overflow:'auto'}}>{proposal.draft.lyrics.slice(0,1000)}</pre>
  {proposal.scenePlan.scenes.map(s=><p key={s.id}>{s.title}: {s.description}</p>)}
  <Button variant="primary" onClick={apply}>전체 생성 결과 검토 후 적용</Button><Button onClick={()=>setProposal(null)}>결과 폐기</Button></div>}
  <Notice>모든 모델 응답이 성공해야 적용 버튼이 나타납니다. 사용자 수동 트랙·미디어는 삭제하지 않습니다. 본인 음색 신경망 학습·실제 가창·영상 프레임 생성은 이 버튼이 수행하지 않습니다.</Notice>
 </Panel>;
}