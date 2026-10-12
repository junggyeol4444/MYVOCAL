import React,{useEffect,useState} from 'react';
import GenreMixEditor from './GenreMixEditor';
import {genreList} from '../lib/schema';
import {resolveGenreMix,genreMixText,validateGenreMix} from '../lib/genreMix';
import {sectionGenreMix,singleSectionGenre} from '../lib/sectionGenre';

export default function SectionGenreEditor({section,projectMix,onChange}) {
 const customized=section.genreMix!=null;
 let effective,summary;
 try {effective=sectionGenreMix(section,projectMix);summary=genreMixText(effective);}
 catch {effective=resolveGenreMix(null,'Rock');summary='장르 설정 오류';}
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState(()=>structuredClone(effective));
 const [error,setError]=useState('');
 useEffect(()=>{setEditing(false);setError('');setDraft(structuredClone(effective));},[section.id,section.genreMix]);
 const solo=customized&&section.genreMix.length===1?section.genreMix[0].name:'__mixed';
 const selected=customized?solo:'';
 const select=e=>{
  const value=e.target.value;
  if(value==='__mixed')return;
  onChange(value?singleSectionGenre(value):null);
  setEditing(false);setError('');
 };
 const save=()=>{try{const valid=validateGenreMix(draft);onChange(valid);setError('');setEditing(false);}catch(e){setError(e.message);}};
 return <div className="section-genre-editor">
  <div className="section-genre-controls">
   <label><span className="sr-only">{section.name} 구간 장르</span><select aria-label={`${section.name} 구간 장르`} value={selected} onChange={select}>
    <option value="">프로젝트 장르 상속</option>
    {solo==='__mixed'&&customized&&<option value="__mixed" disabled>혼합 장르</option>}
    {genreList.map(name=><option key={name} value={name}>{name}</option>)}
   </select></label>
   <span className="section-genre-summary" title={summary}>{customized?'구간 지정: ':'상속: '}{summary}</span>
   <button type="button" className="section-genre-edit" onClick={()=>{setDraft(structuredClone(effective));setError('');setEditing(!editing)}} aria-expanded={editing}>{editing?'편집 닫기':'비율 편집'}</button>
  </div>
  {editing&&<div className="section-genre-draft">
   <GenreMixEditor mix={draft} onChange={next=>{setDraft(next);setError('');}}/>
   {error&&<p className="genre-mix-validation" role="alert">{error}</p>}
   <div className="hstack"><button className="section-genre-apply" type="button" onClick={save}>이 구간에 적용</button><button className="section-genre-edit" type="button" onClick={()=>{onChange(null);setEditing(false);setError('')}}>프로젝트 장르 상속</button></div>
  </div>}
 </div>;
}
