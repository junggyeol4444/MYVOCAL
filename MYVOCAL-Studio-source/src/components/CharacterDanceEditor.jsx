import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {genreList} from '../lib/genres.js';
import {createDancePlan,validateDancePlan,parseDanceLines,danceLines,danceAt,dancePose,danceReferences,saveDancePlan} from '../lib/characterDanceDirector.js';
const MOVES={groove:'그루브',step:'스텝',bounce:'바운스',sway:'스웨이',wave:'팔 흔들기',pose:'포즈'};
export default function CharacterDanceEditor({character,projects=[],onSave,notify}){
 const existing=(()=>{try{return character.dance88?validateDancePlan(character,character.dance88):null;}catch{return null;}})();
 const linked=projects.filter(p=>p.characterId===character.id||(p.scenes||[]).some(s=>s.characterId===character.id));
 const [projectId,setProjectId]=useState(existing?.projectId||linked[0]?.id||'');
 const [bpm,setBpm]=useState(existing?.bpm||120),[duration,setDuration]=useState(existing?.durationMs/1000||character.stage3d?.duration||8);
 const [genre,setGenre]=useState(existing?.genreMix?.[0]?.name||'Rock');
 const [referenceId,setReferenceId]=useState(existing?.referenceAssetId||'');
 const [base,setBase]=useState(()=>existing||createDancePlan(character));
 const [lines,setLines]=useState(()=>danceLines(base));
 const [time,setTime]=useState(0),[videoUrl,setVideoUrl]=useState(''),[refError,setRefError]=useState('');
 const videoRef=useRef(null);const references=danceReferences(character);
 useEffect(()=>{let gone=false,url='';setVideoUrl('');setRefError('');
  if(referenceId)(async()=>{try{const file=await getFile(referenceId);if(!file)throw Error('로컬 동작 참고 영상 원본 없음');url=URL.createObjectURL(file);if(!gone)setVideoUrl(url);}
   catch(e){if(!gone)setRefError(e.message);}})();
  return ()=>{gone=true;if(url)URL.revokeObjectURL(url);};
 },[referenceId]);
 let plan=null,error='';try{plan=parseDanceLines(character,{...base,referenceAssetId:referenceId},lines);}catch(e){error=e.message;}
 const durationSec=(plan?.durationMs||base.durationMs)/1000,now=plan?danceAt(plan,time):null,pose=plan?dancePose(plan,time):null;
 const seek=n=>{setTime(n);if(videoRef.current&&now?.referenceMs!=null){try{videoRef.current.currentTime=now.referenceMs/1000;}catch{}}};
 const regenerate=()=>{try{const project=projects.find(p=>p.id===projectId)||null;
  const next=createDancePlan(character,project,{bpm:Number(project?.bpm??bpm),durationSec:Number(duration),genreMix:project?(project.genreMix||null):[{name:genre,weight:100}],referenceAssetId:referenceId});
  setBase(next);setLines(danceLines(next));setTime(0);notify('곡 BPM·장르·구간을 바탕으로 춤 큐를 새로 만들었습니다. 저장 전까지 이전 동작은 유지됩니다.');
 }catch(e){notify('춤 큐 생성 실패: '+e.message);}};
 const save=()=>{try{if(!plan)throw Error(error||'춤 계획 오류');onSave(saveDancePlan(character,plan));notify('STEP88 춤 동작 계획 저장 완료 · 기존 VRM/그림/가사 원본 유지');}catch(e){notify('춤 계획 저장 실패: '+e.message);}};
 const exportJson=()=>{try{if(!plan)throw Error(error);downloadText(JSON.stringify({format:'MYVOCAL_STEP88_DANCE_PLAN',characterId:character.id,...plan},null,2),`MYVOCAL-Step88-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,'application/json');}catch(e){notify(e.message);}};
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}>
  <Notice>**STEP88 · AI Dance Director** — MYVOCAL 음악 프로젝트의 BPM·장르 혼합·구간(마디)을 분석해 **비트에 맞춘 동작 큐**를 로컬 규칙으로 구성합니다. STEP83/84의 VRM 본/3D 무대와 STEP82 2D 합성에서 재생·녹화할 수 있습니다. 학습된 춤 AI·영상 자세 추출 모델이 아니며, 해당 본이 없는 모델은 움직이지 않을 수 있습니다.</Notice>
  <div className="form-two"><Field label="연결 음악 프로젝트"><select value={projectId} onChange={e=>{const id=e.target.value;setProjectId(id);const p=projects.find(x=>x.id===id);if(p?.bpm)setBpm(p.bpm);}}><option value="">직접 BPM·장르 입력</option>{projects.map(p=><option value={p.id} key={p.id}>{p.title} ({p.bpm||'?'} BPM)</option>)}</select></Field>
  <Field label="BPM (40~240)"><input type="number" value={projectId?(projects.find(p=>p.id===projectId)?.bpm??bpm):bpm} min="40" max="240" disabled={!!projectId} onChange={e=>setBpm(Number(e.target.value))}/></Field>
  <Field label="장르"><select value={genre} disabled={!!projectId} onChange={e=>setGenre(e.target.value)}>{genreList.map(s=><option key={s} value={s}>{s}</option>)}</select></Field>
  <Field label="연출 영상 길이 (2~30초)"><input type="number" min="2" max="30" value={duration} step="1" onChange={e=>setDuration(Number(e.target.value))}/></Field></div>
  <Field label="권한이 있는 Motion Reference 영상 (선택)"><select value={referenceId} onChange={e=>setReferenceId(e.target.value)}><option value="">사용하지 않음</option>{references.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  {refError&&<p role="alert">참고 영상 오류: {refError}</p>}
  {videoUrl&&<video ref={videoRef} controls preload="metadata" playsInline src={videoUrl} style={{width:'min(100%,420px)',maxHeight:230}} aria-label="원본 동작 참고 영상"/>}
  <p><Button onClick={regenerate}>현재 음악 설정으로 동작 큐 생성</Button></p>
  <p>동작: {Object.entries(MOVES).map(([a,b])=>`${a}=${b}`).join(' · ')}</p>
  <Field label="춤 큐 편집: 시작초,종료초,동작,강도(0~1),참고영상 시작초(선택)"><textarea rows={11} spellCheck={false} value={lines} onChange={e=>setLines(e.target.value)}/></Field>
  {error?<p role="alert">동작 큐 오류: {error}</p>:<><p>{plan.cues.length}개 마디별 동작 · {plan.bpm} BPM · {durationSec.toFixed(1)}초 · {plan.sections.length}개 구간</p>
   <Field label="춤 타임라인"><input aria-label="88단계 춤 프레임 탐색" type="range" min="0" max={durationSec} step="0.02" value={Math.min(time,durationSec)} onChange={e=>{const t=Number(e.target.value);setTime(t);const state=danceAt(plan,t);if(state?.referenceMs!=null&&videoRef.current)videoRef.current.currentTime=state.referenceMs/1000;}} style={{width:'100%'}}/></Field>
   <p aria-live="polite">{time.toFixed(2)}초 · {now?`${now.section} / ${MOVES[now.move]} / 강도 ${Math.round(now.strength*100)}% / 박 ${now.beat.toFixed(2)}`:'동작 없음'} {pose?.referenceMs!=null?`· 참고 영상 ${ (pose.referenceMs/1000).toFixed(2)}초`:''}</p>
  </>}
  <div className="modal-actions"><Button disabled={!!error} onClick={exportJson}>춤 타임라인 JSON</Button><Button variant="primary" disabled={!!error} onClick={save}>춤 연출 저장</Button></div>
  <Notice>참고 영상은 **원본 영상을 보며 사람이 동작 종류와 해당 시작초를 입력하는 방식**입니다. 시작초를 입력한 큐는 그 시점의 참조 구간과 시간상 연결되며, 수동으로 선택한 동작만 캐릭터에 적용됩니다. 자동 사람 동작 추출·전신 모션 캡처·영상 합성은 구현하지 않았습니다. 모션은 **동작이 호환되는 VRM 휴머노이드 본** 또는 2D 이미지 영역 근사로 보여 줍니다. 3D 공연 출력은 기존의 무음 WebM입니다.</Notice>
 </div>;
}
