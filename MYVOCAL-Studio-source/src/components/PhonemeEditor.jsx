import React,{useEffect,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {isAlignmentStale} from '../lib/lyricAlignment';
import {buildPhonemePlan,isPhonemePlanStale,validatePhonemePlan,planAsCsv,planAsJson} from '../lib/phonemePlan';

function downloadText(text,name,type){const blob=new Blob([text],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
const niceTime=x=>Number(x).toFixed(3);
export default function PhonemeEditor({project:p,onChange,notify}){
 const alignment=p.vocalAlignment&&!isAlignmentStale(p,p.vocalAlignment)?p.vocalAlignment:null;
 const saved=p.phonemePlan&&!isPhonemePlanStale(alignment,p.phonemePlan)?p.phonemePlan:null;
 const [draft,setDraft]=useState(null),[error,setError]=useState('');
 useEffect(()=>{setDraft(null);setError('');},[p.id]);
 const current=draft||saved;
 const generate=()=>{try{if(!alignment)throw Error('먼저 가사·MIDI 싱크를 저장하세요.');setDraft(buildPhonemePlan(alignment));setError('');notify('한국어 자모 단위 발음 힌트를 생성했습니다. 실제 발음 자동 분석은 아닙니다.');}catch(e){setError(e.message);notify(e.message)}};
 const edit=(index,key,value)=>{if(!current)return;const val=key==='token'?value:Number(value);setDraft({...current,segments:current.segments.map((s,i)=>i===index?{...s,[key]:val}:s)});setError('');};
 const save=()=>{try{validatePhonemePlan(current,alignment);onChange({...p,phonemePlan:current});setDraft(null);setError('');notify('발음 타임라인을 프로젝트에 저장했습니다.');}catch(e){setError(e.message);notify('저장 실패: '+e.message)}};
 const exportFile=kind=>{try{if(!current)throw Error('발음 계획부터 생성하세요.');const slug=String(p.title||'project').replace(/[^\w가-힣-]/g,'_').slice(0,40);if(kind==='csv')downloadText(planAsCsv(current,alignment),slug+'-pronunciation-hints.csv','text/csv;charset=utf-8');else downloadText(planAsJson(current,alignment),slug+'-pronunciation-hints.json','application/json;charset=utf-8');notify('발음 힌트 파일을 저장했습니다. AI 가창 모델의 실제 음소 규격과는 별도입니다.');}catch(e){setError(e.message)}};
 return <>
  <Panel title="한국어 발음·타임라인 편집 · v1.3" description="가사와 MIDI를 바탕으로 자모(초성·중성·종성)별 시간 힌트를 만들고, 구간과 발음 기호를 직접 수정할 수 있습니다. 기계학습 G2P/강제 정렬이 아닙니다.">
   <div className="mv7-actions"><Button icon="spark" variant="primary" disabled={!alignment} onClick={generate}>발음 힌트 자동 생성</Button><Button icon="save" disabled={!current} onClick={save}>발음 계획 저장</Button>{current&&<Status>{draft?'미저장 편집':'저장됨'} · {current.segments.length}구간</Status>}</div>
   {!alignment&&<Notice>먼저 프로젝트의 ‘가사·MIDI 싱크’ 탭에서 MIDI 음표에 가사를 배치하고 저장해야 합니다.</Notice>}
   {p.phonemePlan&&!saved&&!draft&&<Notice>가사, MIDI 또는 가사 싱크가 변경돼 기존 발음 계획은 오래됐습니다. 새로 생성해 주세요.</Notice>}
   {error&&<Notice>{error}</Notice>}
   {current&&<><div className="mv13-summary"><span>발음 힌트 {current.segments.length}개</span><span>시작/종료 시간을 개별 수정 가능</span><span>내보내기: JSON · CSV</span></div>
    <div className="mv9-scroll"><table className="mv9-table"><thead><tr><th>음표</th><th>글자</th><th>구간</th><th>발음 힌트</th><th>시작(초)</th><th>끝(초)</th><th>MIDI</th></tr></thead><tbody>{current.segments.map((s,i)=><tr key={s.id}><td>{s.cueIndex}</td><td>{s.syllable}</td><td>{s.kind==='onset'?'초성':s.kind==='nucleus'?'중성':s.kind==='coda'?'종성':'문자'}</td><td><input aria-label={`${i+1}번 발음 기호`} value={s.token} maxLength={40} onChange={e=>edit(i,'token',e.target.value)} /></td><td><input className="mv13-number" aria-label={`${i+1}번 발음 시작`} type="number" step="0.001" min="0" max="90" value={s.startSec} onChange={e=>edit(i,'startSec',e.target.value)}/></td><td><input className="mv13-number" aria-label={`${i+1}번 발음 종료`} type="number" step="0.001" min="0" max="90" value={s.endSec} onChange={e=>edit(i,'endSec',e.target.value)}/></td><td>{s.pitch}</td></tr>)}</tbody></table></div>
    <div className="mv7-actions"><Button icon="download" onClick={()=>exportFile('json')}>JSON 내보내기</Button><Button icon="download" onClick={()=>exportFile('csv')}>CSV 내보내기</Button></div>
    {current.warnings?.length>0&&<Notice>변환하지 못한 문자 또는 너무 짧은 음표 {current.warnings.length}건: {current.warnings.slice(0,3).join(' / ')}</Notice>}
   </>}
  </Panel>
  <Panel title="내장 오프라인 가이드 및 외부 Singing 엔진과의 관계" description="저장한 자모 시간 구간은 내장 오프라인 가이드의 음절 길이와 시작 위치에도 반영하며, 외부 엔진에는 참고 데이터로 전달합니다.">
   <Notice>한글 자모는 실제 발음 기호(IPA)가 아닙니다. 연음·된소리·비음화·발음 축약을 자동 처리하지 않습니다. 각 음소 길이는 규칙 기반 추정입니다. 내장 오프라인 가이드는 저장된 한글 초성·중성·종성 시간에 맞춰 규칙 기반 합성 신호를 만들지만 실제 음소 발음이나 신경망 가창은 아닙니다. 영문 등 지원하지 않는 문자는 기존 균등 배분을 사용합니다.</Notice>
  </Panel>
 </>;
}
