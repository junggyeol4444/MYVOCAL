import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {sha256File} from '../lib/voiceTraining.js';
import {analyzeOwnedMusicStyle8,ownedMusicGuideForProject8} from '../lib/ownedMusicStyle8.js';

// #8 MY MUSIC STYLE: a real local PCM analysis of one registered authorized
// song becomes a reusable named library profile, NOT neural training.
export default function OwnedMusicStyle8Panel({data,add,notify}){
 const [sourceId,setSourceId]=useState(''),[consent,setConsent]=useState(false),
  [busy,setBusy]=useState(false),[message,setMessage]=useState('실제 본인 음악의 음량 변화·구간별 에너지를 추출해 새 음악에서 재사용할 수 있습니다.');
 const abort=useRef(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const sources=(data?.learning||[]).filter(e=>
  e.kind==='Music Learning'&&e.assetId&&
  ['owned','self','licensed'].includes(e.rights)&&
  (e.rights!=='licensed'||String(e.rightsNote||'').trim()));
 const selected=sources.find(e=>e.id===sourceId);
 const profiles=(data?.musicStyles||[]).filter(p=>p?.analysisSource==='actual-owned-local-pcm');
 const run=async()=>{
  if(busy)return;
  const entry=selected;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);
  try{
   if(!consent||!entry)throw Error('본인이 만든 음악 또는 학습 허가된 음악의 등록 파일을 선택하고 권한을 확인해 주세요.');
   if(profiles.some(p=>p.sourceLearningId===entry.id))
    throw Error('이 원본 음악의 스타일 프로필이 이미 있습니다. 원본을 변경하지 않고 기존 프로필을 사용하세요.');
   const next=await analyzeOwnedMusicStyle8(entry,{
    loadFile:getFile,hashFile:sha256File,signal:controller.signal,onProgress:setMessage
   });
   if(controller.signal.aborted)throw Error('음악 스타일 분석 취소');
   ownedMusicGuideForProject8(next);
   add('musicStyles',next);
   setMessage('실제 자기 음악의 PCM '+next.descriptors.totalDurationSeconds.toFixed(1)+
    '초 분석 및 32구간 에너지 저장 완료. 음악 라이브러리에 별도 등록했습니다.');
   notify('원본 #8 · 내 음악 에너지 스타일을 라이브러리에 추가했습니다. 원본 음원은 변경하지 않았습니다.');
   setConsent(false);
  }catch(error){setMessage('자기 음악 스타일 분석 중단 · 원본 보존: '+error.message);}
  finally{abort.current=null;setBusy(false);}
 };
 return <Panel title="원본 8번 · 실제 내 음악으로 MY MUSIC STYLE 만들기"
  description="등록된 본인 제작·허가 음악의 원본 PCM을 오프라인으로 분석해 32구간 에너지·음량 프로필을 생성합니다. 새 곡의 강약 연출에 재사용하며 실제 음원·멜로디·가사·학습 가중치를 복제하지 않습니다.">
  <Field label="기존 Music Learning에 등록한 실제 음악 파일">
   <select disabled={busy} value={sourceId} onChange={e=>{setSourceId(e.target.value);setConsent(false);}}>
    <option value="">내가 제작했거나 학습 권한 있는 음악 선택</option>
    {sources.map(x=><option key={x.id} value={x.id}>{x.name} · {x.fileName}</option>)}
   </select>
  </Field>
  <label><input type="checkbox" disabled={busy} checked={consent}
   onChange={e=>setConsent(e.target.checked)}/>
   이 원본 음악을 직접 제작했거나 스타일 분석·재사용할 허가가 있습니다. Reference 전용 음악은 학습에 사용하지 않습니다.</label>
  <div className="hstack">
   <Button variant="primary" disabled={busy||!selected||!consent}
    onClick={run}>{busy?'실제 원곡 PCM 분석 중':'내 음악 에너지 스타일 생성 · 라이브러리 저장'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>분석 취소</Button>}
  </div>
  <p role="status">{message}</p>
  {profiles.length>0&&<p className="muted">등록된 실제 MY MUSIC STYLE: {profiles.map(p=>p.name).join(', ')}</p>}
  <Notice>원본 음악은 항상 별도 로컬 자산으로 보존합니다. BPM·코드·멜로디·장르·악기를 자동 추론한 것으로 표시하지 않습니다. 실제 신경망 재학습은 수행하지 않으며, 저장된 실제 RMS 변화만 MusicGen 프롬프트의 구간별 강약으로 재사용합니다.</Notice>
 </Panel>;
}
