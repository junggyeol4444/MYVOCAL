import React,{useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {generateOfflineDraft,normalizeRemoteProposal,applyComposition,songMoods,songLengths} from '../lib/composer';
import {genreList} from '../lib/schema';

export default function Songwriter({project:p,onChange,notify}){
 const [prompt,setPrompt]=useState(p.prompt||'오래 헤어져 있던 친구를 다시 만나는 이야기. 마지막 후렴은 웅장하게.');
 const [genre,setGenre]=useState(p.genreMix?.[0]?.name||'Rock');
 const [mood,setMood]=useState('희망적');
 const [key,setKey]=useState(p.key||'C Major');
 const [bpm,setBpm]=useState(Number(p.bpm)||120);
 const [bars,setBars]=useState(24);
 const [variation,setVariation]=useState(0);
 const [draft,setDraft]=useState(null);
 const [busy,setBusy]=useState(false);
 const [apiKey,setApiKey]=useState('');
 const [model,setModel]=useState('gpt-4o-mini');
 const [error,setError]=useState('');
 const [tab,setTab]=useState('offline');
 const [parts,setParts]=useState({lyrics:true,chords:true,midi:true,settings:true,replace:true});
 const opts=()=>({prompt,title:p.title,genre,mood,key,bpm:Number(bpm),bars:Number(bars),variation});
 const draftOffline=()=>{try{setError('');const d=generateOfflineDraft(opts());setDraft(d);setVariation(n=>n+1);notify('로컬 작곡 초안을 만들었습니다. 적용하기 전에는 프로젝트가 변경되지 않습니다.');}catch(e){setError(e.message);}};
 const draftRemote=async()=>{
  if(!apiKey.trim()){setError('API 키를 입력해 주세요. API 키는 프로젝트에 저장되지 않습니다.');return;}
  setError('');setBusy(true);
  try{
   const res=await fetch('/api/lyrics',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':window.__MYVOCAL_SESSION_KEY||''},body:JSON.stringify({apiKey,model,prompt,title:p.title,genre,mood,key,bpm:Number(bpm),bars:Number(bars)})});
   const body=await res.json().catch(()=>({error:'서버 응답을 읽을 수 없습니다.'}));
   if(!res.ok)throw Error(body.error||`AI 요청 실패 (HTTP ${res.status})`);
   const d=normalizeRemoteProposal(body,opts());setDraft(d);notify('AI 가사/코드 제안이 도착했습니다. MIDI는 로컬 작곡 규칙으로 생성됩니다.');
  }catch(e){setError(`AI 호출 실패: ${e.message}. Windows EXE에서만 API 호출이 지원됩니다.`);}finally{setBusy(false);}
 };
 const apply=()=>{
  if(!draft)return;
  const existing=(p.tracks||[]).filter(t=>t.generatedBy==='composer-v04');
  if(parts.midi&&!parts.replace&&existing.length&&existing.reduce((s,t)=>s+(t.midiNotes||[]).length,0)>0){if(!confirm('이전에 생성한 MIDI 트랙을 그대로 두고 새 트랙을 추가할까요?'))return;}
  const updated=applyComposition(p,draft,parts);onChange(updated);
  notify(`${draft.source==='openai-lyrics'?'AI 가사 제안':'로컬 작곡 초안'}을 프로젝트에 적용했습니다. MIDI/가사 탭에서 직접 수정할 수 있습니다.`);
 };
 const notes=draft?.midiTracks?.reduce((s,t)=>s+t.midiNotes.length,0)||0;
 return <div className="mv4-composer">
  <div className="mv4-switch" role="tablist"><button role="tab" aria-selected={tab==='offline'} className={tab==='offline'?'active':''} onClick={()=>setTab('offline')}>로컬 자동 작곡 · 인터넷 불필요</button><button role="tab" aria-selected={tab==='ai'} className={tab==='ai'?'active':''} onClick={()=>setTab('ai')}>실제 AI 작사 · API 연결</button></div>
  <div className="mv4-grid">
   <div className="panel mv4-compose-form">
    <div className="panel-top"><div><h3>{tab==='offline'?'로컬 작곡 도우미':'OpenAI 작사/코드 제안'}</h3><p>{tab==='offline'?'규칙 기반 초안 · MIDI 4개 트랙 · 원본 작품 복제 없음':'외부 AI가 가사와 코드를 제안하고 MIDI는 로컬 엔진이 생성'}</p></div><span className="hint-pill">v0.9</span></div>
    <label className="mv4-label">곡 설명 / 가사 주제<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={800} rows={4} placeholder="노래의 분위기, 이야기, 후렴 연출을 설명해 주세요"/></label>
    <div className="mv4-form-row"><label className="mv4-label">장르<select value={genre} onChange={e=>setGenre(e.target.value)}>{genreList.map(v=><option key={v}>{v}</option>)}</select></label><label className="mv4-label">감정<select value={mood} onChange={e=>setMood(e.target.value)}>{songMoods.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="mv4-form-row"><label className="mv4-label">조성<select value={key} onChange={e=>setKey(e.target.value)}>{['C Major','G Major','D Major','A Major','E Major','F Major','Bb Major','A Minor','E Minor','B Minor','D Minor','G Minor','F# Minor'].map(k=><option key={k}>{k}</option>)}</select></label><label className="mv4-label">BPM<input value={bpm} type="number" min="40" max="240" onChange={e=>setBpm(e.target.value)}/></label><label className="mv4-label">마디<select value={bars} onChange={e=>setBars(+e.target.value)}>{songLengths.map(n=><option value={n} key={n}>{n} 마디</option>)}</select></label></div>
    {tab==='offline'?<><Notice>로컬 방식은 AI 모델이 아닙니다. 입력한 설정을 바탕으로 가사 템플릿, 화성, 멜로디, 리듬을 규칙으로 만들며 실제 WAV로 재생·내보낼 수 있습니다.</Notice><Button variant="primary" className="full-width" icon="spark" onClick={draftOffline}>작곡 초안 생성 · 다른 변형 만들기</Button></>
     :<><div className="mv4-secret-box"><label className="mv4-label">OpenAI API 키 (프로젝트에 저장하지 않음)<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off" placeholder="sk-..."/></label><label className="mv4-label">모델 ID<input value={model} onChange={e=>setModel(e.target.value)} maxLength={80} placeholder="gpt-4o-mini"/></label></div><Notice>실제 OpenAI API 호출에는 인터넷과 본인 API 키 및 별도 API 이용 요금이 필요합니다. 입력한 키는 외부 OpenAI 서버로 요청할 때만 사용하며 저장하지 않습니다. AI가 만든 것은 가사/코드 제안이며, MIDI는 로컬 규칙 기반입니다.</Notice><Button variant="primary" className="full-width" icon="spark" disabled={busy||!prompt.trim()} onClick={draftRemote}>{busy?'AI 응답을 기다리는 중…':'AI 가사·코드 제안 받기'}</Button></>}
    {error&&<div className="mv4-error" role="alert">{error}</div>}
   </div>
   <div className="panel mv4-preview">
    <div className="panel-top"><div><h3>생성 결과 미리보기</h3><p>프로젝트 변경 전 가사와 코드, 트랙 구성을 확인하세요.</p></div></div>
    {draft?<><div className="mv4-meta"><span>{draft.source==='openai-lyrics'?'OpenAI 가사':'로컬 규칙 작곡'}</span><span>{draft.bpm} BPM · {draft.key}</span><span>{draft.bars}마디 / MIDI {notes}개</span></div>
      <div className="mv4-preview-parts"><h4>코드 진행</h4><div className="mv4-chordchips">{draft.chords.slice(0,12).map((ch,i)=><span key={i}>{ch.symbol} <small>{ch.bar}마디</small></span>)}</div></div>
      <div className="mv4-preview-parts"><h4>트랙 미리보기</h4><div className="mv4-tracklist">{draft.midiTracks.map(t=><div key={t.role}><span>{t.name}</span><strong>{t.midiNotes.length} Notes</strong></div>)}</div></div>
      <div className="mv4-preview-parts"><h4>가사 초안</h4><pre className="mv4-lyrics-preview">{draft.lyrics}</pre></div>
      <div className="mv4-apply"><h4>프로젝트에 적용할 항목</h4><div className="mv4-checks">{[['lyrics','가사'],['chords','코드·곡 구조'],['midi','MIDI 트랙'],['settings','BPM·조성·장르'],['replace','이전에 자동 생성한 트랙 교체']].map(([k,label])=><label key={k}><input type="checkbox" checked={parts[k]} onChange={e=>setParts(a=>({...a,[k]:e.target.checked}))}/>{label}</label>)}</div><Button variant="primary" className="full-width" icon="check" onClick={apply}>선택 항목 프로젝트에 적용</Button><p className="mv4-disclaimer">기존 수동 MIDI·오디오 트랙은 지우지 않습니다. 적용 후 다른 편집 탭에서 추가로 수정할 수 있습니다.</p></div>
    </>:<div className="mv4-placeholder"><strong>아직 초안이 없습니다.</strong><p>왼쪽에서 로컬 또는 API 방식을 선택해 생성하세요.</p></div>}
   </div>
  </div>
  {p.compositionHistory?.length>0&&<div className="panel mv4-history"><h3>작곡 적용 기록</h3>{[...p.compositionHistory].reverse().map((x,i)=><div key={i}><span>{x.source==='openai-lyrics'?'AI 제안 + MIDI':'로컬 작곡'}</span><strong>{x.title}</strong><small>{x.notes} 음표 · {new Date(x.time).toLocaleString('ko-KR')}</small></div>)}</div>}
 </div>;
}
