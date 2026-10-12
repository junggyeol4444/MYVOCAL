import React from 'react';
import {genreList} from '../lib/schema';
import {addGenreToMix,removeGenreFromMix} from '../lib/genreMix';

// The editor intentionally allows an intermediate total != 100 while typing;
// creation and composition validate the mix before writing any project data.
export default function GenreMixEditor({mix,onChange,disabled=false}) {
 const total = mix.reduce((sum,item)=>sum+Number(item.weight||0),0);
 return <div className="genre-mix-editor">
  <div className="genre-mix-heading"><span>장르 혼합 비율 (최대 3개)</span><strong className={total===100?'genre-mix-ok':'genre-mix-error'}>{total}% / 100%</strong></div>
  {mix.map((entry,index)=><div className="genre-mix-entry" key={index}>
   <label className="genre-mix-select"><span className="sr-only">장르 {index+1}</span><select disabled={disabled} value={entry.name} onChange={e=>onChange(mix.map((item,i)=>i===index?{...item,name:e.target.value}:item))}>{genreList.map(name=><option key={name} value={name} disabled={mix.some((item,i)=>i!==index&&item.name===name)}>{name}</option>)}</select></label>
   <label className="genre-mix-weight"><span className="sr-only">{entry.name} 비율</span><input disabled={disabled} type="number" min="1" max="100" step="1" value={entry.weight} onChange={e=>onChange(mix.map((item,i)=>i===index?{...item,weight:e.target.value}:item))} aria-label={`${entry.name} 비율`}/><span>%</span></label>
   {mix.length>1&&<button type="button" className="genre-mix-remove" disabled={disabled||total!==100} aria-label={`${entry.name} 제거`} onClick={()=>onChange(removeGenreFromMix(mix,index))}>제거</button>}
  </div>)}
  {mix.length<3&&<button className="genre-mix-add" type="button" disabled={disabled||total!==100} onClick={()=>onChange(addGenreToMix(mix))}>+ 장르 추가</button>}
  <p className="genre-mix-hint">장르 비율은 프로젝트에 저장됩니다. 로컬 작곡은 규칙 기반이며 AI 혼합 편곡 모델은 아닙니다.</p>
 </div>;
}
