import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usableDancePlan} from '../lib/characterDanceDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {downloadText} from '../lib/store.js';
import {modelAssets,parseCharacter3d,EXPRESSIONS} from '../lib/character3d.js';
import {Character3dRenderer} from '../lib/character3dRenderer.js';
import {createStageSettings,validateStageSettings,saveStageSettings,stageRigSettings,stageMetadata,STAGE_FPS} from '../lib/characterStage3d.js';
import {recordStageWebM,supportedStageWebM} from '../lib/stage3dRecording.js';
const backdrops={concert:'공연장 · 보라 LED',neon:'네온 · 사이버',theater:'극장 · 따뜻한 무대'};
const cameras={fixed:'고정',orbit:'회전',track:'트래킹',dolly:'줌 인·아웃',cuts:'쇼트 전환'};
const lights={concert:'스튜디오',warm:'웜',cool:'쿨',pulse:'박동 조명'};
const motions={idle:'대기 자세',nod:'고개 끄덕이기',wave:'팔 흔들기'};
const safeFilename=s=>String(s||'character').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function CharacterStage3dEditor({character,onSave,notify}){
 const assets=modelAssets(character);
 const directedPlan=usableExpressionPlan(character);
 const dancePlan=usableDancePlan(character);
 const performancePlan=usablePerformance89(character);
 const initial=()=>{try{if(character.stage3d){validateStageSettings(character,character.stage3d);return {...character.stage3d};}}catch{}return createStageSettings(character);};
 const [settings,setSettings]=useState(initial),[model,setModel]=useState(null),[status,setStatus]=useState('3D 모델 분석 중…'),[playing,setPlaying]=useState(true),[time,setTime]=useState(0),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0);
 const canvas=useRef(null),engine=useRef(null),raf=useRef(0),start=useRef(0),clock=useRef(0),config=useRef(settings),abort=useRef(null),busy=useRef(false);
 config.current=settings;
 useEffect(()=>{let dead=false;setModel(null);setStatus('로컬 3D 모델 불러오는 중…');
  (async()=>{try{const f=await getFile(settings.assetId);if(!f)throw Error('저장된 3D 모델 파일을 찾을 수 없습니다.');if(f.size>40*1024*1024)throw Error('모델은 40MB 이하만 지원됩니다.');
   const parsed=parseCharacter3d(await f.arrayBuffer(),f.name||assets.find(a=>a.id===settings.assetId)?.name);
   if(dead)return;const renderer=new Character3dRenderer(canvas.current,parsed);engine.current=renderer;setModel(parsed);setStatus(`모델 연결됨 · 메시 ${parsed.meshCount}개 · 본 ${parsed.skins.reduce((n,s)=>n+s.joints.length,0)}개 · 모션 ${parsed.animations.length}개`);
   renderer.render(stageRigSettings(config.current),0,config.current,character.lipSync,directedPlan,character,dancePlan,performancePlan);
  }catch(e){if(!dead){setStatus('3D 무대 오류: '+e.message);notify(e.message);}}})();
  return ()=>{dead=true;abort.current?.abort();cancelAnimationFrame(raf.current);engine.current?.dispose();engine.current=null;};
 },[character.id,settings.assetId]);
 useEffect(()=>{if(!model||exporting)return;
  const tick=now=>{if(!engine.current||busy.current)return;if(!start.current)start.current=now;
   if(playing)clock.current=(clock.current+(now-start.current)/1000)%config.current.duration;
   start.current=now;
   try{engine.current.render(stageRigSettings(config.current),clock.current,config.current,character.lipSync,directedPlan,character,dancePlan,performancePlan);}catch(e){setStatus('무대 렌더링 오류: '+e.message);return;}
   if(Math.floor(now/250)!==Math.floor((now-16)/250))setTime(clock.current);
   raf.current=requestAnimationFrame(tick);
  };raf.current=requestAnimationFrame(tick);return ()=>{cancelAnimationFrame(raf.current);start.current=0;};
 },[model,playing,exporting]);
 const patch=(name,value)=>setSettings(s=>({...s,[name]:value}));
 const draw=t=>{if(!engine.current)throw Error('3D 모델이 로딩되지 않았습니다.');engine.current.render(stageRigSettings(config.current),t,config.current,character.lipSync,directedPlan,character,dancePlan,performancePlan);};
 const seek=t=>{clock.current=Math.max(0,Math.min(config.current.duration,Number(t)));setTime(clock.current);try{draw(clock.current);}catch(e){notify(e.message);}};
 const selectAsset=id=>{const next=createStageSettings({...character,rig3d:null,stage3d:null,assets:character.assets?.filter(a=>a.id===id)});setSettings({...next,assetId:id});clock.current=0;};
 const save=()=>{try{const next=saveStageSettings(character,settings);onSave(next);notify('STEP84 3D 무대 설정 저장 완료. 원본 VRM/GLB는 유지됩니다.');}catch(e){notify('3D 무대 저장 실패: '+e.message);}};
 const json=()=>{try{downloadText(JSON.stringify(stageMetadata(character,settings),null,2),`MYVOCAL-Step84-${safeFilename(character.id)}-stage.json`,'application/json');}catch(e){notify(e.message);}};
 const snapshot=()=>{try{draw(clock.current);canvas.current.toBlob(blob=>{if(blob)downloadBlob(blob,`MYVOCAL-Step84-${safeFilename(character.id)}.png`);else notify('PNG 인코딩 실패');},'image/png');}catch(e){notify(e.message);}};
 const record=async()=>{try{if(!model)throw Error('3D 모델을 먼저 불러오세요.');validateStageSettings(character,settings);if(!supportedStageWebM())throw Error('사용 중인 브라우저에서 WebM 영상 인코딩을 사용할 수 없습니다.');
   busy.current=true;setPlaying(false);setExporting(true);setProgress(0);
   const controller=new AbortController();abort.current=controller;
   const clip=await recordStageWebM({canvas:canvas.current,duration:settings.duration,fps:settings.fps,draw,onProgress:setProgress,signal:controller.signal});
   downloadBlob(clip,`MYVOCAL-Step84-${safeFilename(character.id)}-stage.webm`);notify(`STEP84 3D 공연 영상 WebM (${(clip.size/1048576).toFixed(2)}MiB) 출력 완료 · 무음 영상`);
  }catch(e){notify('3D 공연 영상 출력 실패: '+e.message);}finally{busy.current=false;abort.current=null;setExporting(false);start.current=0;}}
 const stageFields=(label,key,min,max,step)=> <Field label={`${label}: ${settings[key]}`}><input type="range" style={{width:'100%'}} min={min} max={max} step={step} value={settings[key]} disabled={exporting} onChange={e=>patch(key,Number(e.target.value))}/></Field>;
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}>
  <Notice>**STEP84 · 3D 무대 연출** — 기존 VRM/GLB 캐릭터를 무대에 배치하고 카메라·조명·배경·본/모션을 실제 WebGL에서 재생합니다. 최대 30초 **무음 WebM 공연 영상**을 로컬에서 녹화합니다. 저장된 STEP85 음소 Lip Sync와 STEP87 표정 계획은 미리보기와 녹화에 반영하며, 98단계 최종 MP4 합성은 포함하지 않습니다.</Notice>
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
  <Field label="영상 길이 (2~30초)"><input type="number" min="2" max="30" step="1" disabled={exporting} value={settings.duration} onChange={e=>{if(e.target.value!=='')patch('duration',Number(e.target.value));}}/></Field>
  <Field label="출력 프레임률"><select disabled={exporting} value={settings.fps} onChange={e=>patch('fps',Number(e.target.value))}>{STAGE_FPS.map(n=><option key={n} value={n}>{n} FPS</option>)}</select></Field></div>
  {stageFields('기본 카메라 회전(°)','yaw',-180,180,5)}{stageFields('카메라 높이(°)','pitch',-60,60,5)}{stageFields('기본 줌','zoom',.7,1.5,.05)}
  {stageFields('카메라 동작 강도','cameraMotion',0,2,.1)}{stageFields('조명 밝기','lightIntensity',.2,2,.1)}{stageFields('조명 움직임','lightMotion',0,2,.1)}
  {stageFields('캐릭터 표정 강도','expressionWeight',0,1,.05)}
  <div className="look-actions"><Button disabled={!model||exporting} onClick={snapshot}>현재 프레임 PNG</Button><Button disabled={exporting} onClick={json}>무대 설정 JSON</Button><Button disabled={!model||exporting} onClick={save} variant="primary">무대 설정 저장</Button></div>
  <div className="look-actions"><Button variant="primary" disabled={!model||exporting||!supportedStageWebM()} onClick={record}>{exporting?`WebM 녹화 중 ${Math.round(progress*100)}%`:'공연 영상 WebM 내보내기'}</Button>{exporting&&<Button onClick={()=>abort.current?.abort()}>녹화 취소</Button>}</div>
  <Notice>출력은 **무음 WebM**입니다. 영상 인코딩은 사용 중인 브라우저의 MediaRecorder·WebGL 지원에 따라 달라집니다. 실제 음악 믹스 삽입·Lip Sync는 이 단계에서 지원하지 않습니다. MToon/PBR·물리효과가 없는 Step83 로컬 렌더러와 동일한 3D 모델 제약이 적용됩니다. 원본 파일은 변경하지 않습니다.</Notice>
 </div>;
}
