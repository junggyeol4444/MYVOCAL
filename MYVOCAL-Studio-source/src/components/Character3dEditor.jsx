import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usableDancePlan} from '../lib/characterDanceDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {downloadText} from '../lib/store.js';
import {modelAssets,parseCharacter3d,createRigSettings,saveRigSettings,validateRigSettings,MOTIONS,EXPRESSIONS} from '../lib/character3d.js';
import {Character3dRenderer} from '../lib/character3dRenderer.js';

const motionLabels={idle:'대기 자세',nod:'고개 끄덕이기',wave:'오른팔 흔들기'};
const expressionLabels={neutral:'기본',happy:'웃음',angry:'분노',sad:'슬픔',relaxed:'평온',surprised:'놀람',aa:'아',ih:'이',ou:'우',ee:'에',oh:'오'};
export default function Character3dEditor({character,onSave,notify}){
 const available=modelAssets(character);
 const directedPlan=usableExpressionPlan(character);
 const dancePlan=usableDancePlan(character);
 const performancePlan=usablePerformance89(character);const [assetId,setAssetId]=useState(()=>available.some(x=>x.id===character.rig3d?.assetId)?character.rig3d.assetId:available[0]?.id||'');
 const [settings,setSettings]=useState(()=>{try{const saved=character.rig3d;if(saved&&available.some(a=>a.id===saved.assetId)){validateRigSettings(character,saved);return {...saved};}}catch{}return createRigSettings(character,available[0]?.id);});
 const [info,setInfo]=useState('모델 불러오는 중…'),[model,setModel]=useState(null),[playing,setPlaying]=useState(true),[time,setTime]=useState(0);
 const canvas=useRef(null),engine=useRef(null),timer=useRef(0),start=useRef(0),seconds=useRef(0),cfg=useRef(settings),alive=useRef(true);
 cfg.current=settings;
 useEffect(()=>{let cancelled=false;alive.current=true;setModel(null);setInfo('저장된 3D 원본 분석 중…');
  (async()=>{try{const file=await getFile(assetId);if(!file)throw Error('등록된 3D 모델의 원본 파일이 로컬 저장소에 없습니다.');if(file.size>40*1024*1024)throw Error('모델 파일 크기 40MB 초과');
   const parsed=parseCharacter3d(await file.arrayBuffer(),file.name||available.find(a=>a.id===assetId)?.name);
   if(cancelled)return;const view=new Character3dRenderer(canvas.current,parsed);engine.current=view;
   setModel(parsed);setInfo(`${parsed.vrm.version?`VRM ${parsed.vrm.version}`:'glTF 2.0'} · 메시 ${parsed.meshCount}개 · 정점 ${parsed.vertexCount}개 · 본 ${parsed.skins.reduce((n,s)=>n+s.joints.length,0)}개 · 내장 모션 ${parsed.animations.length}개`);
   seconds.current=0;start.current=0;view.render({...cfg.current,assetId},0,null,character.lipSync,directedPlan,character,dancePlan,performancePlan);
  }catch(e){if(!cancelled){setInfo('모델 열기 실패: '+e.message);notify('3D 모델 오류: '+e.message);}}})();
  return ()=>{cancelled=true;alive.current=false;if(engine.current){engine.current.dispose();engine.current=null;}cancelAnimationFrame(timer.current);};
 },[assetId,character.id]);
 useEffect(()=>{
  if(!model||!engine.current)return;
  const tick=now=>{if(!alive.current||!engine.current)return;if(!start.current)start.current=now;
   if(playing){seconds.current=Math.min(3600,seconds.current+(now-start.current)/1000);}
   start.current=now;try{engine.current.render(cfg.current,seconds.current,null,character.lipSync,directedPlan,character,dancePlan,performancePlan);}catch(e){setInfo('3D 렌더링 실패: '+e.message);return;}
   if(Math.floor(now/200)!==Math.floor((now-16)/200))setTime(seconds.current);
   timer.current=requestAnimationFrame(tick);
  };timer.current=requestAnimationFrame(tick);return ()=>{cancelAnimationFrame(timer.current);start.current=0;};
 },[model,playing]);
 const patch=(key,value)=>setSettings(s=>({...s,[key]:value}));
 const choose=id=>{setAssetId(id);try{setSettings(createRigSettings(character,id));}catch(e){notify(e.message);}};
 const reset=()=>{seconds.current=0;setTime(0);try{engine.current?.render(cfg.current,0,null,character.lipSync,directedPlan,character,dancePlan,performancePlan);}catch(e){setInfo(e.message);}};
 const save=()=>{try{const validated={...settings,assetId};const next=saveRigSettings(character,validated);onSave(next);notify('83단계 3D 설정이 캐릭터 프로필에 저장됐습니다. 원본 모델은 변경하지 않았습니다.');}catch(e){notify('3D 설정 저장 실패: '+e.message);}};
 const exportJson=()=>{try{validateRigSettings(character,{...settings,assetId});downloadText(JSON.stringify({format:'MYVOCAL_3D_RIG_STEP83',version:1,characterId:character.id,modelAssetId:assetId,settings:{...settings,assetId},modelSummary:{format:model?.format,vrmVersion:model?.vrm.version,meshCount:model?.meshCount,boneCount:model?.skins.reduce((n,s)=>n+s.joints.length,0)}},null,2),`MYVOCAL-Step83-${character.id}.json`,'application/json');}catch(e){notify(e.message);}};
 const snap=()=>{try{if(!model||!engine.current)throw Error('모델을 먼저 불러오세요.');const a=document.createElement('a');a.download=`MYVOCAL-Step83-${character.id}-preview.png`;a.href=canvas.current.toDataURL('image/png');a.click();}catch(e){notify('PNG 출력 실패: '+e.message);}};
 const bones=model?[...new Set(model.skins.flatMap(s=>s.joints))].map(id=>model.nodes[id]).filter(Boolean):[];
 const boneItems=bones.length?bones:model?.nodes||[];
 const faceBindings=model?.vrm.expressions?.[settings.expression]||[];
 return <div className="modal-form" style={{maxHeight:'75vh',overflowY:'auto'}}>
  <Notice>**STEP83 · 3D 캐릭터 시스템** — 등록한 VRM 0.x/1.0, GLB 또는 데이터 내장 glTF를 로컬 WebGL에서 미리봅니다. 노드·본 회전, VRM 표정(Morph), 대기/끄덕임/손 흔들기, 파일에 들어 있는 glTF 모션을 제어합니다. STEP85 음소 Lip Sync와 STEP87 표정 연출을 저장한 경우 이 미리보기에도 적용됩니다.</Notice>
  <Field label="3D 원본 모델"><select value={assetId} onChange={e=>choose(e.target.value)}>{available.map(a=><option key={a.id} value={a.id}>{a.name} ({Math.ceil((a.size||0)/1024)}KB)</option>)}</select></Field>
  <p role="status" className="muted">{info}</p>
  <canvas ref={canvas} width="620" height="460" role="img" aria-label={`${character.name} 실제 3D WebGL 모델 미리보기`} style={{display:'block',width:'min(100%,620px)',height:'auto',background:'#101626',border:'1px solid #666',borderRadius:8}}/>
  <div className="look-actions"><Button disabled={!model} onClick={()=>setPlaying(v=>!v)}>{playing?'일시정지':'재생'}</Button><Button disabled={!model} onClick={reset}>처음으로</Button><small>재생 {time.toFixed(1)}초 · 모션은 미리보기용</small></div>
  <Field label="기본 모션 프리셋"><select value={settings.motion} onChange={e=>{patch('motion',e.target.value);patch('animation','');}}>{MOTIONS.map(m=><option key={m} value={m}>{motionLabels[m]}</option>)}</select></Field>
  <Field label="모델 자체 내장 애니메이션 (있을 때만)"><select value={settings.animation} disabled={!model} onChange={e=>patch('animation',e.target.value)}><option value="">기본 모션 프리셋 사용</option>{model?.animations.map((a,i)=><option key={i} value={a.name}>{a.name} ({a.duration.toFixed(1)}초)</option>)}</select></Field>
  <Field label="표정 (VRM 표현 정의가 있을 때 동작)"><select value={settings.expression} onChange={e=>patch('expression',e.target.value)}>{EXPRESSIONS.map(e=><option value={e} key={e}>{expressionLabels[e]}</option>)}</select></Field>
  <small>{settings.expression==='neutral'?'기본 표정':faceBindings.length?`표정 Morph 연결 ${faceBindings.length}개`:'이 모델에는 선택한 표정 Morph 바인딩이 없습니다. 외형이 변경되지 않을 수 있습니다.'}</small>
  <Field label={`표정 강도 ${Math.round(settings.expressionWeight*100)}%`}><input type="range" min="0" max="1" step="0.05" value={settings.expressionWeight} onChange={e=>patch('expressionWeight',Number(e.target.value))} style={{width:'100%'}}/></Field>
  <Field label="수동으로 회전할 본/노드"><select value={settings.boneName} onChange={e=>patch('boneName',e.target.value)}><option value="">선택 안 함</option>{boneItems.map(b=><option key={b.index} value={String(b.index)}>{b.name} (node {b.index})</option>)}</select></Field>
  <Field label={`선택 본 Z축 회전 ${settings.boneDegrees}°`}><input type="range" min="-90" max="90" step="1" value={settings.boneDegrees} onChange={e=>patch('boneDegrees',Number(e.target.value))} style={{width:'100%'}}/></Field>
  <div className="form-two">
   <Field label="모션 배속"><input type="number" min="0.1" max="3" step="0.1" value={settings.speed} onChange={e=>{if(e.target.value!=='')patch('speed',Number(e.target.value));}}/></Field>
   <Field label="카메라 좌우 회전 °"><input type="number" min="-180" max="180" step="5" value={settings.yaw} onChange={e=>{if(e.target.value!=='')patch('yaw',Number(e.target.value));}}/></Field>
   <Field label="카메라 상하 회전 °"><input type="number" min="-60" max="60" step="5" value={settings.pitch} onChange={e=>{if(e.target.value!=='')patch('pitch',Number(e.target.value));}}/></Field>
  </div>
  <div className="modal-actions"><Button onClick={snap} disabled={!model}>현재 화면 PNG</Button><Button onClick={exportJson} disabled={!model}>본·표정 설정 JSON</Button><Button variant="primary" onClick={save} disabled={!model}>캐릭터 3D 설정 저장</Button></div>
  <Notice>모델 데이터·텍스처는 PC 내부에서만 읽습니다. 압축 GLB(Draco/Meshopt), 분리된 외부 .bin/텍스처가 필요한 glTF, 일부 VRM 셰이더(MToon)/물리 효과/표정 프리셋은 미지원입니다. **WebGL 프리뷰는 범용 PBR/VRM 완전 렌더러가 아닙니다.** VRM 데이터에 매핑된 본이 없으면 자동 고개·팔 프리셋은 움직이지 않습니다. 완성 MV 렌더링 기능은 포함하지 않습니다.</Notice>
 </div>;
}
