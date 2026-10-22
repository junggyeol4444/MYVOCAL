import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usableDancePlan,createFullSongDancePlan,saveDancePlan} from '../lib/characterDanceDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {downloadText} from '../lib/store.js';
import {modelAssets,parseCharacter3d,EXPRESSIONS} from '../lib/character3d.js';
import {Character3dRenderer} from '../lib/character3dRenderer.js';
import {createStageSettings,validateStageSettings,saveStageSettings,stageRigSettings,stageMetadata,STAGE_FPS} from '../lib/characterStage3d.js';
import {recordStageWebM,supportedStageWebM} from '../lib/stage3dRecording.js';
import {convertRecordedWebMToMP4} from '../lib/mvMp4Export.js';
import {linkedVrmSingingProjects,resolveProjectVrmLipSync} from '../lib/projectVrmSingingSync.js';
import {projectVocalSources} from '../lib/lipSyncProjectSources.js';
import {inspectSingingWav} from '../lib/singingOutputValidation.js';
import {audioEnd,mixdownWav} from '../lib/audioEngine.js';
const backdrops={concert:'공연장 · 보라 LED',neon:'네온 · 사이버',theater:'극장 · 따뜻한 무대'};
const cameras={fixed:'고정',orbit:'회전',track:'트래킹',dolly:'줌 인·아웃',cuts:'쇼트 전환'};
const lights={concert:'스튜디오',warm:'웜',cool:'쿨',pulse:'박동 조명'};
const motions={idle:'대기 자세',nod:'고개 끄덕이기',wave:'팔 흔들기'};
const safeFilename=s=>String(s||'character').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function CharacterStage3dEditor({character,onSave,notify,projects=[]}){
 const assets=modelAssets(character);
 const directedPlan=usableExpressionPlan(character);
 const dancePlan=usableDancePlan(character);
 const [projectDancePlan,setProjectDancePlan]=useState(null);
 const performancePlan=usablePerformance89(character);
 const eligibleProjects=useMemo(()=>linkedVrmSingingProjects(character,projects),[character,projects]);
 const [linkedProjectId,setLinkedProjectId]=useState('');
 const activeProject=eligibleProjects.find(p=>p.id===linkedProjectId)||eligibleProjects[0]||null;
 const activeDancePlan=projectDancePlan?.projectId===activeProject?.id?projectDancePlan:dancePlan;
 const activeLipSync=useMemo(()=>{
  if(!activeProject)return character.lipSync;
  try{return resolveProjectVrmLipSync(activeProject,character)?.lipSync||character.lipSync;}
  catch{return character.lipSync;}
 },[activeProject,character]);
 const initial=()=>{try{if(character.stage3d){validateStageSettings(character,character.stage3d);return {...character.stage3d};}}catch{}return createStageSettings(character);};
 const [settings,setSettings]=useState(initial),[model,setModel]=useState(null),[status,setStatus]=useState('3D 모델 분석 중…'),[playing,setPlaying]=useState(true),[time,setTime]=useState(0),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0),[singingWav,setSingingWav]=useState(null);
 const canvas=useRef(null),engine=useRef(null),raf=useRef(0),start=useRef(0),clock=useRef(0),config=useRef(settings),abort=useRef(null),busy=useRef(false);
 config.current=settings;
 useEffect(()=>{let dead=false;setModel(null);setStatus('로컬 3D 모델 불러오는 중…');
  (async()=>{try{const f=await getFile(settings.assetId);if(!f)throw Error('저장된 3D 모델 파일을 찾을 수 없습니다.');if(f.size>40*1024*1024)throw Error('모델은 40MB 이하만 지원됩니다.');
   const parsed=parseCharacter3d(await f.arrayBuffer(),f.name||assets.find(a=>a.id===settings.assetId)?.name);
   if(dead)return;const renderer=new Character3dRenderer(canvas.current,parsed);engine.current=renderer;setModel(parsed);setStatus(`모델 연결됨 · 메시 ${parsed.meshCount}개 · 본 ${parsed.skins.reduce((n,s)=>n+s.joints.length,0)}개 · 모션 ${parsed.animations.length}개`);
   renderer.render(stageRigSettings(config.current),0,config.current,activeLipSync,directedPlan,character,activeDancePlan,performancePlan);
  }catch(e){if(!dead){setStatus('3D 무대 오류: '+e.message);notify(e.message);}}})();
  return ()=>{dead=true;abort.current?.abort();cancelAnimationFrame(raf.current);engine.current?.dispose();engine.current=null;};
 },[character.id,settings.assetId]);
 useEffect(()=>{if(!model||exporting)return;
  const tick=now=>{if(!engine.current||busy.current)return;if(!start.current)start.current=now;
   if(playing)clock.current=(clock.current+(now-start.current)/1000)%config.current.duration;
   start.current=now;
   try{engine.current.render(stageRigSettings(config.current),clock.current,config.current,activeLipSync,directedPlan,character,activeDancePlan,performancePlan);}catch(e){setStatus('무대 렌더링 오류: '+e.message);return;}
   if(Math.floor(now/250)!==Math.floor((now-16)/250))setTime(clock.current);
   raf.current=requestAnimationFrame(tick);
  };raf.current=requestAnimationFrame(tick);return ()=>{cancelAnimationFrame(raf.current);start.current=0;};
 },[model,playing,exporting,activeLipSync,activeDancePlan]);
 const patch=(name,value)=>setSettings(s=>({...s,[name]:value}));
 const draw=t=>{if(!engine.current)throw Error('3D 모델이 로딩되지 않았습니다.');engine.current.render(stageRigSettings(config.current),t,config.current,activeLipSync,directedPlan,character,activeDancePlan,performancePlan);};
 const seek=t=>{clock.current=Math.max(0,Math.min(config.current.duration,Number(t)));setTime(clock.current);try{draw(clock.current);}catch(e){notify(e.message);}};
 const selectAsset=id=>{const next=createStageSettings({...character,rig3d:null,stage3d:null,assets:character.assets?.filter(a=>a.id===id)});setSettings({...next,assetId:id});clock.current=0;};
 const applyFullSongDance=()=>{
  try{
   if(!activeProject)throw Error('연결할 음악 프로젝트가 없습니다.');
   const duration=Number(activeProject.neuralAutoScore?.durationSec)||audioEnd(activeProject);
   const plan=createFullSongDancePlan(character,activeProject,{durationSec:duration});
   setProjectDancePlan(plan);
   notify('원본 음악 BPM·구간을 사용한 전곡 춤 '+plan.cues.length+'동작을 3D 무대에 적용했습니다. 기존 캐릭터 저장 춤은 유지됩니다.');
  }catch(e){notify('전곡 춤 적용 실패: '+e.message);}
 };
 const saveFullSongDance=()=>{
  try{
   if(!projectDancePlan||projectDancePlan.projectId!==activeProject?.id)
    throw Error('먼저 현재 음악 프로젝트의 전곡 춤을 생성하세요.');
   const next=saveDancePlan(character,projectDancePlan);
   onSave(next);
   notify('음악 BPM 기반 3~6분 전체 춤 동작을 현재 캐릭터에 저장했습니다.');
  }catch(e){notify('전곡 춤 저장 실패: '+e.message);}
 };
 const loadProjectVocal=async()=>{
  try{
   if(!activeProject)throw Error('연결된 한국어 Singing 프로젝트가 없습니다.');
   const sources=projectVocalSources(activeProject);
   if(!sources.length)throw Error('프로젝트에 저장된 실제 보컬 WAV가 없습니다.');
   const vocal=await getFile(sources[0].assetId);
   if(!(vocal instanceof Blob)||vocal.size<44||vocal.size>96*1024*1024)
    throw Error('프로젝트 보컬 WAV가 없거나 용량이 초과됐습니다.');
   const info=inspectSingingWav(await vocal.arrayBuffer());
   if(!info.valid||info.peak<.001||info.durationSec<2||info.durationSec>360)
    throw Error('프로젝트 보컬 WAV의 형식 또는 곡 길이가 올바르지 않습니다.');
   const linked=resolveProjectVrmLipSync(activeProject,character);
   if(!linked||linked.lipSync?.cues?.some(c=>c.endMs>info.durationSec*1000+50))
    throw Error('현재 보컬 WAV와 한국어 음소 시간표가 일치하지 않습니다.');
   setSingingWav(vocal);
   setSettings(prev=>({...prev,duration:Math.floor(info.durationSec*100)/100}));
   notify('선택한 프로젝트의 실제 보컬 WAV·한국어 음소·곡 길이를 3D 무대에 연결했습니다.');
  }catch(e){notify('프로젝트 3D 무대 연결 실패: '+e.message);}
 };
 const loadProjectMusic=async()=>{
  try{
   if(!activeProject)throw Error('연결할 음악 프로젝트가 없습니다.');
   const duration=audioEnd(activeProject);
   if(!Number.isFinite(duration)||duration<2||duration>360)
    throw Error('프로젝트에 2~360초 길이의 실제 오디오 또는 MIDI가 필요합니다.');
   const wav=await mixdownWav(activeProject,{bitDepth:16,channels:2,sampleRate:44100});
   if(!(wav instanceof Blob))throw Error('기존 음악 편집기에서 WAV 믹스를 만들지 못했습니다.');
   const info=inspectSingingWav(await wav.arrayBuffer());
   if(!info.valid||info.peak<.001||info.durationSec<2||info.durationSec>360)
    throw Error('프로젝트 전체 음악 WAV가 올바르지 않습니다.');
   const synced=resolveProjectVrmLipSync(activeProject,character);
   if(synced?.lipSync?.cues?.some(c=>c.endMs>info.durationSec*1000+50))
    throw Error('한국어 립싱크 길이가 음악보다 깁니다.');
   setSingingWav(new File([wav],'MYVOCAL-프로젝트-전체-음악.wav',{type:'audio/wav'}));
   setSettings(old=>({...old,duration:Math.round(info.durationSec*100)/100}));
   notify('프로젝트의 기존 모든 활성 악기·보컬 트랙을 한 개의 실제 음악 WAV로 믹싱하여 3D 공연에 연결했습니다. 원본 트랙은 보존됩니다.');
  }catch(e){notify('3D 무대 전체 음악 연결 실패: '+e.message);}
 };
 const save=()=>{try{const next=saveStageSettings(character,settings);onSave(next);notify('STEP84 3D 무대 설정 저장 완료. 원본 VRM/GLB는 유지됩니다.');}catch(e){notify('3D 무대 저장 실패: '+e.message);}};
 const json=()=>{try{downloadText(JSON.stringify(stageMetadata(character,settings),null,2),`MYVOCAL-Step84-${safeFilename(character.id)}-stage.json`,'application/json');}catch(e){notify(e.message);}};
 const snapshot=()=>{try{draw(clock.current);canvas.current.toBlob(blob=>{if(blob)downloadBlob(blob,`MYVOCAL-Step84-${safeFilename(character.id)}.png`);else notify('PNG 인코딩 실패');},'image/png');}catch(e){notify(e.message);}};
 const record=async(asMp4=false)=>{try{if(!model)throw Error('3D 모델을 먼저 불러오세요.');validateStageSettings(character,settings);if(!supportedStageWebM())throw Error('사용 중인 브라우저에서 WebM 영상 인코딩을 사용할 수 없습니다.');
   if(asMp4&&!window.__MYVOCAL_SESSION_KEY)throw Error('MP4 출력에는 기존 Windows EXE 로컬 세션이 필요합니다.');
   busy.current=true;setPlaying(false);setExporting(true);setProgress(0);
   const controller=new AbortController();abort.current=controller;
   const clip=await recordStageWebM({canvas:canvas.current,duration:settings.duration,fps:settings.fps,draw,onProgress:setProgress,signal:controller.signal,audioBlob:singingWav});
   downloadBlob(clip,`MYVOCAL-Step84-${safeFilename(character.id)}-stage.webm`);
   notify(`STEP84 3D 공연 WebM (${(clip.size/1048576).toFixed(2)}MiB) 출력 완료 · ${singingWav?'가창 WAV 포함':'무음 영상'}`);
   if(asMp4){
    const mp4=await convertRecordedWebMToMP4(clip,{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal});
    downloadBlob(mp4,`MYVOCAL-Step84-${safeFilename(character.id)}-stage.mp4`);
    notify(`STEP84 3D 공연 실제 MP4 (${(mp4.size/1048576).toFixed(2)}MiB) 출력 완료 · 기존 WebM도 보존했습니다.`);
   }
  }catch(e){notify('3D 공연 영상 출력 실패: '+e.message);}finally{busy.current=false;abort.current=null;setExporting(false);start.current=0;}}
 const stageFields=(label,key,min,max,step)=> <Field label={`${label}: ${settings[key]}`}><input type="range" style={{width:'100%'}} min={min} max={max} step={step} value={settings[key]} disabled={exporting} onChange={e=>patch(key,Number(e.target.value))}/></Field>;
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}>
  <Notice>**STEP84 · 3D 무대 연출** — 기존 VRM/GLB 캐릭터를 무대에 배치하고 카메라·조명·배경·본/모션을 실제 WebGL에서 재생합니다. 최대 360초 **WebM 공연 영상(가창 WAV 오디오 선택 가능)**을 로컬에서 녹화합니다. 저장된 STEP85 음소 Lip Sync와 STEP87 표정 계획은 미리보기와 녹화에 반영합니다. 기존 Windows EXE의 로컬 FFmpeg를 통한 실제 MP4 내보내기도 지원합니다.</Notice>
  {eligibleProjects.length>0&&<><Field label="3D 공연에 연결할 한국어 Singing 프로젝트"><select disabled={exporting} value={activeProject?.id||''} onChange={e=>{setLinkedProjectId(e.target.value);setSingingWav(null);setProjectDancePlan(null);}}>{eligibleProjects.map(p=><option key={p.id} value={p.id}>{p.title||p.id}</option>)}</select></Field><div className="look-actions"><Button disabled={exporting} onClick={loadProjectVocal}>프로젝트 보컬 WAV·립싱크·곡 길이 연결</Button><Button disabled={exporting} onClick={loadProjectMusic}>프로젝트 전체 음악 WAV·립싱크 연결</Button><Button disabled={exporting} onClick={applyFullSongDance}>3~6분 전곡 BPM·구간 춤 적용</Button><Button disabled={exporting||!projectDancePlan||projectDancePlan.projectId!==activeProject?.id} onClick={saveFullSongDance}>전곡 춤 캐릭터에 저장</Button></div></>}
  <Field label="등록된 3D 원본"><select value={settings.assetId} disabled={exporting} onChange={e=>selectAsset(e.target.value)}>{assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  <p role="status" className="muted">{status}</p>
  <canvas ref={canvas} width="640" height="360" aria-label={`${character.name} 3D 무대 공연 화면`} style={{display:'block',width:'min(100%,640px)',height:'auto',background:'#0b1020',borderRadius:8}}/>
  <div className="look-actions"><Button disabled={!model||exporting} onClick={()=>setPlaying(v=>!v)}>{playing?'일시정지':'재생'}</Button><Button disabled={!model||exporting} onClick={()=>seek(0)}>처음으로</Button><small>{time.toFixed(1)} / {settings.duration}초</small></div>
  <input aria-label="3D 공연 재생 위치" type="range" min="0" max={settings.duration} step="0.05" value={time} disabled={!model||exporting} onChange={e=>{setPlaying(false);seek(e.target.value);}} style={{width:'100%'}}/>
  <div className="form-two"><Field label="무대 배경"><select disabled={exporting} value={settings.backdrop} onChange={e=>patch('backdrop',e.target.value)}>{Object.entries(backdrops).map(([key,v])=><option value={key} key={key}>{v}</option>)}</select></Field>
  <Field label="카메라 연출"><select disabled={exporting} value={settings.camera} onChange={e=>patch('camera',e.target.value)}>{Object.entries(cameras).map(([key,v])=><option value={key} key={key}>{v}</option>)}</select></Field>
  <Field label="조명 스타일"><select disabled={exporting} value={settings.lights} onChange={e=>patch('lights',e.target.value)}>{Object.entries(lights).map(([key,v])=><option value={key} key={key}>{v}</option>)}</select></Field>
  <Field label="캐릭터 모션"><select disabled={exporting} value={settings.motion} onChange={e=>{setSettings(s=>({...s,motion:e.target.value,animation:''}));}}>{Object.entries(motions).map(([key,v])=><option key={key} value={key}>{v}</option>)}</select></Field>
  <Field label="표정"><select disabled={exporting} value={settings.expression} onChange={e=>patch('expression',e.target.value)}>{EXPRESSIONS.map(e=><option key={e} value={e}>{e}</option>)}</select></Field>
  <Field label="모션 재생 배속"><input disabled={exporting} type="number" min="0.1" max="3" step="0.1" value={settings.speed} onChange={e=>{if(e.target.value!=='')patch('speed',Number(e.target.value));}}/></Field>
  <Field label="모델 내장 애니메이션"><select disabled={!model||exporting} value={settings.animation} onChange={e=>patch('animation',e.target.value)}><option value="">기본 모션 사용</option>{model?.animations.map((a,i)=><option key={i} value={a.name}>{a.name}</option>)}</select></Field>
  <Field label="영상 길이 (2~360초)"><input type="number" min="2" max="360" step="1" disabled={exporting} value={settings.duration} onChange={e=>{if(e.target.value!=='')patch('duration',Number(e.target.value));}}/></Field>
  <Field label="출력 프레임률"><select disabled={exporting} value={settings.fps} onChange={e=>patch('fps',Number(e.target.value))}>{STAGE_FPS.map(n=><option key={n} value={n}>{n} FPS</option>)}</select></Field></div>
  {stageFields('기본 카메라 회전(°)','yaw',-180,180,5)}{stageFields('카메라 높이(°)','pitch',-60,60,5)}{stageFields('기본 줌','zoom',.7,1.5,.05)}
  {stageFields('카메라 동작 강도','cameraMotion',0,2,.1)}{stageFields('조명 밝기','lightIntensity',.2,2,.1)}{stageFields('조명 움직임','lightMotion',0,2,.1)}
  {stageFields('캐릭터 표정 강도','expressionWeight',0,1,.05)}
  <div className="look-actions"><Button disabled={!model||exporting} onClick={snapshot}>현재 프레임 PNG</Button><Button disabled={exporting} onClick={json}>무대 설정 JSON</Button><Button disabled={!model||exporting} onClick={save} variant="primary">무대 설정 저장</Button></div>
  <Field label="3D 공연 영상에 실제 가창 WAV 음성 추가 (선택)"><input type="file" accept=".wav,audio/wav" disabled={exporting} onChange={e=>setSingingWav(e.target.files?.[0]||null)}/></Field>
  <Notice>선택한 WAV는 실제 미디어 오디오 트랙으로 녹화됩니다. 저장된 STEP85 입 모양 시간표는 동일한 공연 시간에 VRM 표정 모프로 렌더링됩니다. 원본 모델과 WAV는 수정하지 않습니다.</Notice>
  <div className="look-actions"><Button variant="primary" disabled={!model||exporting||!supportedStageWebM()} onClick={()=>record(false)}>{exporting?`녹화 중 ${Math.round(progress*100)}%`:'공연 영상 WebM 내보내기'}</Button><Button disabled={!model||exporting||!supportedStageWebM()} onClick={()=>record(true)}>공연 영상 MP4 내보내기 (로컬 FFmpeg)</Button>{exporting&&<Button onClick={()=>abort.current?.abort()}>녹화 취소</Button>}</div>
  <Notice>WAV를 선택하면 음성이 포함된 **WebM**을 출력하고, 선택하지 않으면 무음입니다. 영상 인코딩은 기존 Windows EXE WebView2의 MediaRecorder·WebGL, MP4 변환은 설치된 로컬 FFmpeg 지원에 따라 달라집니다. 오디오 파일을 선택하면 실제 WAV 음성이 함께 녹화되며, 저장된 Lip Sync 타임라인이 3D 입 모양에 적용됩니다. MToon/PBR·물리효과가 없는 Step83 로컬 렌더러와 동일한 3D 모델 제약이 적용됩니다. 원본 파일은 변경하지 않습니다.</Notice>
 </div>;
}
