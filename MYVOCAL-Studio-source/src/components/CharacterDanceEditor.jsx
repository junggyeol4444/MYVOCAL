import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile,putFileNew,removeFile} from '../lib/assetDb.js';
import {genId} from '../lib/schema.js';
import {MAX_CHARACTER_ASSETS,validateCharacterFile,validateCharacterAssetRole} from '../lib/characterIdentity.js';
import {recordWebcamMotion32} from '../lib/webcamMotionRecording32.js';
import {recordAndApplyWebcamPose32} from '../lib/webcamToVrmMotion32.js';
import {downloadText} from '../lib/store.js';
import {genreList} from '../lib/genres.js';
import {createDancePlan,validateDancePlan,parseDanceLines,danceLines,danceAt,dancePose,danceReferences,saveDancePlan} from '../lib/characterDanceDirector.js';
import {extractMotionCapture31,makeMotionCapture31} from '../lib/motionReferencePose31.js';
import {savedRhythmSources,createMusicReactiveDance30} from '../lib/musicReactiveDance30.js';
const MOVES={groove:'그루브',step:'스텝',bounce:'바운스',sway:'스웨이',wave:'팔 흔들기',pose:'포즈'};
export default function CharacterDanceEditor({character,projects=[],onSave,notify}){
 const latestCharacter=useRef(character);latestCharacter.current=character;
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
 const [posePython,setPosePython]=useState(''),[poseModel,setPoseModel]=useState('');
 const [poseRights,setPoseRights]=useState(false),[poseRunning,setPoseRunning]=useState(false);
 const [poseStatus,setPoseStatus]=useState('설치된 MediaPipe Task .task 모델 선택 필요');
 const [poseDraft,setPoseDraft]=useState(null);
 const poseAbort=useRef(null);
 const [pcmDuration,setPcmDuration]=useState(180);
 const [pcmRhythm,setPcmRhythm]=useState(''),[pcmBusy,setPcmBusy]=useState(false);
 const [pcmStatus,setPcmStatus]=useState('실제 독립 드럼 WAV를 선택하면 오디오 강약으로 춤 큐를 생성합니다.');
 const pcmAbort=useRef(null);
 useEffect(()=>()=>pcmAbort.current?.abort(),[]);
 const chosenProject=projects.find(p=>p.id===projectId);
 const rhythmTracks=savedRhythmSources(chosenProject);
 const generateAudioDance=async()=>{
  if(pcmBusy||poseRunning||cameraBusy)return;
  const source=chosenProject;
  if(!source){setPcmStatus('먼저 실제 음악 프로젝트를 선택하세요.');return;}
  const controller=new AbortController();pcmAbort.current=controller;
  setPcmBusy(true);setPcmStatus('원곡 독립 드럼 PCM 파일 확인 중');
  try{
   const plan=await createMusicReactiveDance30(character,source,{
    loadFile:getFile,signal:controller.signal,durationSec:Number(pcmDuration),
    sourceTrackId:pcmRhythm||rhythmTracks[0]?.trackId,
    current:()=>projects.find(p=>p.id===source.id),
    onProgress:setPcmStatus
   });
   if(controller.signal.aborted)throw Error('PCM 춤 제작이 취소됐습니다.');
   setBase(plan);setReferenceId('');setLines(danceLines(plan));setTime(0);
   setPcmStatus('실제 드럼 WAV 강약에 따라 '+plan.cues.length+'개 전곡 춤 큐를 만들었습니다. 저장 버튼을 누르기 전까지 기존 춤은 그대로입니다.');
  }catch(error){setPcmStatus('원본·기존 춤 보존 · WAV 기반 춤 생성 중단: '+error.message);}
  finally{setPcmBusy(false);pcmAbort.current=null;}
 };

 const [cameraDuration,setCameraDuration]=useState(10),[cameraBusy,setCameraBusy]=useState(false);
 const [cameraStatus,setCameraStatus]=useState('웹캠 사용 권한을 허용하면 로컬 WebM을 녹화할 수 있습니다.');
 const cameraAbort=useRef(null);
 const liveAbort=useRef(null);
 const [liveBusy,setLiveBusy]=useState(false),[liveStatus,setLiveStatus]=useState('웹캠 연기 → 실제 로컬 MediaPipe 자세 추출 → VRM 동작 신규 저장을 한 번에 수행합니다.');
 useEffect(()=>()=>liveAbort.current?.abort(),[]);
 const performAndApply=async()=>{
  if(liveBusy||poseRunning||cameraBusy)return;
  const snapshot=character;
  const controller=new AbortController();liveAbort.current=controller;
  setLiveBusy(true);setLiveStatus('본인 또는 허가된 캐릭터 원본을 유지한 채 웹캠을 준비합니다.');
  try{
   const result=await recordAndApplyWebcamPose32(snapshot,{
    durationSec:Number(cameraDuration),python:posePython,model:poseModel,
    consent:poseRights,signal:controller.signal,
    current:()=>latestCharacter.current,onSave,onProgress:setLiveStatus
   });
   if(controller.signal.aborted)throw Error('촬영·관절 추출 취소');
   setReferenceId(result.videoAssetId);setPoseDraft(null);
   setLiveStatus('실제 동작 '+result.frames+
    '개 관절 프레임을 신규 VRM 동작에 저장 · 이전 춤·원본 영상 유지');
   notify('원본 32항 · 실제 본인 웹캠 연기 → 로컬 MediaPipe → VRM 동작 연결 완료');
  }catch(error){setLiveStatus('실제 웹캠 연기 저장 중단 · 원본 보존: '+error.message);}
  finally{liveAbort.current=null;setLiveBusy(false);}
 };
 useEffect(()=>()=>cameraAbort.current?.abort(),[]);
 const recordCamera=async()=>{
  if(cameraBusy||poseRunning)return;
  const controller=new AbortController();cameraAbort.current=controller;setCameraBusy(true);
  let stagedId='';
  try{
   if(!poseRights)throw Error('본인 영상 사용 권한에 동의한 뒤 녹화하세요.');
   if((character.assets||[]).length>=MAX_CHARACTER_ASSETS)
    throw Error('캐릭터 자료 64개 한도이므로 새 동작 영상을 추가할 수 없습니다.');
   const movie=await recordWebcamMotion32({
    durationSec:Number(cameraDuration),signal:controller.signal,onProgress:setCameraStatus
   });
   if(controller.signal.aborted)throw Error('웹캠 영상 촬영이 취소됐습니다.');
   validateCharacterFile(movie);validateCharacterAssetRole('motion-reference','video');
   stagedId=genId('asset');
   if((character.assets||[]).some(a=>a.id===stagedId))throw Error('새 동작 영상 자산 ID 충돌');
   const asset={id:stagedId,name:movie.name,type:movie.type,size:movie.size,role:'motion-reference'};
   await putFileNew(stagedId,movie);
   try{
    if(controller.signal.aborted)throw Error('촬영 후 저장이 취소됐습니다.');
    await Promise.resolve(onSave({...character,assets:[...(character.assets||[]),asset],updatedAt:new Date().toISOString()}));
   }catch(error){
    await removeFile(stagedId);
    stagedId='';
    throw error;
   }
   setReferenceId(stagedId);setPoseDraft(null);
   setCameraStatus('실제 웹캠 동작 영상 '+Math.ceil(movie.size/1024)+'KB를 기존 캐릭터에 신규 추가 저장했습니다.');
   notify('본인 동작 영상 등록 완료. 위의 MediaPipe 실제 자세 추출을 사용할 수 있습니다.');
  }catch(e){setCameraStatus('카메라 동작 녹화 중단: '+e.message);}
  finally{setCameraBusy(false);cameraAbort.current=null;}
 };

 useEffect(()=>()=>poseAbort.current?.abort(),[]);
 const extractPose=async()=>{
  if(poseRunning)return;
  setPoseDraft(null);const controller=new AbortController();poseAbort.current=controller;setPoseRunning(true);
  setPoseStatus('본인 동작 영상에서 로컬 전신 관절 추출 중…');
  try{
   if(!referenceId)throw Error('먼저 등록된 동작 참고 영상을 선택하세요.');
   const source=await getFile(referenceId);
   if(!(source instanceof Blob))throw Error('등록 동작 참고 원본 영상을 찾지 못했습니다.');
   const result=await extractMotionCapture31(source,{
    python:posePython,model:poseModel,rightsConfirmed:poseRights,signal:controller.signal
   });
   if(controller.signal.aborted)throw Error('동작 참고 추출이 취소됐습니다.');
   const captured=makeMotionCapture31(character,referenceId,result);
   setPoseDraft(captured);
   setPoseStatus('실제 영상 '+captured.frames.length+'개 자세 프레임 추출 완료 · 저장 전 원본 유지');
  }catch(e){setPoseStatus('자세 추출 중단: '+e.message);}
  finally{poseAbort.current=null;setPoseRunning(false);}
 };
 const savePose=()=>{
  try{
   if(!poseDraft||poseDraft.referenceAssetId!==referenceId||poseDraft.characterId!==character.id)
    throw Error('현재 선택한 사람/캐릭터와 동작 참고 영상이 바뀌었습니다.');
   onSave({...character,motionCaptured31:poseDraft,updatedAt:new Date().toISOString()});
   setPoseDraft(null);
   notify('실제 MediaPipe 영상 관절 동작을 캐릭터 3D VRM에 연결했습니다. 이전 본·음원·원본 영상은 보존합니다.');
  }catch(e){notify('실제 동작 저장 실패: '+e.message);}
 };
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
  <div className="mv7-item">
   <strong>원본 32항 · Windows 카메라로 실제 본인 동작 녹화</strong>
   <Field label="실제 녹화 길이 (2~30초)"><input type="number" min="2" max="30" step="1" value={cameraDuration} disabled={cameraBusy} onChange={e=>setCameraDuration(Number(e.target.value))}/></Field>
   <div className="hstack">
    <Button disabled={!poseRights||cameraBusy||poseRunning} onClick={recordCamera}>{cameraBusy?'실제 웹캠 녹화 중…':'카메라로 동작 촬영·등록'}</Button>
    {cameraBusy&&<Button onClick={()=>cameraAbort.current?.abort()}>카메라 촬영 취소</Button>}
   </div>
   <p role="status">{cameraStatus}</p>
   <Notice>카메라는 이 Windows 앱의 사용자 동의 후에만 열립니다. 녹화한 WebM은 기존 캐릭터의 동작 참고 영상으로 별도 저장합니다. 외부 업로드·원본 삭제·다른 캐릭터 덮어쓰기는 수행하지 않습니다.</Notice>
  </div>
  <div className="mv7-item">
   <strong>원본 31·32항 · 실제 동작 영상 자세 추출 → 3D VRM</strong>
   <Field label="설치된 로컬 Python.exe 절대 경로"><input value={posePython} onChange={e=>setPosePython(e.target.value)} placeholder="C:\\Python311\\python.exe" disabled={poseRunning}/></Field>
   <Field label="설치된 MediaPipe Pose .task 모델 절대 경로"><input value={poseModel} onChange={e=>setPoseModel(e.target.value)} placeholder="C:\\Models\\pose_landmarker.task" disabled={poseRunning}/></Field>
   <label><input type="checkbox" checked={poseRights} disabled={poseRunning} onChange={e=>setPoseRights(e.target.checked)}/> 본인이 촬영했거나 동작 추출 및 사용 권한을 확보한 영상입니다.</label>
   <div className="hstack">
    <Button disabled={poseRunning||!referenceId||!poseRights||!posePython||!poseModel} onClick={extractPose}>{poseRunning?'실제 관절 분석 중…':'실제 MediaPipe 전신 자세 추출'}</Button>
    {poseRunning&&<Button onClick={()=>poseAbort.current?.abort()}>추출 취소</Button>}
    <Button variant="primary" disabled={!poseDraft||poseRunning} onClick={savePose}>추출 동작을 VRM에 저장</Button>
   </div>
   <p role="status">{poseStatus}</p>
   <div className="mv7-item">
    <strong>원본 32항 · 웹캠 연기 → 실제 MediaPipe → VRM 동작 한 번에 생성</strong>
    <div className="hstack">
     <Button variant="primary" disabled={liveBusy||cameraBusy||poseRunning||
      !poseRights||!posePython||!poseModel}
      onClick={performAndApply}>{liveBusy?'실제 연기 영상 촬영·관절 추출·저장 중':'웹캠으로 직접 연기 → VRM 동작 한 번에 생성·저장'}</Button>
     {liveBusy&&<Button onClick={()=>liveAbort.current?.abort()}>연기·관절 분석 취소</Button>}
    </div>
    <p role="status">{liveStatus}</p>
    <Notice>본인이 허용한 카메라의 실제 영상에 설치된 MediaPipe Pose Task를 실행합니다. 영상과 관절 추출 둘 다 성공해야 캐릭터에 신규 참고 영상·VRM 동작을 저장합니다. 기존 사용자 녹음·사진·춤·VRM 파일은 그대로 보존합니다.</Notice>
   </div>
   {poseDraft&&<p>추출 자세 {poseDraft.frames.length}프레임 · 길이 {(poseDraft.durationMs/1000).toFixed(2)}초 · 원본 동영상은 기존 위치에 유지</p>}
   {character.motionCaptured31&&<p>등록된 실제 동작: {character.motionCaptured31.frames?.length||0}프레임 · 기존 춤 계획과 별도 보관</p>}
   <Notice>Windows EXE에 설치된 오프라인 MediaPipe Tasks·OpenCV·Pose Task 모델이 필요합니다. 모델은 자동 설치/다운로드되지 않습니다. 2D 영상에서 검출한 상대 관절 회전을 VRM 본에 적용하는 실제 추출 기능이며, 깊이까지 추정한 완전한 3D 모션캡처는 아닙니다.</Notice>
  </div>
  <div className="mv7-item">
   <strong>원본 30·46·47항 · 실제 MusicGen 드럼 WAV PCM 기반 전곡 춤 생성</strong>
   <Notice>해당 프로젝트에 이미 저장된 독립 드럼 신경망 WAV를 실제 읽어 100ms별 PCM 강약을 분석하고, 원곡 BPM·장르·구간에 맞춰 2D/VRM 춤의 동작·강도를 조절합니다. 가짜 음악 데이터나 신경망 춤 추론으로 표시하지 않습니다. 기존 저장 춤을 변경하지 않고 새 초안만 생성합니다.</Notice>
   <Field label="원곡 드럼 WAV 선택"><select disabled={pcmBusy} value={pcmRhythm}
    onChange={e=>setPcmRhythm(e.target.value)}>
    <option value="">이 음악의 실제 저장 드럼 WAV 자동 선택</option>
    {rhythmTracks.map(track=><option key={track.trackId} value={track.trackId}>{track.name}</option>)}
   </select></Field>
   <Field label="영상 전체 길이 (3~6분 또는 2~30초)">
    <select disabled={pcmBusy} value={pcmDuration} onChange={e=>setPcmDuration(Number(e.target.value))}>
     <option value={180}>3분 (180초)</option><option value={240}>4분 (240초)</option>
     <option value={300}>5분 (300초)</option><option value={360}>6분 (360초)</option>
     <option value={10}>10초 구간</option><option value={30}>30초 구간</option>
    </select>
   </Field>
   <div className="hstack"><Button disabled={pcmBusy||!rhythmTracks.length||poseRunning||cameraBusy}
    onClick={generateAudioDance}>실제 드럼 WAV로 2D/VRM 춤 생성</Button>
    {pcmBusy&&<Button onClick={()=>pcmAbort.current?.abort()}>PCM 분석 취소</Button>}</div>
   <p role="status">{pcmStatus}</p>
  </div>
  <p><Button disabled={pcmBusy} onClick={regenerate}>현재 음악 설정으로 동작 큐 생성</Button></p>
  <p>동작: {Object.entries(MOVES).map(([a,b])=>`${a}=${b}`).join(' · ')}</p>
  <Field label="춤 큐 편집: 시작초,종료초,동작,강도(0~1),참고영상 시작초(선택)"><textarea rows={11} spellCheck={false} value={lines} onChange={e=>setLines(e.target.value)}/></Field>
  {error?<p role="alert">동작 큐 오류: {error}</p>:<><p>{plan.cues.length}개 마디별 동작 · {plan.bpm} BPM · {durationSec.toFixed(1)}초 · {plan.sections.length}개 구간</p>
   <Field label="춤 타임라인"><input aria-label="88단계 춤 프레임 탐색" type="range" min="0" max={durationSec} step="0.02" value={Math.min(time,durationSec)} onChange={e=>{const t=Number(e.target.value);setTime(t);const state=danceAt(plan,t);if(state?.referenceMs!=null&&videoRef.current)videoRef.current.currentTime=state.referenceMs/1000;}} style={{width:'100%'}}/></Field>
   <p aria-live="polite">{time.toFixed(2)}초 · {now?`${now.section} / ${MOVES[now.move]} / 강도 ${Math.round(now.strength*100)}% / 박 ${now.beat.toFixed(2)}`:'동작 없음'} {pose?.referenceMs!=null?`· 참고 영상 ${ (pose.referenceMs/1000).toFixed(2)}초`:''}</p>
  </>}
  <div className="modal-actions"><Button disabled={!!error} onClick={exportJson}>춤 타임라인 JSON</Button><Button variant="primary" disabled={!!error} onClick={save}>춤 연출 저장</Button></div>
  <Notice>STEP88 수동 춤 계획에서는 원본 영상을 보며 동작 종류와 해당 시작초를 입력합니다. 별도 STEP31/32 패널은 설치된 로컬 자세 모델로 실제 관절을 추출해 VRM에 연결합니다. 시작초를 입력한 큐는 그 시점의 참조 구간과 시간상 연결되며, 수동으로 선택한 동작만 캐릭터에 적용됩니다. 로컬 MediaPipe 모델을 통한 2D 전신 자세 추출은 제공하지만 영상 합성·완전한 3D 모션캡처는 아직 수행하지 않습니다. 모션은 **동작이 호환되는 VRM 휴머노이드 본** 또는 2D 이미지 영역 근사로 보여 줍니다. 3D 공연 출력은 기존의 무음 WebM입니다.</Notice>
 </div>;
}
