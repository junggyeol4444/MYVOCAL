import React,{useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {registerGeneratedSinger13} from '../lib/autoSingerLibrary13.js';
// 원본 13·26·58·59항: 기존 Windows MV 화면에서 AI 첫 가수 이미지 재사용 등록.
// 사용자의 체크/버튼 없이는 어떠한 캐릭터나 원본도 생성·수정하지 않는다.
export default function AutoSingerRegisterPanel({project,characters=[],onRegister,notify}){
 const anchor=project?.autoVirtualSingerImageV1;
 const [name,setName]=useState(''),[confirmed,setConfirmed]=useState(false),
  [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const ref=useRef(project);ref.current=project;
 if(!anchor||!project||typeof onRegister!=='function')return null;
 const already=(characters||[]).some(c=>c?.autoSinger13?.sourceProjectId===project.id&&
  c.autoSinger13?.originalAssetId===anchor.sourceAssetId);
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
  {message&&<p role="status">{message}</p>}
  <Notice>첫 이미지가 새로운 캐릭터 자산에 복사되며 기존 MV의 원본 이미지 ID는 그대로 유지됩니다. 같은 얼굴을 학습한 모델은 자동 생성하지 않습니다. 외형이 항상 일치하도록 생성하려면 별도 등록 캐릭터 참고 이미지와 설치 모델을 사용해야 합니다.</Notice>
 </Panel>;
}
