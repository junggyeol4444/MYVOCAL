import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {detectFaceLandmarks28,suggestFaceLandmarkLayers28} from '../lib/characterFaceLandmarks28.js';
import {downloadText} from '../lib/store.js';
import {eligibleLayerImages,measureOpacityBounds,proposeLayerPlan,validateLayerPlan,changeLayerPart,saveLayerPlan,layerManifest,LAYER_KEYS,LAYER_LABELS,MAX_LAYER_PIXELS,MAX_LAYER_SIDE} from '../lib/characterLayers.js';

// Layer preparation in Step81 is rectangular source-pixel isolation, not automatic semantic segmentation.
export default function CharacterLayerEditor({character,onSave,notify}){
 const available=eligibleLayerImages(character);
 const [sourceId,setSourceId]=useState(character.layerPlan?.sourceAssetId||available[0]?.id||'');
 const [plan,setPlan]=useState(null),[image,setImage]=useState(null),[imageUrl,setImageUrl]=useState('');
 const [status,setStatus]=useState('원본 불러오는 중…'),[working,setWorking]=useState(false);
 const [facePython,setFacePython]=useState(''),[faceModel,setFaceModel]=useState('');
 const [faceRights,setFaceRights]=useState(false),[faceBusy,setFaceBusy]=useState(false);
 const [faceStatus,setFaceStatus]=useState('등록한 원본 그림과 로컬 FaceLandmarker 모델이 필요합니다.');
 const faceAbort=useRef(null),currentSource=useRef(sourceId);
 currentSource.current=sourceId;
 useEffect(()=>()=>faceAbort.current?.abort(),[]);
 const analyzeFace=async()=>{
  if(faceBusy||working||!plan)return;
  const source=sourceId,snapshot=JSON.stringify(plan),controller=new AbortController();
  faceAbort.current=controller;setFaceBusy(true);
  setFaceStatus('실제 로컬 FaceLandmarker로 2D 눈·입 특징점 분석 중…');
  try{
   if(plan.reviewed)throw Error('기존 검토 완료 레이어는 보존합니다. 새로운 원본 이미지로 시작하거나 좌표를 직접 편집하세요.');
   const imageFile=await getFile(source);
   if(!(imageFile instanceof Blob))throw Error('원본 IndexedDB 파일을 찾을 수 없습니다.');
   const result=await detectFaceLandmarks28(character,source,imageFile,{
    python:facePython,model:faceModel,rightsConfirmed:faceRights,
    session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal
   });
   if(controller.signal.aborted||currentSource.current!==source||JSON.stringify(plan)!==snapshot)
    throw Error('분석 중 원본 또는 레이어 좌표가 바뀌었습니다. 기존 작업을 보존합니다.');
   const candidate=suggestFaceLandmarkLayers28(character,plan,result);
   setPlan(candidate);
   setFaceStatus('실제 얼굴·눈·입 4개 영역을 검출해 후보 좌표에 반영했습니다. 기존 몸·머리카락 추정과 사용자 원본은 유지합니다. 영역 확인 후 저장하세요.');
  }catch(e){setFaceStatus('실제 얼굴 분석 중단: '+e.message);}
  finally{faceAbort.current=null;setFaceBusy(false);}
 };

 useEffect(()=>{
  let cancelled=false;let url='';
  setImage(null);setImageUrl('');setPlan(null);setStatus('원본 이미지 분석 중…');
  const load=async()=>{
   try{
    const meta=available.find(a=>a.id===sourceId);
    if(!meta)throw Error('등록된 사용 권한 있는 2D 원본 PNG/JPEG/WebP를 선택하세요.');
    const blob=await getFile(sourceId);
    if(!blob)throw Error('로컬 원본 그림 파일이 없습니다. 캐릭터를 다시 등록하세요.');
    url=URL.createObjectURL(blob);
    const img=await new Promise((resolve,reject)=>{
     const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('이미지를 읽을 수 없습니다.'));el.src=url;
    });
    if(cancelled)return;
    const w=img.naturalWidth,h=img.naturalHeight;
    if(w<1||h<1||w>MAX_LAYER_SIDE||h>MAX_LAYER_SIDE||w*h>MAX_LAYER_PIXELS)throw Error('원본은 한 변 4096px, 총 1,200만 픽셀 이하 PNG/JPEG/WebP만 지원합니다.');
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('이 환경에서는 Canvas 픽셀 분석을 사용할 수 없습니다.');
    ctx.drawImage(img,0,0,w,h);
    const pixels=ctx.getImageData(0,0,w,h).data;
    const bounds=measureOpacityBounds(pixels,w,h);
    const existing=character.layerPlan;
    let proposal=proposeLayerPlan(character,sourceId,w,h,bounds);
    if(existing&&existing.sourceAssetId===sourceId&&existing.width===w&&existing.height===h){
     try{validateLayerPlan(character,existing);proposal=existing;}catch{/* prefer safe new guide */}
    }
    if(cancelled)return;
    setImage(img);setImageUrl(url);setPlan(proposal);
    setStatus(bounds.transparentMargin?'투명 픽셀 외곽을 측정했습니다. 눈·입·얼굴 영역은 비율 기반 추정이므로 직접 교정하세요.':'불투명 배경/전체 실루엣입니다. 얼굴·머리·몸 후보 영역은 위치 기반 추정이며 직접 교정이 필수입니다.');
   }catch(e){if(!cancelled)setStatus('분석 실패: '+e.message);}
  };load();
  return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
 },[character.id,sourceId]);
 const change=(key,field,value)=>{
  try{
   if(value==='')return;
   const v=field==='enabled'?!!value:field.startsWith('pivot')?Number(value):Number(value);
   setPlan(changeLayerPart(character,plan,key,{[field]:v}));
  }catch(e){notify('영역 수정 오류: '+e.message);}
 };
 const save=()=>{
  try{
   const next=saveLayerPlan(character,plan);onSave(next);
   setPlan(next.layerPlan);notify('Step81 2D 레이어 구조를 캐릭터 프로필에 저장했습니다. 원본 그림은 유지됩니다.');
  }catch(e){notify('레이어 저장 실패: '+e.message);}
 };
 const downloadManifest=()=>{
  try{const manifest=layerManifest(character,plan);downloadText(JSON.stringify(manifest,null,2),`MYVOCAL-layers-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,'application/json');}
  catch(e){notify('분석 JSON 내보내기 실패: '+e.message);}
 };
 const exportPng=async(key)=>{
  if(working)return;
  try{
   validateLayerPlan(character,plan);
   if(!image||!imageUrl)throw Error('원본 그림 로딩이 완료되지 않았습니다.');
   const part=plan.parts[key];if(!part.enabled)throw Error('비활성 영역은 PNG로 내보낼 수 없습니다.');
   setWorking(true);
   const cv=document.createElement('canvas');cv.width=part.w;cv.height=part.h;
   const ctx=cv.getContext('2d');if(!ctx)throw Error('Canvas를 사용할 수 없습니다.');
   ctx.clearRect(0,0,part.w,part.h);
   ctx.drawImage(image,part.x,part.y,part.w,part.h,0,0,part.w,part.h);
   const png=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('PNG 저장에 실패했습니다.')),'image/png'));
   const url=URL.createObjectURL(png);
   const a=document.createElement('a');a.href=url;a.download=`MYVOCAL-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${key}.png`;document.body.appendChild(a);a.click();a.remove();
   // Revoke on following task, not before the browser initiates the download.
   await new Promise(resolve=>setTimeout(resolve,500));URL.revokeObjectURL(url);
   notify(`${LAYER_LABELS[key]} 직사각 영역 PNG를 내보냈습니다. 실제 부위 마스크/가려진 영역 복원은 적용되지 않습니다.`);
  }catch(e){notify('레이어 PNG 출력 실패: '+e.message);}
  finally{setWorking(false);}
 };
 if(!available.length)return <Notice>Step81은 사용 권한을 등록한 2D 캐릭터와 PNG/JPEG/WebP 원본에만 적용됩니다. 실제 사람·3D 모델은 이 단계의 대상이 아닙니다.</Notice>;
 return <div className="modal-form" style={{maxHeight:'72vh',overflowY:'auto'}}>
  <Notice>**Step81 — 2D 캐릭터 레이어 구조 준비.** 투명 픽셀·기존 비율 추정에 더해 설치된 로컬 FaceLandmarker의 실제 눈·입·얼굴 검출을 선택적으로 지원합니다. 자동 의미론적 부위 분할 또는 독립 레이어 복원은 아닙니다. 결과를 수동 수정하고 검토 저장한 뒤 STEP82에서 2D 애니메이션을 만듭니다.</Notice>
  <Field label="분석할 원본 이미지"><select value={sourceId} onChange={e=>setSourceId(e.target.value)}>{available.map(a=><option key={a.id} value={a.id}>{a.name} · {a.role||'other'}</option>)}</select></Field>
  <p role="status" className="muted">{status}</p>
  <div className="mv7-item">
   <strong>원본 28항 · 실제 로컬 얼굴 특징점 기반 레이어 후보 추출</strong>
   <Field label="Windows Python.exe 절대 경로"><input value={facePython} disabled={faceBusy} onChange={e=>setFacePython(e.target.value)} placeholder="C:\\Python311\\python.exe"/></Field>
   <Field label="설치된 MediaPipe FaceLandmarker .task 모델"><input value={faceModel} disabled={faceBusy} onChange={e=>setFaceModel(e.target.value)} placeholder="C:\\Models\\face_landmarker.task"/></Field>
   <label><input type="checkbox" checked={faceRights} disabled={faceBusy} onChange={e=>setFaceRights(e.target.checked)}/> 본인 창작 또는 분석 권한이 있는 캐릭터 그림입니다.</label>
   <div className="hstack">
    <Button disabled={faceBusy||working||!plan||plan.reviewed||!faceRights||!facePython||!faceModel} onClick={analyzeFace}>{faceBusy?'FaceLandmarker 실제 분석 중…':'실제 눈·입·얼굴 위치 분석'}</Button>
    {faceBusy&&<Button onClick={()=>faceAbort.current?.abort()}>분석 취소</Button>}
   </div>
   <p role="status">{faceStatus}</p>
   <Notice>설치된 오프라인 FaceLandmarker가 2D 캐릭터의 얼굴을 검출할 경우에만 실제 특징점 좌표를 반영합니다. 결과는 저장 전 후보이며 사용자 검토가 필요합니다. 독립 투명 스프라이트·숨은 픽셀 복원이나 완전한 자동 의미론적 레이어 분리를 보증하지 않습니다.</Notice>
  </div>
  {plan&&imageUrl&&<>
   <small>원본 {plan.width}×{plan.height}px · 추정 방식: 투명 영역 경계 + 비율 가이드 · {plan.reviewed?'사용자 검토 저장됨':'미확정 후보 영역'}</small>
   <div style={{position:'relative',width:'min(100%,360px)',margin:'8px auto',lineHeight:0,overflow:'hidden',background:'repeating-conic-gradient(#777 0 25%, #bbb 0 50%) 50%/18px 18px'}} aria-label="원본 이미지 위 2D 레이어 영역 표시">
    <img src={imageUrl} alt={`${character.name} 원본 캐릭터 일러스트`} style={{display:'block',width:'100%',height:'auto'}}/>
    {LAYER_KEYS.map((key,i)=>{const r=plan.parts[key];return r.enabled&&<div key={key} title={LAYER_LABELS[key]} style={{position:'absolute',left:`${r.x/plan.width*100}%`,top:`${r.y/plan.height*100}%`,width:`${r.w/plan.width*100}%`,height:`${r.h/plan.height*100}%`,border:`${i===0?2:1}px solid hsl(${i*48+10},95%,54%)`,background:`hsla(${i*48+10},95%,54%,0.10)`,boxSizing:'border-box',pointerEvents:'none'}}/>;})}
   </div>
   {LAYER_KEYS.map(key=>{const p=plan.parts[key];return <div key={key} className="look-overview">
    <div className="look-actions"><strong>{LAYER_LABELS[key]}</strong><label><input type="checkbox" checked={p.enabled} onChange={e=>change(key,'enabled',e.target.checked)}/> 사용</label><Button disabled={working||!p.enabled} onClick={()=>exportPng(key)}>영역 PNG 추출</Button></div>
    <div className="form-two">{['x','y','w','h'].map(field=><Field key={field} label={`${field.toUpperCase()} (px)`}><input type="number" min={field==='w'||field==='h'?1:0} step="1" value={p[field]} onChange={e=>change(key,field,e.target.value)}/></Field>)}</div>
    <div className="form-two">{['pivotX','pivotY'].map(field=><Field key={field} label={`${field==='pivotX'?'중심점 X':'중심점 Y'} (0~1)`}><input type="number" min="0" max="1" step="0.01" value={p[field]} onChange={e=>change(key,field,e.target.value)}/></Field>)}</div>
   </div>;})}
   <div className="modal-actions"><Button onClick={downloadManifest}>레이어 분석 JSON</Button><Button variant="primary" icon="save" onClick={save}>6개 레이어 구조 검토·저장</Button></div>
   <Notice>PNG는 사각형 영역의 원본 픽셀 복사본입니다. 평면 JPG에는 배경 픽셀도 포함되며, 얼굴의 눈/입이 자동 제거되거나 가려진 픽셀이 복원되지 않습니다. 투명한 독립 리깅용 레이어를 보장하지 않습니다. 저장한 영역 좌표는 이후 단계에서 참고할 수 있습니다.</Notice>
  </>}
 </div>;
}
