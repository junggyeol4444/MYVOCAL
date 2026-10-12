import React, {useEffect,useState} from 'react';
import {getFile} from '../lib/assetDb';
export function Icon({name,size=19}) {
 const paths={
 home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
 spark:<><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="m20 17 .7 2.3L23 20l-2.3.7L20 23l-.7-2.3L17 20l2.3-.7z"/></>,
 music:<><path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/></>,
 mic:<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></>,
 video:<><rect x="2" y="5" width="16" height="14" rx="2"/><path d="m18 10 4-3v10l-4-3"/></>,
 user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
 book:<><path d="M4 4h14a2 2 0 0 1 2 2v15H6a2 2 0 0 1-2-2zM4 6a2 2 0 0 1 2-2"/><path d="M8 9h8m-8 4h6"/></>,
 folder:<><path d="M3 6h7l2 2h9v12H3z"/></>,
 layers:<><path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/></>,
 settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 arrow:<><path d="M5 12h14m-7-7 7 7-7 7"/></>,
 chevron:<path d="m9 18 6-6-6-6"/>,
 close:<path d="M5 5l14 14M19 5 5 19"/>,
 trash:<><path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v7m4-7v7"/></>,
 save:<><path d="M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-8h10v8"/></>,
 upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/></>,
 download:<><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></>,
 lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
 play:<path d="m8 5 12 7-12 7z"/>,
 wave:<><path d="M2 12h2m2-5v10m4-14v18m4-14v10m4-8v6m4-3h1"/></>,
 image:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m21 17-5-5-8 9"/></>,
 eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
 copy:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
 check:<path d="m4 12 5 5L20 6"/>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
 send:<path d="m3 11 18-8-8 18-2-8z"/>,
 sliders:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
 info:<><circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v1"/></>,
 menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
 };return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.spark}</svg>;
}
export function Button({children,icon,variant='secondary',className='',...props}) {return <button type="button" className={`btn btn-${variant} ${className}`} {...props}>{icon&&<Icon name={icon} size={17}/>}<span>{children}</span></button>;}
export function SectionHead({eyebrow,title,description,action}) {return <div className="section-head"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description&&<p className="subtext">{description}</p>}</div>{action}</div>;}
export function Empty({icon='folder',title,description,action}) {return <div className="empty"><div className="empty-icon"><Icon name={icon} size={25}/></div><strong>{title}</strong>{description&&<p>{description}</p>}{action}</div>;}
export function Field({label,children,hint}) {return <label className="field"><span className="field-label">{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Status({ready=false,children}) {return <span className={`status ${ready?'status-ready':'status-future'}`}>{children}</span>;}
export function Panel({title,description,children,action,className=''}) {return <section className={`panel ${className}`}><div className="panel-top"><div><h3>{title}</h3>{description&&<p>{description}</p>}</div>{action}</div>{children}</section>;}
export function AssetPreview({id,kind='image',className=''}) {const [url,setUrl]=useState('');useEffect(()=>{let alive=true,objectUrl='';if(id)getFile(id).then(file=>{if(file&&alive){objectUrl=URL.createObjectURL(file);setUrl(objectUrl);}}).catch(()=>{});return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[id]);return kind==='audio'?url?<audio controls src={url} style={{width:'100%',height:34}}/>:<span className="muted">미리보기 없음</span>:url?<img className={className} src={url} alt="등록한 이미지"/>:<div className={`asset-fallback ${className}`}><Icon name="image" size={26}/></div>;}
export function Notice({children}) {return <div className="notice"><Icon name="info" size={17}/><span>{children}</span></div>}
export function Modal({title,children,onClose}) {useEffect(()=>{const fn=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[onClose]);return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="close"/></button></div>{children}</div></div>;}
