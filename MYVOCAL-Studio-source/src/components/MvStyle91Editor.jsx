import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {sampleStyleFrame91,analyzeMvStyle91,saveMvStyle91} from '../lib/mvStyleLearning91.js';
export default function MvStyle91Editor({entry,onSave,notify}){
 const [status,setStatus]=useState('권한 있는 MP4/WebM 영상 원본을 분석합니다.'),[progress,setProgress]=useState(0),[threshold,setThreshold]=useState(45),[profile,setProfile]=useState(entry.mvStyle91||null),[name,setName]=useState(entry.mvStyle91?.name||entry.name),[notes,setNotes]=useState(entry.mvStyle91?.notes||'');
 const [running,setRunning]=useState(false),stopped=useRef(false);
 useEffect(()=>()=>{stopped.current=true;},[]);
 const analyze=async()=>{let url='',video=null;setRunning(true);stopped.current=false;try{
  if(!['owned','self','licensed'].includes(entry.rights)||(entry.rights==='licensed'&&!entry.rightsNote?.trim()))throw Error('분석 및 프로필 제작 권한이 확인되지 않았습니다.');
  const blob=await getFile(entry.assetId);if(!blob||!['video/mp4','video/webm'].includes(blob.type)||blob.size>40*1024*1024)throw Error('로컬 MP4/WebM 파일(40MB 이하)이 필요합니다.');
  url=URL.createObjectURL(blob);video=document.createElement('video');video.src=url;video.muted=true;video.preload='auto';video.playsInline=true;
  await new Promise((ok,bad)=>{video.onloadedmetadata=ok;video.onerror=()=>bad(Error('영상 메타데이터 디코딩 실패'));});
  const duration=video.duration;if(!Number.isFinite(duration)||duration<=0||duration>300)throw Error('최대 5분 길이의 영상만 분석합니다.');
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas 접근 불가');
  const count=Math.max(2,Math.min(240,Math.floor(duration*2)+1)),frames=[];
  for(let i=0;i<count;i++){
   if(stopped.current)throw Error('영상 스타일 분석 취소됨');
   const t=Math.min(Math.max(0,duration-.01),i*duration/Math.max(1,count-1));
   await new Promise((ok,bad)=>{if(Math.abs(video.currentTime-t)<.01&&video.readyState>=2){ok();return;}video.onseeked=ok;video.onerror=()=>bad(Error('영상 탐색 실패'));video.currentTime=t;});
   ctx.drawImage(video,0,0,48,32);frames.push(sampleStyleFrame91(ctx.getImageData(0,0,48,32).data,48,32,t));setProgress(Math.round((i+1)/count*100));
  }
  const result=analyzeMvStyle91(frames,duration,Number(threshold));setProfile(result);setStatus(`샘플 ${count}개 · 장면 전환 추정 ${result.estimatedCutsSec.length}개 · 자동 신경망 학습 없음`);
 }catch(e){setStatus('분석 실패: '+e.message);}finally{video?.pause();if(url)URL.revokeObjectURL(url);setRunning(false);}};
 const save=()=>{try{if(!profile)throw Error('영상 분석을 먼저 완료하세요.');onSave(saveMvStyle91(entry,profile,{name,notes}));notify('STEP91 로컬 MV 스타일 프로필을 저장했습니다.');}catch(e){notify('저장 실패: '+e.message);}};
 return <div className="modal-form" style={{maxHeight:'75vh',overflowY:'auto'}}><Notice>**STEP91** · 등록한 권한 보유 MP4/WebM을 로컬 디코딩하여 색상·밝기·명암·화면 변화·컷 간격을 추정합니다. 네트워크로 파일을 보내거나 외부 AI를 호출하지 않습니다. AI 신경망 학습, 의미론적 카메라/타이포그래피 인식은 제공하지 않습니다.</Notice>
 <Field label="프로필 이름"><input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></Field>
 <Field label="컷 변화 임계값 (10~120)"><input type="range" min="10" max="120" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/>{threshold}</Field>
 <div className="look-actions"><Button disabled={running} onClick={analyze}>등록 영상 로컬 분석</Button>{running&&<Button onClick={()=>{stopped.current=true;}}>중단</Button>}<span>{progress}%</span></div><p role="status">{status}</p>
 {profile&&<><p>대표 RGB: {profile.averageColor.join(' / ')} · 밝기 {profile.averageBrightness} · 대비 {profile.averageContrast} · 화면 변화 {profile.averageFrameDifference} · 컷 {profile.estimatedCutsSec.length}회 · 평균 컷 길이 {profile.estimatedShotSeconds}초</p><Field label="스타일 메모 (사용자 수동 입력)"><textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} rows={3}/></Field><Button onClick={()=>downloadText(JSON.stringify({format:'MYVOCAL_MV_STYLE91',...profile},null,2),'MYVOCAL-Step91-MV-style.json','application/json')}>분석 JSON 저장</Button><Button variant="primary" onClick={save}>스타일 프로필 저장</Button></>}
 <Notice>컷은 샘플 간 화면 차이가 클 때 추정되며, 실제 컷 위치와 다를 수 있습니다. 스타일 프로필은 MV 생성 모델을 미세조정한 체크포인트가 아니라 로컬 분석 수치입니다.</Notice></div>;
}
