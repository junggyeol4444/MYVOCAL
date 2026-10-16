import React from 'react';
import {Icon,Button,Empty,SectionHead,Status} from '../components/UI';
import {readableDate} from '../lib/schema';
const modules=[
 {key:'create',icon:'spark',tag:'LOCAL MUSIC',name:'AI로 노래 만들기',desc:'가사·MIDI 작곡 및 편집 · AI 가창은 미연결',color:'purple'},
 {key:'voices',icon:'mic',tag:'VOICE STUDIO',name:'내 AI 가수 만들기',desc:'목소리 자료 등록 및 보컬 관리',color:'blue'},
 {key:'music',icon:'music',tag:'MUSIC STUDIO',name:'직접 작곡하기',desc:'트랙 · 가사 · 곡 구조 편집',color:'pink'},
 {key:'video',icon:'video',tag:'VIDEO STUDIO',name:'뮤직비디오 만들기',desc:'스토리보드와 연출 설정',color:'orange'},
 {key:'characters',icon:'user',tag:'CHARACTER',name:'사람 / 캐릭터 등록',desc:'캐릭터와 인물 자산 관리',color:'green'},
 {key:'pv',icon:'wave',tag:'VOCAL SYNTH',name:'캐릭터 PV 만들기',desc:'보컬 신스 PV 기획 워크플로',color:'pink'},
 {key:'learning',icon:'book',tag:'LEARNING',name:'AI 학습실',desc:'학습 자료와 Reference 분류',color:'blue'},
 {key:'projects',icon:'folder',tag:'PROJECTS',name:'프로젝트 열기',desc:'저장된 음악·영상 작업 관리',color:'purple'},
];
export default function Dashboard({data,navigate,createProject}){
 const latest=[...data.projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3);
 return <><div className="hero"><div className="hero-glow hero-glow-one"/><div className="hero-glow hero-glow-two"/><div className="hero-copy"><div className="hero-badge"><span className="tiny-star">✦</span> ONE STUDIO. INFINITE CREATION.</div><h1>음악부터 뮤직비디오까지,<br/><span>당신의 창작이 시작되는 곳.</span></h1><p>내 목소리와 캐릭터를 연결하고, 음악과 영상을 하나의 프로젝트에서 만드세요.</p><div className="hero-actions"><Button variant="primary" icon="spark" onClick={()=>navigate('create')}>AI로 노래 만들기</Button><Button icon="folder" onClick={()=>navigate('projects')}>프로젝트 열기</Button></div></div><div className="hero-art"><div className="hero-disc disc1"/><div className="hero-disc disc2"/><div className="hero-disc disc3"/><div className="hero-center">M<span>✦</span></div><div className="hero-wave wave1"/><div className="hero-wave wave2"/></div></div>
 <div className="summary-stats"><div><span>PROJECTS</span><strong>{data.projects.length.toString().padStart(2,'0')}</strong><small>생성한 프로젝트</small></div><div><span>VOICE MODELS</span><strong>{data.voices.length.toString().padStart(2,'0')}</strong><small>등록된 목소리 자료</small></div><div><span>CHARACTERS</span><strong>{data.characters.length.toString().padStart(2,'0')}</strong><small>등록된 사람 / 캐릭터</small></div><div><span>VIRTUAL SINGERS</span><strong>{data.virtualSingers.length.toString().padStart(2,'0')}</strong><small>연결된 가상 가수</small></div></div>
 <div className="mv7-dashboard-link"><span>VOICE TRAINING v1.0 · 데이터 준비 및 샘플 보컬 미리보기</span><Button icon="arrow" onClick={()=>navigate('training')}>학습 준비 관리자 열기</Button></div>
 <SectionHead eyebrow="CREATE & EXPLORE" title="무엇을 만들고 싶나요?" description="필요한 스튜디오를 선택하세요. 모든 화면을 자유롭게 이동할 수 있습니다."/>
 <div className="module-grid">{modules.map((item)=><button className="module-card" key={item.key} onClick={()=>navigate(item.key)}><span className={`module-icon tint-${item.color}`}><Icon name={item.icon} size={24}/></span><span className="module-tag">{item.tag}</span><span className="module-title">{item.name}</span><span className="module-desc">{item.desc}</span><span className="module-arrow"><Icon name="arrow" size={17}/></span></button>)}</div>
 <SectionHead eyebrow="CONTINUE WORKING" title="최근 프로젝트" action={<button className="text-action" onClick={()=>navigate('projects')}>전체 보기 <Icon name="arrow" size={15}/></button>}/>
 {latest.length?<div className="recent-grid">{latest.map(p=><button key={p.id} className="recent-card" onClick={()=>navigate('workspace',p.id)}><div className="recent-art"><Icon name={p.withVideo?'video':'music'} size={30}/></div><div className="recent-body"><span className="recent-status">● {p.status}</span><strong>{p.title}</strong><small>{p.genreMix?.map(g=>g.name).join(' + ')} · {p.bpm} BPM</small><span>{readableDate(p.updatedAt)} 수정</span></div><Icon name="chevron" size={18}/></button>)}</div>:<Empty icon="music" title="아직 프로젝트가 없습니다" description="새 음악을 만들면 여기서 바로 이어서 작업할 수 있습니다." action={<Button variant="primary" icon="plus" onClick={()=>navigate('create')}>첫 프로젝트 만들기</Button>}/>}
 </>;
}
