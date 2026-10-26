import React,{useState} from 'react';
import {Button,Empty,Field,Icon,Modal,Notice,SectionHead,Status} from '../components/UI';
import {genId,now} from '../lib/schema';
import {resolveVirtualSingerProfile} from '../lib/virtualSingerProjectBinding.js';
const tabs=[['voices','Voices','mic'],['voiceModels','Voice Models','wave'],['characters','Characters','user'],['virtualSingers','Virtual Singers','spark'],['musicStyles','Music Styles','music'],['videoStyles','Video Styles','video']];
export default function Library({data,add,remove,notify,navigate}){
 const [tab,setTab]=useState('virtualSingers'),[open,setOpen]=useState(false),[name,setName]=useState(''),[voiceId,setVoiceId]=useState(''),[characterId,setCharacterId]=useState(''),[style,setStyle]=useState('Anime Rock'),[modelId,setModelId]=useState('');
 const items=data[tab]||[];
 const newProfile=e=>{
  e?.preventDefault?.();
  try{
   const clean=String(name||'').trim();
   if(!clean||clean.length>120)throw Error('프로필 이름은 1~120자여야 합니다.');
   if(tab==='virtualSingers'){
    const draft={id:genId('profile'),name:clean,voiceId,characterId,style,
     modelId,createdAt:now()};
    // Reject unlicensed persons, missing components, another singer's model
    // and sampler preview before the project ever links to the profile.
    resolveVirtualSingerProfile(draft.id,{...data,
      virtualSingers:[...(data.virtualSingers||[]),draft]});
    if((data.virtualSingers||[]).some(s=>s.voiceId===voiceId&&s.characterId===characterId&&s.modelId===modelId))
     throw Error('같은 목소리·캐릭터·모델 조합의 가상 가수가 이미 있습니다.');
    add(tab,draft);
   }else add(tab,{id:genId('profile'),name:clean,voiceId,characterId,
     style,createdAt:now()});
   notify('원본 자산을 변경하지 않고 프로필을 저장했습니다.');
   setOpen(false);setName('');
  }catch(error){notify('가상 가수 연결 실패: '+error.message);}
 };
 const openCreate=()=>{setName('');setVoiceId('');setCharacterId('');setModelId('');setStyle('Anime Rock');setOpen(true);};
 return <><SectionHead eyebrow="YOUR CREATIVE ASSETS" title="MYVOCAL Library" description="목소리, 캐릭터, 가상 가수, 음악·영상 스타일을 독립 자산으로 보관합니다."/><div className="library-tabs">{tabs.map(([key,label,icon])=><button className={tab===key?'selected':''} onClick={()=>setTab(key)} key={key}><Icon name={icon} size={17}/>{label}<span>{data[key].length}</span></button>)}</div><div className="panel library-panel"><div className="panel-top"><div><h3>{tabs.find(t=>t[0]===tab)[1]}</h3><p>{tab==='virtualSingers'?'목소리와 캐릭터를 연결해 하나의 가상 가수 프로필로 관리합니다.':'프로젝트에서 반복해서 사용할 수 있는 자산입니다.'}</p></div>{['voices','characters','voiceModels'].includes(tab)?<Button icon="arrow" onClick={()=>navigate(tab==='voiceModels'?'training':tab)}>스튜디오에서 등록</Button>:<Button variant="primary" icon="plus" onClick={openCreate}>프로필 만들기</Button>}</div>
 {items.length?<div className="library-items">{items.map(item=><div className="library-item" key={item.id}><span className="library-item-icon"><Icon name={tabs.find(t=>t[0]===tab)[2]} size={20}/></span><div><strong>{item.name}</strong><small>{tab==='virtualSingers'?`${data.voices.find(v=>v.id===item.voiceId)?.name||'목소리 미연결'} / ${data.characters.find(c=>c.id===item.characterId)?.name||'캐릭터 미연결'} / ${item.modelId?(data.voiceModels||[]).find(m=>m.id===item.modelId)?.name||'체크포인트 파일 없음':'모델 미연결'}`:tab==='voiceModels'?(item.engineId==='sampler'?'샘플 기반 보컬 미리보기 모델 · AI 학습 아님':'외부 체크포인트 보관됨 · 합성 미연결'):item.style||item.description||'등록된 자산'}</small></div>{tab==='voiceModels'?<button className="icon-btn" title="학습 관리자에서 원본 관리" onClick={()=>navigate('training')}><Icon name="arrow" size={17}/></button>:<button className="icon-btn danger" title="삭제" onClick={()=>{if(confirm('이 항목을 삭제하시겠습니까?'))remove(tab,item.id)}}><Icon name="trash" size={17}/></button>}</div>)}</div>:<Empty icon="layers" title="이 라이브러리는 비어 있습니다" description="새 프로필을 만들거나 각 스튜디오에서 자산을 등록하세요." action={<Button variant="primary" icon="plus" onClick={()=>['voices','characters','voiceModels'].includes(tab)?navigate(tab==='voiceModels'?'training':tab):openCreate()}>자산 추가</Button>}/>}</div>
 <Notice>Virtual Singer는 본인·허가 Voice와 캐릭터, 등록된 실제 DiffSinger/RVC 모델, Singing Style을 재사용하도록 연결합니다. 완성한 가창의 생성 여부는 제작 단계에서 별도로 기록하며 연결만으로 음질이나 렌더링 성공을 표시하지 않습니다. AI Song+MV 화면에서 같은 가수를 다시 선택할 수 있습니다.</Notice>
 {open&&<Modal title="라이브러리 프로필 만들기" onClose={()=>setOpen(false)}><form className="modal-form" onSubmit={newProfile}><Field label="프로필 이름"><input autoFocus required value={name} onChange={e=>setName(e.target.value)} placeholder="예: LUNA"/></Field>{tab==='virtualSingers'&&<><Field label="Voice"><select value={voiceId} onChange={e=>{setVoiceId(e.target.value);setModelId('')}}><option value="">목소리 선택 안 함</option>{data.voices.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></Field><Field label="로컬 Voice Model (DiffSinger · RVC · 직접 등록한 실제 모델)"><select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">모델 선택 안 함</option>{(data.voiceModels||[]).filter(m=>m.voiceId===voiceId).map(m=><option key={m.id} value={m.id}>{m.name} · {m.engineId==='sampler'?'샘플 미리보기 전용':m.engineId==='diffsinger'?'DiffSinger 신경망 (사전 연결 확인)':'등록된 외부·로컬 모델'}</option>)}</select></Field><Field label="Character"><select value={characterId} onChange={e=>setCharacterId(e.target.value)}><option value="">캐릭터 선택 안 함</option>{data.characters.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></Field></>}<Field label="기본 스타일"><input value={style} onChange={e=>setStyle(e.target.value)} placeholder="예: Anime Rock"/></Field><div className="modal-actions"><Button onClick={()=>setOpen(false)}>취소</Button><Button variant="primary" icon="plus" onClick={newProfile}>저장</Button></div></form></Modal>}</>;
}
