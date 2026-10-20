import React,{useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {generateOfflineDraft,applyComposition,songMoods,songLengths,COMPOSER_PARTS} from '../lib/composer';
import GenreMixEditor from './GenreMixEditor';
import LocalAiComposerPanel from './LocalAiComposerPanel.jsx';
import {alignLyricNotes} from '../lib/lyricAlignment';
import {resolveGenreMix,validateGenreMix,genreMixText} from '../lib/genreMix';

export default function Songwriter({project:p,onChange,notify}){
 const [prompt,setPrompt]=useState(p.prompt||'오래 헤어져 있던 친구를 다시 만나는 이야기. 마지막 후렴은 웅장하게.');
 const [genreMix,setGenreMix]=useState(()=>{try{return resolveGenreMix(p.genreMix,p.genreMix?.[0]?.name||'Rock')}catch{return [{name:'Rock',weight:100}]}});
 const [mood,setMood]=useState('희망적');
 const [key,setKey]=useState(p.key||'C Major');
 const [bpm,setBpm]=useState(Number(p.bpm)||120);
 const [bars,setBars]=useState(24);
 const [variation,setVariation]=useState(0);
 const [draft,setDraft]=useState(null);
 const [error,setError]=useState('');
 const [parts,setParts]=useState({lyrics:true,chords:true,midi:true,settings:true,replace:true});
 const opts=()=>{const mix=validateGenreMix(genreMix);return {prompt,title:p.title,genre:mix[0].name,genreMix:mix,mood,key,bpm:Number(bpm),bars:Number(bars),variation};};
 const draftOffline=()=>{try{setError('');const d=generateOfflineDraft(opts());setDraft(d);setVariation(n=>n+1);notify('로컬 작곡 초안을 만들었습니다. 적용하기 전에는 프로젝트가 변경되지 않습니다.');}catch(e){setError(e.message);}};
 const apply=()=>{
  if(!draft)return;
  const existing=(p.tracks||[]).filter(t=>t.generatedBy==='composer-v04');
  if(parts.midi&&!parts.replace&&existing.length&&existing.reduce((s,t)=>s+(t.midiNotes||[]).length,0)>0){if(!confirm('이전에 생성한 MIDI 트랙을 그대로 두고 새 트랙을 추가할까요?'))return;}
  let updated;try{
   updated=applyComposition(p,draft,parts);
   if(parts.lyrics&&parts.midi&&!p.vocalAlignment)
    updated={...updated,vocalAlignment:alignLyricNotes(updated)};
  }catch(e){setError(e.message);return;}onChange(updated);
  notify(`${draft.source==='ollama-local'?'로컬 AI 가사·코드 제안':draft.source==='openai-lyrics'?'AI 가사 제안':'로컬 작곡 초안'}을 적용했습니다. 보컬 가사 싱크를 확인하고 가창 작업실에서 WAV를 만들 수 있습니다.`);
 };
 const notes=draft?.midiTracks?.reduce((s,t)=>s+t.midiNotes.length,0)||0;
 return <div className="mv4-composer">
  <Notice>로컬 전용 작곡 모드 · 인터넷이나 외부 AI API가 필요하지 않습니다. AI 신경망 음악 생성이 아니라 규칙 기반 작곡입니다.</Notice>
  <div className="mv4-grid">
   <div className="panel mv4-compose-form">
    <div className="panel-top"><div><h3>로컬 작곡 도우미</h3><p>규칙 기반 초안 · MIDI {COMPOSER_PARTS.length}개 트랙 · 원본 작품 복제 없음</p></div><span className="hint-pill">v0.9</span></div>
    <label className="mv4-label">곡 설명 / 가사 주제<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={800} rows={4} placeholder="노래의 분위기, 이야기, 후렴 연출을 설명해 주세요"/></label>
    <GenreMixEditor mix={genreMix} onChange={setGenreMix}/><div className="mv4-form-row"><label className="mv4-label">감정<select value={mood} onChange={e=>setMood(e.target.value)}>{songMoods.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="mv4-form-row"><label className="mv4-label">조성<select value={key} onChange={e=>setKey(e.target.value)}>{['C Major','G Major','D Major','A Major','E Major','F Major','Bb Major','A Minor','E Minor','B Minor','D Minor','G Minor','F# Minor'].map(k=><option key={k}>{k}</option>)}</select></label><label className="mv4-label">BPM<input value={bpm} type="number" min="40" max="240" onChange={e=>setBpm(e.target.value)}/></label><label className="mv4-label">마디<select value={bars} onChange={e=>setBars(+e.target.value)}>{songLengths.map(n=><option value={n} key={n}>{n} 마디</option>)}</select></label></div>
    <Notice>곡 설정과 장르 혼합·구간별 장르를 기반으로 가사 템플릿, 화성, 멜로디, 리듬을 PC에서 생성합니다. 외부 API 호출은 없습니다.</Notice>
    <Button variant="primary" className="full-width" icon="spark" onClick={draftOffline}>로컬 작곡 초안 생성 · 다른 변형 만들기</Button>
    <LocalAiComposerPanel options={opts} onDraft={d=>{setDraft(d);setError('')}} notify={notify}/>
    {error&&<div className="mv4-error" role="alert">{error}</div>}
   </div>
   <div className="panel mv4-preview">
    <div className="panel-top"><div><h3>생성 결과 미리보기</h3><p>프로젝트 변경 전 가사와 코드, 트랙 구성을 확인하세요.</p></div></div>
    {draft?<><div className="mv4-meta"><span>{draft.source==='ollama-local'?'설치된 로컬 AI 모델':draft.source==='openai-lyrics'?'OpenAI 가사':'로컬 규칙 작곡'}</span><span>{draft.bpm} BPM · {draft.key}</span><span>{draft.genreMix?genreMixText(draft.genreMix):draft.genre}</span><span>{draft.bars}마디 / MIDI {notes}개</span></div>
      <div className="mv4-preview-parts"><h4>코드 진행</h4><div className="mv4-chordchips">{draft.chords.slice(0,12).map((ch,i)=><span key={i}>{ch.symbol} <small>{ch.bar}마디</small></span>)}</div></div>
      <div className="mv4-preview-parts"><h4>트랙 미리보기</h4><div className="mv4-tracklist">{draft.midiTracks.map(t=><div key={t.role}><span>{t.name}</span><strong>{t.midiNotes.length} Notes</strong></div>)}</div></div>
      <div className="mv4-preview-parts"><h4>가사 초안</h4><pre className="mv4-lyrics-preview">{draft.lyrics}</pre></div>
      <div className="mv4-apply"><h4>프로젝트에 적용할 항목</h4><div className="mv4-checks">{[['lyrics','가사'],['chords','코드·곡 구조'],['midi','MIDI 트랙'],['settings','BPM·조성·장르'],['replace','이전에 자동 생성한 트랙 교체']].map(([k,label])=><label key={k}><input type="checkbox" checked={parts[k]} onChange={e=>setParts(a=>({...a,[k]:e.target.checked}))}/>{label}</label>)}</div><Button variant="primary" className="full-width" icon="check" onClick={apply}>선택 항목 프로젝트에 적용</Button><p className="mv4-disclaimer">기존 수동 MIDI·오디오 트랙은 지우지 않습니다. 가사와 MIDI를 함께 생성하면 새 곡의 보컬 멜로디에 가사를 자동 연결합니다(기존 수동 싱크가 있으면 유지). 실제 AI 노래 모델은 별도로 필요합니다.</p></div>
    </>:<div className="mv4-placeholder"><strong>아직 초안이 없습니다.</strong><p>왼쪽에서 로컬 작곡 초안을 생성하세요.</p></div>}
   </div>
  </div>
  {p.compositionHistory?.length>0&&<div className="panel mv4-history"><h3>작곡 적용 기록</h3>{[...p.compositionHistory].reverse().map((x,i)=><div key={i}><span>{x.source==='ollama-local'?'로컬 AI 제안 + MIDI':x.source==='openai-lyrics'?'AI 제안 + MIDI':'로컬 작곡'}</span><strong>{x.title}</strong><small>{x.notes} 음표 · {new Date(x.time).toLocaleString('ko-KR')}</small></div>)}</div>}
 </div>;
}
