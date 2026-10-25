import React,{useEffect,useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {previewCreativeDirection96,applyCreativeDirection96,directorCapabilities96} from '../lib/creativeDirector96.js';
import {getInstalledLocalModels} from '../lib/localAiComposer.js';
import {proposeLocalCreativeEdit61} from '../lib/localCreativeDirector61.js';
export default function CreativeDirector96({project,data,onChange,notify,onOpenVideo}){
 const [command,setCommand]=useState(''),[plan,setPlan]=useState(null),[error,setError]=useState(''),[editedSceneId,setEditedSceneId]=useState('');
 const [localModels,setLocalModels]=useState([]),[localModel,setLocalModel]=useState(''),[localBusy,setLocalBusy]=useState(false);
 const [localProposal,setLocalProposal]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 const loadLocalModels=async()=>{
  if(localBusy)return;setLocalBusy(true);setError('');
  try{
   const available=await getInstalledLocalModels();
   setLocalModels(available);
   setLocalModel(m=>available.includes(m)?m:available[0]||'');
   if(!available.length)throw Error('설치된 로컬 Ollama 모델이 없습니다. 임의의 모델을 선택하거나 대체하지 않습니다.');
  }catch(e){setError(e.message);}finally{setLocalBusy(false);}
 };
 const requestLocalSuggestion=async()=>{
  if(localBusy)return;
  const original=latest.current,controller=new AbortController();active.current=controller;
  setLocalBusy(true);setError('');setLocalProposal('');setPlan(null);
  try{
   const response=await proposeLocalCreativeEdit61(original,command,localModel,data,{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==original)throw Error('AI 제안 중 기존 프로젝트가 변경되어 취소했습니다.');
   setCommand(response.command);
   setLocalProposal('설치된 '+localModel+' 모델의 제안: '+response.explanation+
    ' · 기존 Music/Video 명령으로 변환됐습니다. 아래 미리 검토 후 적용 버튼을 눌러야 프로젝트가 변경됩니다.');
  }catch(e){setError('실제 로컬 AI 감독: '+e.message);}
  finally{active.current=null;setLocalBusy(false);}
 };
 const inspect=()=>{try{setPlan(previewCreativeDirection96(project,command,data));setError('');}catch(e){setPlan(null);setError(e.message);}};
 const apply=()=>{try{
  const changed=applyCreativeDirection96(project,plan,data);
  const videoAction=plan?.action?.domain==='both'?plan.actions.find(a=>a.domain==='video'):
   plan?.action?.domain==='video'?plan.action:null;
  onChange(changed);setEditedSceneId(videoAction?.sceneId||'');setLocalProposal('');
  setPlan(null);setCommand('');setError('');
  notify('로컬 프로젝트 변경 완료 · 이전 미디어 자산 보존');
 }catch(e){setPlan(null);setError(e.message);}};
 const caps=directorCapabilities96();
 return <Panel title="STEP96 · Creative Director" description="Music Director와 Video Director의 실제 프로젝트 타임라인 변경을 검토 후 적용합니다. 외부 AI 호출 없음.">
  <label>로컬 명령 · 음악과 영상을 함께 편집<textarea rows={3} value={command} onChange={e=>{setCommand(e.target.value);setPlan(null);}} placeholder="내 캐릭터 LUNA를 사용하고 내 목소리로 노래하게 해. 처음에는 방 안에서 혼자 노래하고, 후렴부터 밤거리로 나가게 해. 마지막 후렴에서는 밴드와 같이 무대에서 노래하게 해줘."/></label>
  <p className="muted">음악: {caps.music.join(', ')} · 영상: {caps.video.join(', ')}</p>
  <div className="mv7-item">
   <strong>원본 61·62항 · 사용자 PC의 실제 Ollama로 자유 한국어 편집 지시 제안</strong>
   <div className="hstack">
    <Button disabled={localBusy} onClick={loadLocalModels}>설치된 로컬 AI 모델 조회</Button>
    <select aria-label="기존 설치 로컬 감독 모델" value={localModel} disabled={localBusy||!localModels.length} onChange={e=>setLocalModel(e.target.value)}>
     <option value="">모델 선택</option>
     {localModels.map(name=><option value={name} key={name}>{name}</option>)}
    </select>
    <Button variant="primary" disabled={localBusy||!localModel||!command.trim()} onClick={requestLocalSuggestion}>{localBusy?'모델 명령 제안 중…':'현재 한국어 지시를 기존 편집 명령으로 제안'}</Button>
    {localBusy&&<Button onClick={()=>active.current?.abort()}>제안 취소</Button>}
   </div>
   {localProposal&&<p role="status">{localProposal}</p>}
   <Notice>Ollama는 Windows 로컬에서 설치된 모델만 사용합니다. 프로젝트에 바로 적용하지 않고 기존 편집 문법으로 바꾼 제안만 보여 줍니다. 아래 '변경 미리 검토'와 '검토한 변경 적용'을 사용자가 직접 실행해야 저장됩니다. 영상 파일이나 가창 WAV가 생성된 것으로 표시하지 않습니다.</Notice>
  </div>
  <div className="hstack"><Button onClick={inspect}>변경 미리 검토</Button>{plan&&<Button variant="primary" onClick={apply}>검토한 변경 적용</Button>}</div>
  {editedSceneId&&typeof onOpenVideo==='function'&&<Button onClick={()=>onOpenVideo(editedSceneId)}>수정한 장면의 실제 SD/SVD 영상 제작 화면 열기</Button>}
  {plan&&<p role="status">변경 내용: {plan.summary} · {plan.action.domain==='both'?'Music + Video Director':plan.action.domain==='music'?'Music Director':'Video Director'}</p>}
  {error&&<p role="alert">{error}</p>}
  <Notice>원본 62항: 등록된 허가 캐릭터와 본인 Voice가 하나씩 확정되면, 원곡 구간을 이용한 실내→후렴 밤거리→마지막 후렴 밴드 무대 장면과 프로젝트 보컬 선택을 함께 저장합니다. 변경된 장면의 실제 신경망 WAV·SD/SVD 영상 생성은 기존 제작 화면에서 실행하며 생성된 것으로 표시하지 않습니다.</Notice>
  <Notice>지원하지 않는 명령은 거부합니다. 신경망 WAV 음량·음소거는 실제 재생·믹스 트랙에 반영됩니다. 구간별 MIDI 쉼표·복원·강약·길이·음높이는 MIDI 음표만 편집하며 기존 WAV를 재생성하지 않습니다. 장면 번호 또는 정확한 제목으로 특정 영상 타임라인을 선택하고, 장면의 시작·종료 시간을 겹치지 않게 수정할 수 있으며, '그리고'로 음악과 영상 명령을 연결하면 검토 후 프로젝트를 한 번에 저장합니다. 영상 픽셀을 다시 만들려면 기존 Video Studio의 실제 SD/SVD 재생성 기능을 사용해야 합니다. 원본 오디오를 덮어쓰지 않습니다. 실제 생성 AI·가창 AI를 호출하지 않습니다.</Notice>
 </Panel>;
}
