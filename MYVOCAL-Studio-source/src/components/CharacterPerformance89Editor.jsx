import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {danceReferences} from '../lib/characterDanceDirector.js';
import {createPerformance89,extractInstrumentEvents,validatePerformance89,savePerformance89,grayscaleFrame,motionEnergy,performanceAt,performanceFrameLines,parsePerformanceFrameLines} from '../lib/characterPerformance89.js';
const safeName=s=>String(s||'character').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
export default function CharacterPerformance89Editor({character,projects=[],onSave,notify}){
 const available=projects.filter(p=>p.characterId===character.id||(p.scenes||[]).some(s=>s.characterId===character.id));
 const previous=(()=>{try{return character.performance89?validatePerformance89(character,character.performance89):null;}catch{return null;}})();
 const [projectId,setProjectId]=useState(previous?.projectId||available[0]?.id||'');
 const [source,setSource]=useState(previous?.source||'manual');
 const [referenceId,setReferenceId]=useState(previous?.referenceAssetId||'');
 const [duration,setDuration]=useState(previous?.durationMs/1000||8);
 const [plan,setPlan]=useState(()=>previous||createPerformance89(character));
 const [status,setStatus]=useState('연주 큐 생성 또는 움직임 기록을 선택하세요.');
 const [frameText,setFrameText]=useState(()=>performanceFrameLines(previous));
 const mountedRef=useRef(true);
 const [recording,setRecording]=useState(false),[time,setTime]=useState(0),[url,setUrl]=useState('');
 const videoRef=useRef(null),cameraRef=useRef(null),rafRef=useRef(0),activeRef=useRef(false),liveRef=useRef(false),grayRef=useRef(null),framesRef=useRef([]),startedRef=useRef(0);
 const durationMs=Math.round(Number(duration)*1000),project=projects.find(p=>p.id===projectId)||null;
 const references=danceReferences(character);
 const closeCamera=()=>{const stream=cameraRef.current;cameraRef.current=null;stream?.getTracks().forEach(t=>t.stop());};
 const stopCapture=()=>{activeRef.current=false;cancelAnimationFrame(rafRef.current);liveRef.current=false;setRecording(false);};
 useEffect(()=>{let cancelled=false,objectUrl='';setUrl('');if(source==='reference'&&referenceId)(async()=>{
  try{const blob=await getFile(referenceId);if(!blob)throw Error('참고 영상 원본 없음');objectUrl=URL.createObjectURL(blob);if(!cancelled)setUrl(objectUrl);}catch(e){if(!cancelled)setStatus(e.message);}
 })();return ()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[source,referenceId]);
 useEffect(()=>{mountedRef.current=true;return ()=>{mountedRef.current=false;activeRef.current=false;cancelAnimationFrame(rafRef.current);closeCamera();};},[]);
 const changeSource=value=>{stopCapture();closeCamera();if(videoRef.current)videoRef.current.srcObject=null;setSource(value);setFrameText('');setPlan(p=>({...p,source:value,referenceAssetId:value==='reference'?referenceId:'',frames:[]}));setStatus('움직임 기록을 새로 설정했습니다.');};
 const selectReference=id=>{stopCapture();setReferenceId(id);setFrameText('');setPlan(p=>({...p,source:'reference',referenceAssetId:id,frames:[]}));};
 const webcam=async()=>{try{stopCapture();closeCamera();if(!navigator.mediaDevices?.getUserMedia)throw Error('브라우저의 카메라 권한 API를 사용할 수 없습니다.');
  const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});if(!mountedRef.current){stream.getTracks().forEach(t=>t.stop());return;}cameraRef.current=stream;
  const v=videoRef.current;if(!v){closeCamera();return;}v.srcObject=stream;await v.play();setStatus('카메라 연결됨. 영상은 전송·저장되지 않으며 움직임 수치만 기록됩니다.');
 }catch(e){closeCamera();setStatus('카메라 연결 실패: '+e.message);}};
 const capture=async()=>{try{
  const v=videoRef.current;if(!v||v.readyState<2)throw Error('재생 중인 웹캠 또는 참고 영상이 필요합니다.');
  if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>30000)throw Error('녹화 시간은 1~30초');
  if(source==='reference'&&!referenceId)throw Error('권한 있는 참고 영상을 선택하세요.');
  if(source==='manual')throw Error('먼저 영상 입력을 선택하세요.');
  stopCapture();grayRef.current=null;framesRef.current=[];setRecording(true);activeRef.current=true;
  if(source==='reference'){v.currentTime=0;await v.play();}
  const canvas=document.createElement('canvas');canvas.width=60;canvas.height=36;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('로컬 Canvas 처리 불가');
  startedRef.current=performance.now();let last=-100;
  const step=()=>{if(!activeRef.current)return;const ms=Math.round(performance.now()-startedRef.current);
   if(ms-last>=100&&v.readyState>=2){
    ctx.drawImage(v,0,0,60,36);const pixels=ctx.getImageData(0,0,60,36);
    const gray=grayscaleFrame(pixels.data,60,36),energy=grayRef.current?motionEnergy(grayRef.current,gray,60,36):{left:0,center:0,right:0};
    framesRef.current.push({ms:Math.min(durationMs,ms),...energy});grayRef.current=gray;last=ms;
    if(framesRef.current.length>450){stopCapture();setStatus('프레임 개수 제한 초과');return;}
   }
   if(ms>=durationMs||source==='reference'&&v.ended){stopCapture();const frames=framesRef.current;
    setPlan(p=>({...p,source,referenceAssetId:source==='reference'?referenceId:'',durationMs,frames:frames.filter((f,i)=>!i||f.ms>frames[i-1].ms)}));setFrameText(performanceFrameLines({frames:frames.filter((f,i)=>!i||f.ms>frames[i-1].ms)}));
    setStatus(`프레임 ${frames.length}개에서 좌·중·우 화면 움직임을 분석했습니다. 원본 영상·얼굴·관절 좌표는 저장하지 않습니다.`);
    if(source==='reference')v.pause();return;
   }
   rafRef.current=requestAnimationFrame(step);
  };rafRef.current=requestAnimationFrame(step);
 }catch(e){stopCapture();setStatus('연기 기록 실패: '+e.message);}};
 const rebuild=()=>{try{stopCapture();const next=createPerformance89(character,project,{durationSec:Number(duration),source,referenceAssetId:source==='reference'?referenceId:''});
  const kept=plan.source===source&&plan.referenceAssetId===next.referenceAssetId?plan.frames.filter(f=>f.ms<=next.durationMs):[];setPlan({...next,frames:kept});setFrameText(performanceFrameLines({frames:kept}));setStatus(`MIDI 연주 큐 ${next.instruments.length}개 생성됨 · 저장 전 이전 계획 유지`);
 }catch(e){notify('연주 큐 생성 실패: '+e.message);}};
 const applyFrames=()=>{try{const next=parsePerformanceFrameLines(character,{...plan,source,referenceAssetId:source==='reference'?referenceId:'',durationMs},frameText);setPlan(next);setStatus(`움직임 프레임 ${next.frames.length}개를 검토·적용했습니다.`);}catch(e){notify('움직임 프레임 편집 오류: '+e.message);}};
 const save=()=>{try{if(source!=='manual'&&!plan.frames.length)throw Error('선택한 영상에서 움직임을 기록한 뒤 저장하세요.');if(recording)throw Error('움직임 기록이 끝난 뒤 저장하세요.');const next={...plan,projectId,source,referenceAssetId:source==='reference'?referenceId:'',durationMs,frames:plan.frames.filter(f=>f.ms<=durationMs),instruments:project?extractInstrumentEvents(project,durationMs):[]};onSave(savePerformance89(character,next));notify('89단계 연기·악기 연주 연결을 로컬에 저장했습니다.');}catch(e){notify('저장 실패: '+e.message);}};
 const exportPlan=()=>{try{const next=validatePerformance89(character,{...plan,projectId,source,referenceAssetId:source==='reference'?referenceId:'',durationMs,frames:plan.frames.filter(f=>f.ms<=durationMs),instruments:project?extractInstrumentEvents(project,durationMs):[]});downloadText(JSON.stringify({format:'MYVOCAL_PERFORMANCE89',characterId:character.id,...next},null,2),`MYVOCAL-Step89-${safeName(character.id)}.json`,'application/json');}catch(e){notify(e.message);}};
 const seek=Number(time),now=performanceAt(plan,seek)||{};
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}>
  <Notice>**STEP89 — 직접 연기 및 악기 연주 연결.** 사용자가 허용한 웹캠/참고 영상에서 좌·중·우의 프레임 간 움직임 크기를 로컬 분석하고, 음악 프로젝트의 MIDI 음표 시작/종료와 캐릭터의 팔·몸 움직임을 동기화합니다. **관절/얼굴 인식 또는 원본 동작의 정확한 모션캡처가 아닙니다.**</Notice>
  <Field label="연결 음악 프로젝트"><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">연주 트랙 없음</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title} ({p.bpm} BPM)</option>)}</select></Field>
  <Field label="연기 길이 (1~30초)"><input type="number" min="1" max="30" step="1" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></Field>
  <Field label="영상 입력 방식"><select value={source} onChange={e=>changeSource(e.target.value)}><option value="manual">영상 없이 MIDI 연주만</option><option value="webcam">웹캠 직접 연기 (로컬)</option><option value="reference">등록된 동작 참고 영상</option></select></Field>
  {source==='reference'&&<Field label="권한 있는 동작 참고 영상"><select value={referenceId} onChange={e=>selectReference(e.target.value)}><option value="">선택</option>{references.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
  {source!=='manual'&&<><video ref={videoRef} src={source==='reference'?url:undefined} muted playsInline controls={source==='reference'} aria-label="STEP89 로컬 움직임 입력" style={{display:'block',width:'min(100%,380px)',maxHeight:220,background:'#101019'}}/>
   <div className="look-actions">{source==='webcam'&&<Button onClick={webcam} disabled={recording}>카메라 사용 허용</Button>}{source==='webcam'&&<Button onClick={()=>{stopCapture();closeCamera();if(videoRef.current)videoRef.current.srcObject=null;setStatus('카메라 사용 종료');}}>카메라 끄기</Button>}
    <Button disabled={recording} onClick={capture}>움직임 기록 시작</Button><Button disabled={!recording} onClick={()=>{stopCapture();setStatus('기록 취소 · 기존에 저장한 연기 계획 유지');}}>기록 취소</Button></div>
  </>}
  <p role="status">{status}</p>
  <p><Button disabled={recording} onClick={rebuild}>연결된 MIDI로 연주 타임라인 생성</Button></p>
  <p>움직임 프레임: {plan.frames.length}개 · 악기 MIDI 큐: {plan.instruments.length}개 (Guitar, Piano, Drum, Bass, Strings, Synth)</p>
  <Field label="움직임 수치 수동 보정: 초,왼쪽,중앙,오른쪽 (0~1)"><textarea rows={5} spellCheck={false} value={frameText} onChange={e=>setFrameText(e.target.value)}/></Field><Button disabled={recording} onClick={applyFrames}>수동 보정 프레임 적용</Button>
  <Field label="연기·연주 프레임 탐색"><input type="range" min="0" max={duration||8} step="0.02" value={time} onChange={e=>setTime(Number(e.target.value))} style={{width:'100%'}}/></Field>
  <p aria-live="polite">{seek.toFixed(2)}초 · 좌 {Math.round((now.left||0)*100)}% / 중앙 {Math.round((now.center||0)*100)}% / 우 {Math.round((now.right||0)*100)}% · 연주 음표 {now.activeNotes||0}개</p>
  <div className="modal-actions"><Button disabled={recording} onClick={exportPlan}>연기·연주 JSON</Button><Button variant="primary" disabled={recording} onClick={save}>STEP89 설정 저장</Button></div>
  <Notice>웹캠은 사용자 클릭 후 브라우저 권한을 받고, 화면 종료 시 스트림을 해제합니다. 영상을 외부로 보내거나 원본 프레임을 저장하지 않습니다. 녹화 시 **프레임 간 화면 밝기 변화**만 기록하므로 카메라 흔들림·조명 변화도 움직임으로 인식할 수 있습니다. 3D는 호환 VRM 본, 2D는 검토된 영역에 한해 근사 애니메이션으로 표현합니다. 실제 손가락 악기 연주나 자세 추정/모션 캡처 AI는 아닙니다.</Notice>
 </div>;
}
