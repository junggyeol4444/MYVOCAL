import React,{useState} from 'react';
import {getFile} from '../lib/assetDb.js';
import {analyzeReferencePcm,referenceRights,validateReferenceReport,compareReferenceReports,REFERENCE_ANALYSIS_LIMITS} from '../lib/referenceMusicAnalysis.js';

// Runs only in the local browser/WebView2. No uploads, tracking or AI inference.
export default function ReferenceMusicPanel({assets=[]}){
 const [file,setFile]=useState(null),[registeredId,setRegisteredId]=useState('');
 const [name,setName]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [report,setReport]=useState(null),[other,setOther]=useState(null),[error,setError]=useState('');
 const refs=assets.filter(a=>a.kind==='Reference Analysis'&&a.rights==='reference'&&a.assetId&&/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(a.fileName||''));
 const onChoose=e=>{const f=e.target.files?.[0]||null;setFile(f);setRegisteredId('');setReport(null);setError('');if(f)setName(f.name.replace(/\.[^.]+$/,''));};
 const onRegistered=e=>{const id=e.target.value;setRegisteredId(id);setFile(null);setReport(null);setError('');const entry=refs.find(a=>a.id===id);if(entry)setName(entry.name);};
 const run=async()=>{
  if(busy)return;setBusy(true);setError('');setReport(null);setOther(null);
  let context;
  try{
   if(!consent)throw new Error('Reference 전용 사용 동의를 확인하세요.');
   const entry=refs.find(a=>a.id===registeredId);
   const audio=file||(entry&&await getFile(entry.assetId));
   if(!audio)throw new Error('오디오 파일을 선택하세요.');
   if(!Number.isSafeInteger(audio.size)||audio.size===0||audio.size>REFERENCE_ANALYSIS_LIMITS.maxFileBytes)throw new Error('오디오는 30MB 이하의 비어 있지 않은 파일이어야 합니다.');
   if(!/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(audio.name||entry?.fileName||''))throw new Error('지원 대상 오디오 확장자가 아닙니다.');
   const AudioContextClass=window.AudioContext||window.webkitAudioContext;
   if(!AudioContextClass)throw new Error('이 환경에서 로컬 오디오 디코딩을 지원하지 않습니다.');
   context=new AudioContextClass();
   const decoded=await context.decodeAudioData(await audio.arrayBuffer());
   const {sampleRate,numberOfChannels:channels,length}=decoded;
   if(length/sampleRate>REFERENCE_ANALYSIS_LIMITS.maxSeconds||length*channels>REFERENCE_ANALYSIS_LIMITS.maxInterleavedSamples)throw new Error('최대 5분 또는 1,200만 PCM 샘플을 초과했습니다.');
   const pcm=new Float32Array(length*channels);
   for(let c=0;c<channels;c++){const src=decoded.getChannelData(c);for(let i=0;i<length;i++)pcm[i*channels+c]=src[i];}
   setReport(analyzeReferencePcm({label:name,rights:referenceRights(name),samples:pcm,sampleRate,channels}));
  }catch(err){setError('참고 분석 실패: '+err.message);}finally{if(context)await context.close().catch(()=>{});setBusy(false);}
 };
 const importOther=async e=>{
  setError('');setOther(null);const f=e.target.files?.[0];if(!f)return;
  try{if(f.size>100*1024)throw new Error('JSON 크기는 100KB 이하여야 합니다.');const json=JSON.parse(await f.text());validateReferenceReport(json);setOther(json);}catch(err){setError('비교 보고서 가져오기 실패: '+err.message);}
 };
 const download=()=>{
  if(!report)return;
  const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='MYVOCAL-reference-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const comparison=report&&other?compareReferenceReports(report,other):null;
 return <section className="panel" aria-label="오프라인 Reference 음악 분석" style={{marginTop:16}}>
  <div className="panel-top"><div><h3>REFERENCE ANALYSIS · 오프라인 음악 비교</h3><p>등록된 참고 음악 또는 새 오디오 파일의 음량·시간대별 에너지만 분석합니다.</p></div></div>
  <p><label>기존 Reference 자료 <select aria-label="기존 Reference 오디오" value={registeredId} onChange={onRegistered}><option value="">선택하지 않음</option>{refs.map(a=><option key={a.id} value={a.id}>{a.name} ({a.fileName})</option>)}</select></label></p>
  <p><label>새 오디오 파일 <input type="file" accept=".wav,.mp3,.ogg,.flac,.m4a,.aac,audio/*" aria-label="참고 음악 파일" onChange={onChoose}/></label></p>
  <p><label>분석 이름 <input aria-label="참고 분석 이름" maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label></p>
  <p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Reference 분석 전용으로 사용하며 모델 학습에 사용하지 않음</label></p>
  <p><button disabled={busy||!consent||!(file||registeredId)||!name.trim()} onClick={run}>{busy?'로컬 분석 중…':'참고 음악 분석'}</button></p>
  {error&&<p role="alert" style={{color:'var(--danger,#f87171)'}}>{error}</p>}
  {report&&<div role="status"><p><strong>{report.name}</strong> · {report.descriptors.durationSeconds}초 · 피크 {report.descriptors.peak} · RMS {report.descriptors.rms} · 활성 구간 {Math.round(report.descriptors.activeFraction*100)}%</p><p>구간별 RMS 에너지 (32개 구간)</p><div aria-label="시간대별 RMS 에너지" style={{display:'flex',height:90,alignItems:'flex-end',gap:2}}>{report.descriptors.energyCurve.map((v,i)=><div key={i} title={`${i+1}/32 : ${v}`} style={{flex:1,minHeight:1,height:`${Math.max(1,Math.min(100,v/Math.max(0.01,report.descriptors.peak)*100))}%`,background:'var(--accent,#7a7de9)'}}/>)}</div><p><button onClick={download}>분석 보고서 JSON 내려받기</button></p><p><label>다른 Reference 보고서와 비교 <input type="file" accept=".json,application/json" aria-label="비교 보고서" onChange={importOther}/></label></p>{comparison&&<p>비교: 길이 차이 {comparison.durationDifferenceSeconds}초, RMS 차이 {comparison.rmsDifference}, 에너지 곡선 평균 거리 {comparison.meanEnergyCurveDistance}. 유사도나 저작권 판단 수치는 제공하지 않습니다.</p>}</div>}
  <p><small>원본 음원·PCM은 보고서에 저장하지 않습니다. BPM·Key·Chord·장르·악기 추정이나 AI 학습은 수행하지 않습니다. 최대 30MB / 5분 / 1,200만 PCM 샘플이며 브라우저 지원 코덱만 열 수 있습니다.</small></p>
 </section>;
}
