import React,{useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {registerGeneratedSinger13,prepareAutoSingerVoiceLink26} from '../lib/autoSingerLibrary13.js';
// 원본 13·26·58·59항: 기존 Windows MV 화면에서 AI 첫 가수 이미지 재사용 등록.
// 사용자의 체크/버튼 없이는 어떠한 캐릭터나 원본도 생성·수정하지 않는다.
export default function AutoSingerRegisterPanel({project,characters=[],voices=[],models=[],virtualSingers=[],onRegister,onRegisterVirtualSinger,notify}){
 const anchor=project?.autoVirtualSingerImageV1;
 const [name,setName]=useState(''),[voiceId,setVoiceId]=useState(''),[modelId,setModelId]=useState(''),[singingStyle,setSingingStyle]=useState('Natural'),[voiceConfirmed,setVoiceConfirmed]=useState(false),[confirmed,setConfirmed]=useState(false),
  [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const ref=useRef(project);ref.current=project;
 if(!anchor||!project||typeof onRegister!=='function')return null;
 const registered=(characters||[]).find(c=>c?.autoSinger13?.sourceProjectId===project.id&&
  c.autoSinger13?.originalAssetId===anchor.sourceAssetId);
 const already=!!registered;
 const eligibleVoices=(voices||[]).filter(v=>['self','owned','licensed'].includes(v.rights)&&
  (v.rights!=='licensed'||String(v.rightsNote||'').trim()));
 const chosenVoice=eligibleVoices.find(v=>v.id===voiceId);
 const modelChoices=(models||[]).filter(m=>m.voiceId===voiceId&&m.engineId!=='sampler'&&m.assetId);
 const linked=registered&&(virtualSingers||[]).some(v=>v.characterId===registered.id&&v.voiceId===voiceId);
 const linkVoice=()=>{
  try{
   if(typeof onRegisterVirtualSinger!=='function')throw Error('기존 가상 가수 저장소 연결이 필요합니다.');
   const profile=prepareAutoSingerVoiceLink26(registered,chosenVoice,{
    name:registered.name,singingStyle,modelId,models,existing:virtualSingers,confirmed:voiceConfirmed
   });
   onRegisterVirtualSinger(profile);
   setVoiceConfirmed(false);
   setMessage('기존 가수 원화와 허가받은 음색을 하나의 가상 가수 프로필로 연결했습니다. 실제 신경망 가창 WAV는 생성하지 않았습니다.');
   notify('Virtual Singer 프로필 저장 완료 · Voice/Character 원본 유지');
  }catch(e){setMessage('가상 가수 Voice 연결 중단: '+e.message);}
 };
 const save=async()=>{
  if(busy||already)return;
  setBusy(true);setMessage('로컬 SD가 실제 생성한 첫 가수 이미지를 복사하는 중…');
  const original=ref.current;
  try{
   const profile=await registerGeneratedSinger13(original,name,{
    confirmed,characters,register:created=>{
     if(ref.current!==original)throw Error('가상 가수 등록 도중 기존 Music+MV 프로젝트가 바뀌었습니다.');
     onRegister(created);
    }
   });
   if(ref.current!==original)throw Error('등록 직후 Music+MV 프로젝트가 변경됐습니다.');
   setMessage('가상 가수 '+profile.name+' 캐릭터 라이브러리 등록 완료. 실제 이미지 사본만 추가했습니다.');
   setConfirmed(false);notify('등록한 AI 가수 이미지를 다른 신규 음악·영상 프로젝트의 캐릭터로 재사용할 수 있습니다.');
  }catch(e){setMessage('가상 가수 등록 중단: '+e.message);}
  finally{setBusy(false);}
 };
 return <Panel title="원본 13·26·58·59항 · 자동 생성 가수를 캐릭터 라이브러리로 등록"
  description="현재 프로젝트의 SD 첫 가수 원화가 실제 생성된 이후에만 활성화됩니다. 기존 음악·영상 파일을 수정하거나 옮기지 않습니다.">
  <Field label="새 가상 가수 이름"><input value={name} maxLength={120} disabled={busy||already} onChange={e=>setName(e.target.value)} placeholder="예: 내 AI 가수"/></Field>
  <label><input type="checkbox" checked={confirmed} disabled={busy||already} onChange={e=>setConfirmed(e.target.checked)}/> 현재 가수 원화의 생성·재사용 권한을 확인했으며 새 캐릭터로 등록하겠습니다.</label>
  <div className="hstack">
   <Button disabled={busy||already||!confirmed||!name.trim()} variant="primary" onClick={save}>{busy?'원본 사본 별도 저장 중…':'실제 생성 가수 캐릭터 라이브러리 등록'}</Button>
  </div>
  {already&&<p>현재 자동 가수의 첫 이미지가 이미 캐릭터 라이브러리에 등록돼 있습니다.</p>}
  {registered&&typeof onRegisterVirtualSinger==='function'&&<div className="mv7-item">
   <strong>원본 25·26항 · 생성 가수 외형에 본인 Voice 연결</strong>
   <Field label="기존 허가 목소리 선택"><select value={voiceId} onChange={e=>{setVoiceId(e.target.value);setModelId('');setVoiceConfirmed(false)}}>
    <option value="">기존 Voice 선택</option>
    {eligibleVoices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
   </select></Field>
   <Field label="등록된 실제 음색 모델 (선택, 샘플 미리보기 제외)"><select value={modelId} disabled={!voiceId} onChange={e=>setModelId(e.target.value)}>
    <option value="">현재 목소리만 연결 · 신경망 모델 미연결</option>
    {modelChoices.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
   </select></Field>
   <Field label="기본 가창 창법"><select value={singingStyle} onChange={e=>setSingingStyle(e.target.value)}>
    {['Natural','Ballad','Soft','Power','Rock','Whisper','Falsetto','Emotional'].map(value=><option key={value}>{value}</option>)}
   </select></Field>
   <label><input type="checkbox" checked={voiceConfirmed} onChange={e=>setVoiceConfirmed(e.target.checked)}/> 이 목소리의 사용 권한을 확인하고 가상 가수와 연결하겠습니다.</label>
   <Button variant="primary" disabled={!chosenVoice||!voiceConfirmed||!!linked} onClick={linkVoice}>{linked?'현재 Voice 연결됨':'실제 Voice + 가상 가수 프로필 저장'}</Button>
   <Notice>이 연결은 이미 등록된 Voice, AI 생성 캐릭터 이미지, 선택한 모델 ID를 그대로 연결합니다. 목소리 모델을 새로 학습하거나 합성하지 않으며 가창 품질·동일 인물 생성 성공을 보증하지 않습니다.</Notice>
  </div>}
  {message&&<p role="status">{message}</p>}
  <Notice>첫 이미지가 새로운 캐릭터 자산에 복사되며 기존 MV의 원본 이미지 ID는 그대로 유지됩니다. 같은 얼굴을 학습한 모델은 자동 생성하지 않습니다. 외형이 항상 일치하도록 생성하려면 별도 등록 캐릭터 참고 이미지와 설치 모델을 사용해야 합니다.</Notice>
 </Panel>;
}
