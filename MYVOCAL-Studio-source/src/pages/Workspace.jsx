import React,{useState} from 'react';
import {Button,Empty,Icon,Notice,Panel,SectionHead} from '../components/UI';
import {genId,genreList,trackPresets} from '../lib/schema';
import {downloadText} from '../lib/store';
import {applyProducerCommand,PRODUCER_COMMAND_EXAMPLES} from '../lib/producerCommands.js';
import Video from './Video';
import CreativeDirector96 from '../components/CreativeDirector96.jsx';
import FinalDelivery98 from '../components/FinalDelivery98.jsx';
import AudioWorkstation from '../components/AudioWorkstation';
import MidiEditor from '../components/MidiEditor';
import Songwriter from '../components/Songwriter';
import SectionGenreEditor from '../components/SectionGenreEditor';
import {setSectionGenreMix} from '../lib/sectionGenre';
import LyricSync from '../components/LyricSync';
import PhonemeEditor from '../components/PhonemeEditor';
import SingingWorkbench from '../components/SingingWorkbench';
import OpenUtauExchange from '../components/OpenUtauExchange';
import {downloadProjectBundle} from '../lib/projectBundle';
const palettes=['#a48dff','#62c5fe','#f58fbb','#7dddb5','#f1b97b','#9d9efb','#8dd6db','#e3aeef'];
export default function Workspace({data,project,onChange,navigate,notify,studio,add,remove}){
 const chosen=project||data.projects[0];
 const [tab,setTab]=useState('arrangement');const [newTrack,setNewTrack]=useState('');const [chat,setChat]=useState('');
 if(!chosen)return <><SectionHead eyebrow="MUSIC STUDIO" title="Music Studio" description="트랙 기반 작곡과 편집을 위한 작업 공간입니다."/><Empty icon="music" title="먼저 프로젝트를 만들어 주세요" description="프로젝트 안에서 가사와 트랙을 편집할 수 있습니다." action={<Button variant="primary" icon="plus" onClick={()=>navigate('create')}>프로젝트 만들기</Button>}/></>;
 const p=chosen;
 const change=(patch)=>onChange({...p,...patch});
 const setTrack=(id,patch)=>change({tracks:p.tracks.map(t=>t.id===id?{...t,...patch}:t)});
 const addTrack=()=>{change({tracks:[...p.tracks,{id:genId('trk'),name:newTrack.trim()||`Track ${p.tracks.length+1}`,type:'instrument',mute:false,solo:false,volume:75,clips:[]}]});setNewTrack('');notify('새 트랙을 추가했습니다.');};
 const addGenre=()=>change({genreMix:[...p.genreMix,{name:genreList.find(g=>!p.genreMix.some(x=>x.name===g))||'Pop',weight:0}]});
 const logCommand=e=>{
  e.preventDefault();
  if(!chat.trim())return;
  const message=chat.trim();
  try{
   const result=applyProducerCommand(p,message);
   const entry={id:genId('msg'),text:message,time:Date.now(),response:result.response};
   onChange({...result.project,producerLog:[...(p.producerLog||[]),entry]});
   setChat('');
   notify(result.response);
  }catch(err){notify('음악 편집 불가: '+err.message);}
 };
 const switchSection=(id,patch)=>change({sections:p.sections.map(s=>s.id===id?{...s,...patch}:s)});
 const changeSectionGenre=(id,mix)=>change({sections:setSectionGenreMix(p.sections,id,mix)});
 const totalBars=p.sections.reduce((sum,s)=>sum+(Number(s.bars)||0),0);
 const sumGenre=p.genreMix.reduce((sum,g)=>sum+(Number(g.weight)||0),0);
 return <><SectionHead eyebrow="MUSIC PRODUCTION WORKSPACE" title="Music Studio" description="오디오·MIDI·가사 싱크·모음 샘플 보컬·외부 Singing 결과를 한 프로젝트에서 관리합니다." action={<div className="hstack"><Button icon="folder" onClick={()=>navigate('projects')}>프로젝트 목록</Button><Button icon="download" onClick={()=>downloadText(JSON.stringify(p,null,2),`${p.title.replace(/[^\w가-힣-]/g,'_')}.json`,'application/json')}>메타데이터 JSON</Button><Button icon="save" onClick={async()=>{try{const n=await downloadProjectBundle(p,data);notify(`전체 백업 저장: 파일 ${n}개 포함`)}catch(e){notify(`백업 실패: ${e.message}`)}}}>전체 백업</Button></div>}/>
 <div className="workspace-heading panel"><div><span className="eyebrow">NOW EDITING · {p.status}</span><input className="project-title-input" aria-label="프로젝트 제목" value={p.title} onChange={e=>change({title:e.target.value})}/><div className="inline-meta">프로젝트 ID: {p.id.slice(0,13)} · 음악 및 MV 통합 작업 공간</div></div><div className="workspace-meta"><label>BPM <input type="number" min="40" max="300" value={p.bpm} onChange={e=>change({bpm:Number(e.target.value)||120})}/></label><label>KEY <select value={p.key} onChange={e=>change({key:e.target.value})}>{['C Major','G Major','D Major','A Major','E Major','F Major','Bb Major','A Minor','E Minor','B Minor','D Minor','G Minor','F# Minor'].map(k=><option key={k}>{k}</option>)}</select></label></div></div>
 <div className="workspace-tabs">{[['arrangement','편곡 / 트랙'],['compose','작사 · 자동 작곡'],['midi','MIDI 피아노 롤'],['sync','가사·MIDI 싱크'],['phonemes','발음 타임라인'],['singing','보컬 렌더링'],['openutau','OpenUtau · 보이스뱅크'],['lyrics','가사'],['structure','곡 구조 / 장르'],['video','영상 스토리보드'],['director','96 · Creative Director'],['finish','98~100 · 출력·검증']].map(([id,name])=><button className={tab===id?'selected':''} onClick={()=>setTab(id)} key={id}>{name}</button>)}</div>
 {tab==='video'?<Video data={data} project={p} onChange={onChange} navigate={navigate} notify={notify} embedded mode="video"/>:<div className="editor-layout"><div className="editor-main">
 {tab==='director'&&<CreativeDirector96 project={p} onChange={onChange} notify={notify}/>}
 {tab==='finish'&&<FinalDelivery98 project={p} data={data} notify={notify}/>}
 {tab==='compose'&&<Songwriter project={p} onChange={onChange} notify={notify}/>}
 {tab==='arrangement'&&<AudioWorkstation project={p} onChange={change} notify={notify}/>}
 {tab==='midi'&&<MidiEditor project={p} onChange={change} notify={notify}/>}
 {tab==='sync'&&<LyricSync project={p} data={data} onChange={onChange} notify={notify}/>}
 {tab==='phonemes'&&<PhonemeEditor project={p} onChange={onChange} notify={notify}/>}
 {tab==='singing'&&<SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/>}
 {tab==='openutau'&&<OpenUtauExchange project={p} onChange={onChange} data={data} add={add} remove={remove} notify={notify}/>}
 {tab==='lyrics'&&<Panel title="Lyrics Editor" description="가사를 직접 쓰고 수정하세요."><textarea className="lyrics-input" value={p.lyrics} onChange={e=>change({lyrics:e.target.value})} placeholder={'[Verse 1]\n가사를 작성해 보세요...\n\n[Chorus]\n후렴 가사를 작성해 보세요...'} rows={17}/><div className="editor-foot">{p.lyrics.length}자 · 자동 저장됨</div></Panel>}
 {tab==='structure'&&<><Panel title="Song Structure" description="곡의 이름·마디 수·구간별 장르를 설정하세요. 구간 설정은 기본 장르를 덮어쓰지 않습니다."><div className="structure-list">{p.sections.map((s,i)=><div className="structure-item" key={s.id}>
 <div className="structure-row"><span className="section-no">{String(i+1).padStart(2,'0')}</span><input aria-label={`구간 ${i+1} 이름`} value={s.name} onChange={e=>switchSection(s.id,{name:e.target.value})}/><label>마디 <input type="number" min="1" max="128" value={s.bars} onChange={e=>switchSection(s.id,{bars:Number(e.target.value)||1})}/></label><button aria-label="구간 삭제" className="icon-btn danger" onClick={()=>change({sections:p.sections.filter(x=>x.id!==s.id)})}><Icon name="trash" size={16}/></button></div>
 <SectionGenreEditor section={s} projectMix={p.genreMix} onChange={mix=>changeSectionGenre(s.id,mix)}/>
 </div>)}</div><Button icon="plus" onClick={()=>change({sections:[...p.sections,{id:genId('sec'),name:'새 구간',bars:8}]})}>구간 추가</Button><p className="field-hint">총 {totalBars}마디 · BPM {p.bpm}</p></Panel><Panel title="Genre Mixing" description="장르를 혼합하고 비율을 조절하세요. (AI AUTO는 추후 지원)"><label className="check-item genre-auto"><input type="checkbox" checked={p.genreAuto||false} onChange={e=>change({genreAuto:e.target.checked})}/> AI AUTO (예약 옵션)</label><div className="genre-mix">{p.genreMix.map((g,i)=><div className="genre-row" key={i}><select value={g.name} onChange={e=>change({genreMix:p.genreMix.map((x,j)=>j===i?{...x,name:e.target.value}:x)})}>{genreList.map(name=><option key={name}>{name}</option>)}</select><input aria-label="장르 비율" type="range" min="0" max="100" value={g.weight} onChange={e=>change({genreMix:p.genreMix.map((x,j)=>j===i?{...x,weight:Number(e.target.value)}:x)})}/><span>{g.weight}%</span><button className="icon-btn danger" aria-label="장르 삭제" onClick={()=>{if(p.genreMix.length>1)change({genreMix:p.genreMix.filter((_,j)=>j!==i)})}}><Icon name="close" size={16}/></button></div>)}</div><div className="hstack spread"><Button icon="plus" onClick={addGenre}>장르 추가</Button><span className={sumGenre===100?'success-text':'warn-text'}>합계 {sumGenre}% {sumGenre===100?'✓':'· 100%로 맞춰 주세요'}</span></div></Panel></>}
 </div><aside className="producer-panel panel"><div className="producer-head"><span className="producer-avatar"><Icon name="spark" size={21}/></span><div><h3>AI Producer</h3><p>CREATIVE ASSISTANT</p></div><span className="producer-pending">MIDI 수정 가능</span></div><div className="producer-intro"><strong>어떤 사운드를 만들까요?</strong><p>아래의 지원된 요청은 프로젝트 MIDI와 코드를 실제로 수정합니다. 그 외의 자유 대화 AI와 오디오 음정 변경은 아직 지원하지 않습니다.</p></div><div className="suggestions">{PRODUCER_COMMAND_EXAMPLES.map(text=><button onClick={()=>setChat(text)} key={text}><Icon name="spark" size={13}/>{text}</button>)}</div><div className="chat-history">{(p.producerLog||[]).slice(-6).map(log=><div className="chat-block" key={log.id}><div className="chat-user">{log.text}</div><div className="chat-response">{log.response}</div></div>)}</div><form className="producer-form" onSubmit={logCommand}><input value={chat} onChange={e=>setChat(e.target.value)} placeholder="예: 마지막 후렴만 반키 올려줘"/><button type="submit" aria-label="보내기"><Icon name="send" size={18}/></button></form></aside></div>}
 </>;
}
