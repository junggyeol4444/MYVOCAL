import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {replaceProjectVoice54} from '../lib/voiceReplace54Neural.js';
import {replaceOneDuetSinger54} from '../lib/duetVoiceReplace54.js';
import {listedDiffSingerModels} from '../lib/diffSingerVoiceRegistry.js';
import {DIFFSINGER_EXPRESSIVE_STYLES} from '../lib/diffSingerExpressiveF0.js';
import {makeImportedVocalTrack} from '../lib/lyricAlignment.js';
import {readAudioInfo} from '../lib/audioEngine.js';
import {putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb.js';
import {genId} from '../lib/schema.js';
import {readRVCPreferences} from '../lib/rvcPreferences.js';

// Original #54: explicit authorized voice replacement, never fake guide tones.
// The old recording, model weights, story scenes and cast remain unchanged.
export default function VoiceReplace54Panel({project,data,onChange,notify}){
 const latest=useRef(project);latest.current=project;
 const cancel=useRef(null);
 const [trackId,setTrackId]=useState(''),[voiceId,setVoiceId]=useState(''),
  [modelId,setModelId]=useState(''),[style,setStyle]=useState('Natural'),
  [rvc,setRvc]=useState(false),[rvcModelId,setRvcModelId]=useState(''),
  [harmonyDirection,setHarmonyDirection]=useState('above'),
  [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),
  [message,setMessage]=useState('원곡 가사·MIDI 정렬과 실제 로컬 DiffSinger가 필요합니다.');
 useEffect(()=>()=>cancel.current?.abort(),[]);
 const duet=project?.duetSingers?.version===1?project.duetSingers:null;
 const eligibleTrackIds=duet?new Set([duet.lead?.trackId,duet.harmony?.trackId]):null;
 const vocalTracks=(project?.tracks||[]).filter(t=>
  t.type==='vocal'&&!t.mute&&(t.clips||[]).some(c=>c.assetId)&&
  (!eligibleTrackIds||eligibleTrackIds.has(t.id)));
 const duetRole=duet?(duet.lead?.trackId===trackId?'lead':
  duet.harmony?.trackId===trackId?'harmony':''):'';
 const voices=(data?.voices||[]).filter(v=>
  ['self','owned','licensed'].includes(v.rights)&&
  (v.rights!=='licensed'||String(v.rightsNote||'').trim()));
 const voice=voices.find(v=>v.id===voiceId);
 const models=listedDiffSingerModels(voice,data?.voiceModels||[]).filter(m=>
  !!m.dictionaryAssetId&&/^[a-f0-9]{64}$/i.test(String(m.dictionarySha256||'')));
 const selected=models.find(m=>m.id===modelId);
 const rvcModels=(data?.voiceModels||[]).filter(m=>m.engineId==='rvc'&&
  m.voiceId===voiceId&&!!m.assetId&&/^[a-f0-9]{64}$/i.test(String(m.sha256||'')));
 const chosenRvc=rvcModels.find(m=>m.id===rvcModelId);
 const run=async()=>{
  if(busy)return;
  const previous=project;
  const controller=new AbortController();cancel.current=controller;
  setBusy(true);setMessage('기존 보컬·원본 영상을 읽기 전용으로 고정하고 새 가창을 생성합니다.');
  try{
   if(!trackId||!voice||!selected||!approved)
    throw Error('교체할 실제 보컬·허가된 새 목소리·학습 모델·명시적 동의가 필요합니다.');
   const rvcOptions=rvc?readRVCPreferences(window.localStorage):null;
   if(rvc&&(!rvcOptions||!chosenRvc))throw Error('동일 Voice의 등록 RVC 모델과 설치 경로를 선택하세요.');
   const replace=duet?replaceOneDuetSinger54:replaceProjectVoice54;
   const result=await replace(previous,{
    ...(duet?{role:duetRole,harmonyDirection}: {targetTrackId:trackId}),
    voice,confirmed:true,
    ...(duet?{model:selected}:{backend:'diffsinger',diffSingerModel:selected}),singingStyle:style,
    convertRVC:rvc,rvcOptions,registeredRVCModel:chosenRvc||null,
    session:window.__MYVOCAL_SESSION_KEY||'',signal:controller.signal,
    current:()=>latest.current,onChange:next=>{
     if(latest.current!==previous||controller.signal.aborted)
      throw Error('실제 보컬 교체 도중 원곡이 변경됐습니다.');
     latest.current=next;
     return onChange(next);
    },
    newId:genId,readInfo:readAudioInfo,
    createTrack:makeImportedVocalTrack,store:putFilesAtomic,rollback:deleteFilesAtomic,
    onProgress:setMessage
   });
   setApproved(false);
   setMessage('실제 신경망 보컬 '+(result.newVocalAssets??result.actualNeuralVocalAssets)+
    '개를 새 DAW WAV 트랙으로 저장했습니다. 이전 보컬은 음소거만 했으며 MV의 장면·사진·영상은 보존했습니다.');
   notify('원곡 영상·캐릭터를 유지하고 목소리만 실제 DiffSinger 가창으로 교체했습니다.');
  }catch(error){setMessage('교체 중단 · 기존 목소리/원본 보존: '+error.message);}
  finally{cancel.current=null;setBusy(false);}
 };
 return <Panel title="원본 54항 · 실제 학습된 목소리로 보컬만 교체"
  description="기존 노래의 가사·MIDI를 유지하고 새 Voice로 실제 DiffSinger Acoustic+Vocoder 가창 WAV를 생성합니다. 성공하면 선택한 이전 보컬만 음소거하며 모든 원본과 MV 영상·캐릭터를 보존합니다.">
  <div className="form-two">
   <Field label="교체 대상 기존 가창 트랙"><select disabled={busy} value={trackId}
    onChange={e=>{setTrackId(e.target.value);setApproved(false);}}>
    <option value="">실제 보컬 WAV 하나 선택</option>
    {vocalTracks.map(t=><option key={t.id} value={t.id}>{t.name} ({t.clips.length}개 클립)</option>)}
   </select></Field>
   <Field label="새 가창 목소리 (본인 또는 허가된 Voice)"><select disabled={busy} value={voiceId}
    onChange={e=>{setVoiceId(e.target.value);setModelId('');setRvcModelId('');setApproved(false);}}>
    <option value="">새 목소리 등록 후 선택</option>
    {voices.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}
   </select></Field>
  </div>
  <Field label="신규 Voice의 실제 학습 DiffSinger Acoustic 모델"><select disabled={busy} value={modelId}
   onChange={e=>{setModelId(e.target.value);setApproved(false);}}>
   <option value="">등록된 실제 Acoustic과 한국어 발음 사전 선택</option>
   {models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
  </select></Field>
  <Field label="실제 MIDI/F0 창법 표현 (음색 변조가 아님)"><select disabled={busy} value={style}
   onChange={e=>{setStyle(e.target.value);setApproved(false);}}>
   {DIFFSINGER_EXPRESSIVE_STYLES.map(s=><option key={s}>{s}</option>)}
  </select></Field>
  {duet&&duetRole==='harmony'&&<Field label="기존 듀엣 화음 방향 (원본 가사·MIDI에서 3도 재생성)"><select disabled={busy} value={harmonyDirection} onChange={e=>{setHarmonyDirection(e.target.value);setApproved(false);}}><option value="above">3도 위</option><option value="below">3도 아래</option></select></Field>}
  <label><input type="checkbox" disabled={busy} checked={rvc} onChange={e=>{setRvc(e.target.checked);setApproved(false);}}/>
   새 가창을 동일 목소리의 등록 RVC 모델로 한 번 더 변환</label>
  {rvc&&<Field label="동일 Voice RVC 모델"><select disabled={busy} value={rvcModelId}
   onChange={e=>{setRvcModelId(e.target.value);setApproved(false);}}>
   <option value="">모델 선택</option>
   {rvcModels.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
  </select></Field>}
  <label><input type="checkbox" disabled={busy} checked={approved} onChange={e=>setApproved(e.target.checked)}/>
   실제 새 목소리의 사용 권한과 기존 보컬 트랙 음소거에 동의합니다. 기존 음성·사진·영상은 삭제하지 않습니다.</label>
  <div className="hstack">
   <Button variant="primary" disabled={busy||!trackId||!voice||!selected||!approved||
    (rvc&&!chosenRvc)||(duet&&!duetRole)} onClick={run}>
    {busy?'실제 로컬 신경망 새 보컬 생성 중':'실제 신경망 보컬 생성 → 이전 보컬 음소거'}
   </Button>
   {busy&&<Button onClick={()=>cancel.current?.abort()}>보컬 생성 중단</Button>}
  </div>
  <p role="status">{message}</p>
  {duet&&<Notice>듀엣에서는 선택한 리드 또는 화음 한 명만 다시 노래하게 합니다. 리드는 원곡 MIDI, 화음은 선택한 3도 음정을 사용합니다. 기존 다른 가수의 Voice·캐릭터·WAV는 변경하지 않으며, 새 실제 가창 WAV의 트랙 ID만 듀엣 구성에 갱신합니다.</Notice>}
  <Notice>등록된 한국어 발음 사전과 실제 로컬 체크포인트가 필요합니다. MIDI·가사가 바뀌면 저장한 정렬을 다시 확인하세요. 미리보기 샘플·가짜 가창은 새 보컬로 저장되지 않습니다. 장편 변환과 음질은 Windows GPU 환경에서 별도 검증 대상입니다.</Notice>
 </Panel>;
}
