import React from 'react';
import {Icon} from './UI';
const groups=[
 {label:'WORKSPACE',items:[['home','홈','home'],['create','AI로 노래 만들기','spark'],['projects','내 프로젝트','folder']]},
 {label:'STUDIOS',items:[['music','Music Studio','music'],['voices','Voice Studio','mic'],['training','Voice Training','wave'],['characters','Character Studio','user'],['video','Video Studio','video'],['pv','Vocal Synth PV','wave'],['learning','Learning Studio','book']]},
 {label:'MANAGE',items:[['library','라이브러리','layers'],['settings','로컬 설정','settings']]}
];
export default function Sidebar({page,navigate,isOpen,close}) {return <><div className={`sidebar-backdrop ${isOpen?'visible':''}`} onClick={close}/><aside className={`sidebar ${isOpen?'open':''}`}><button className="brand" onClick={()=>navigate('home')}><span className="brand-mark">M<span>✦</span></span><span className="brand-label"><strong>MYVOCAL</strong><small>STUDIO <b>v1.8</b></small></span></button><div className="side-divider"/>{groups.map(g=><div className="nav-group" key={g.label}><div className="nav-caption">{g.label}</div>{g.items.map(([key,label,icon])=><button key={key} className={`nav-item ${page===key?'active':''}`} onClick={()=>navigate(key)}><Icon name={icon} size={18}/><span>{label}</span>{page===key&&<span className="nav-indicator"/>}</button>)}</div>)}<div className="side-bottom"><div className="stage-dot"/><div><strong>프로토타입 v1.8</strong><span>오디오 · MIDI · Voicebank</span></div></div></aside></>}
