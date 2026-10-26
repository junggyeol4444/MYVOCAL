import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {sha256File} from '../lib/voiceTraining.js';
import {analyzeOwnedMusicStyle8,ownedMusicGuideForProject8} from '../lib/ownedMusicStyle8.js';
import {suggestOwnedMusicTempoKey8} from '../lib/ownedMusicTempoTonal8.js';

// #8 MY MUSIC STYLE: a real local PCM analysis of one registered authorized
// song becomes a reusable named library profile, NOT neural training.
export default function OwnedMusicStyle8Panel({data,add,notify}){
 const [sourceId,setSourceId]=useState(''),[consent,setConsent]=useState(false),
  [busy,setBusy]=useState(false),[message,setMessage]=useState('실제 본인 음악의 32구간 강약·리듬 BPM·조성(Key) 후보를 오프라인 PCM에서 분석합니다.');
 const [reAnalyze,setReAnalyze]=useState(false);
 const abort=useRef(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const sources=(data?.learning||[]).filter(e=>
  e.kind==='Music Learning'&&e.assetId&&
  ['owned','self','licensed'].includes(e.rights)&&
  (e.rights!=='licensed'||String(e.rightsNote||'').trim()));
 const selected=sources.find(e=>e.id===sourceId);
 const oldProfile=(data?.musicStyles||[]).find(p=>p.sourceLearningId===sourceId);
 const profiles=(data?.musicStyles||[]).filter(p=>p?.analysisSource==='actual-owned-local-pcm');
 const run=async()=>{
  if(busy)return;
  const entry=selected;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);
  try{
   if(!consent||!entry)throw Error('본인이 만든 음악 또는 학습 허가된 음악의 등록 파일을 선택하고 권한을 확인해 주세요.');
   if(oldProfile&&!reAnalyze)
    throw Error('기존 분석 프로필이 있습니다. 명시적으로 재분석을 승인하면 이전 분석 정보를 이력으로 보존합니다.');
   const next=await analyzeOwnedMusicStyle8(entry,{
    loadFile:getFile,hashFile:sha256File,signal:controller.signal,onProgress:setMessage
   });
   if(controller.signal.aborted)throw Error('음악 스타일 분석 취소');
   ownedMusicGuideForProject8(next);
   const oldHistory=Array.isArray(oldProfile?.priorStyleAnalyses8)?oldProfile.priorStyleAnalyses8:[];
   const preserved=oldProfile?{
     ...next,priorStyleAnalyses8:[...oldHistory,
      {savedAt:new Date().toISOString(),descriptors:oldProfile.descriptors,
       energy32:oldProfile.energy32,sourceHash:oldProfile.sources?.[0]?.sha256||'',
       audioFeatures8:oldProfile.audioFeatures8||null}
     ].slice(-3)
   }:next;
   add('musicStyles',preserved);
   const suggested=suggestOwnedMusicTempoKey8(preserved);
   const tempo=suggested?.bpm?String(suggested.bpm)+' BPM':'확정 어려움';
   const key=suggested?.key||'확정 어려움';
   setMessage('실제 원본 PCM '+next.descriptors.totalDurationSeconds.toFixed(1)+
    '초의 강약 32구간 · 추정 BPM '+tempo+' · 추정 Key '+key+
    '를 라이브러리에 보존했습니다. 조성·템포는 실제 음원에 따라 틀릴 수 있습니다.');
   notify('원본 #8 · 권한 있는 실제 음악의 강약·BPM·조성 후보 분석 저장 완료 (모델 신경망 학습 아님)');
   setReAnalyze(false);
   setConsent(false);
  }catch(error){setMessage('자기 음악 스타일 분석 중단 · 원본 보존: '+error.message);}
  finally{abort.current=null;setBusy(false);}
 };
 return <Panel title="원본 8번 · 실제 내 음악으로 MY MUSIC STYLE 만들기"
  description="권한 있는 원곡 PCM에서 32구간 강약, 비트 간격(BPM 후보), 주파수 조성(Key 후보)을 오프라인 추정합니다. 새 음악 제작 시 선택 가능하며 원본 노래·가사·음원·MIDI는 복제하지 않습니다.">
  <Field label="기존 Music Learning에 등록한 실제 음악 파일">
   <select disabled={busy} value={sourceId} onChange={e=>{setSourceId(e.target.value);setConsent(false);}}>
    <option value="">내가 제작했거나 학습 권한 있는 음악 선택</option>
    {sources.map(x=><option key={x.id} value={x.id}>{x.name} · {x.fileName}</option>)}
   </select>
  </Field>
  <label><input type="checkbox" disabled={busy} checked={consent}
   onChange={e=>setConsent(e.target.checked)}/>
   이 원본 음악을 직접 제작했거나 스타일 분석·재사용할 허가가 있습니다. Reference 전용 음악은 학습에 사용하지 않습니다.</label>
  {oldProfile&&<label><input type="checkbox" disabled={busy} checked={reAnalyze}
    onChange={e=>setReAnalyze(e.target.checked)}/>
    기존 MY MUSIC STYLE 재분석 승인 · 이전 원곡 분석 수치를 별도 이력에 남김</label>}
  <div className="hstack">
   <Button variant="primary" disabled={busy||!selected||!consent||(!!oldProfile&&!reAnalyze)}
    onClick={run}>{busy?'실제 원곡 PCM BPM·Key 분석 중':'내 음악 강약·BPM·Key 오디오 분석 · 라이브러리 저장'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>분석 취소</Button>}
  </div>
  <p role="status">{message}</p>
  {profiles.length>0&&<div>{profiles.map(p=>{
    const analyzed=suggestOwnedMusicTempoKey8(p);
    return <p key={p.id} className="muted">내 음악 프로필: {p.name} ·
     오디오 BPM {analyzed?.bpm??'판별 보류'} ·
     조성 {analyzed?.key??'판별 보류'} ·
     실제 에너지 {p.energy32?.length||0}구간 ·
     {p.audioFeatures8?'실제 PCM 비트·주파수 분석':'기존 강약만 분석'}
    </p>;
   })}</div>}
  <Notice>실제 주파수·RMS·반복 비트에서 BPM와 Key를 추정합니다. 하프타임/더블타임 리듬·배음·전조가 있으면 틀릴 수 있으므로 확정값이 아니며 새 곡에서 사용자가 직접 선택해야 합니다. 코드 진행·멜로디·장르·악기 구성 추출과 신경망 가중치 학습은 아직 수행하지 않습니다. 이전 원곡 파일과 선택한 Voice·캐릭터는 그대로 유지합니다.</Notice>
 </Panel>;
}
