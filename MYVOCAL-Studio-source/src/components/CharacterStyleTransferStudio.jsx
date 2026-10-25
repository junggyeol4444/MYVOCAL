import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Panel,Notice,AssetPreview} from './UI';
import {personPhotoAssets} from '../lib/imageToMv.js';
import {characterArtworkAssets} from '../lib/characterToMv.js';
import {checkComfy} from '../lib/mvSceneImages.js';
import {VISUAL_STYLES,generateStyleTransferCandidates,saveStyleTransferSelection} from '../lib/characterStyleTransfer.js';

// 원본 42·43항: 기존 Windows EXE 로컬 ComfyUI 실제 모델만 사용한다.
// 변환 후보는 아직 저장된 자산이 아니며, 선택한 이미지 한 개만 추가된다.
export default function CharacterStyleTransferStudio({profile,onSave,notify,existingIds=[]}){
 const [port,setPort]=useState('8188'),[checkpoints,setCheckpoints]=useState([]),[checkpoint,setCheckpoint]=useState('');
 const [style,setStyle]=useState(profile?.kind==='person'?'anime':'realistic');
 const [sourceId,setSourceId]=useState(''),[denoise,setDenoise]=useState(.5),[seed,setSeed]=useState('');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const [bundle,setBundle]=useState(null),[selected,setSelected]=useState(-1);
 const [images,setImages]=useState([]);
 const latest=useRef(profile);latest.current=profile;
 const controller=useRef(null),urls=useRef([]);
 const clear=()=>{
  urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];
  setImages([]);setBundle(null);setSelected(-1);
 };
 useEffect(()=>()=>{controller.current?.abort();urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];},[]);
 const assets=profile?.kind==='person'?personPhotoAssets(profile):characterArtworkAssets(profile||{});
 const chosenAsset=sourceId&&assets.some(a=>a.id===sourceId)?sourceId:assets[0]?.id||'';
 const session=()=>typeof window==='undefined'?'':window.__MYVOCAL_SESSION_KEY||'';
 const availableStyles=profile?.kind==='person'?Object.entries(VISUAL_STYLES):[['realistic',VISUAL_STYLES.realistic]];
 const probe=async()=>{
  if(busy)return;
  setBusy(true);setStatus('기존 Windows EXE에서 설치된 로컬 SD 모델 목록을 조회합니다.');
  try{
   if(!session())throw Error('MYVOCAL Windows EXE 내부 세션이 필요합니다.');
   const health=await checkComfy(Number(port),session());
   if(!Array.isArray(health.checkpoints)||!health.checkpoints.length)
    throw Error('사용자 PC에 설치된 SD 체크포인트가 확인되지 않았습니다.');
   setCheckpoints(health.checkpoints);
   setCheckpoint(health.checkpoints.includes(checkpoint)?checkpoint:health.checkpoints[0]);
   setStatus('로컬 모델 '+health.checkpoints.length+'개 확인. 원본 자료를 수정하지 않습니다.');
  }catch(error){setStatus('SD 모델 조회 실패: '+error.message);}
  finally{setBusy(false);}
 };
 const generate=async()=>{
  if(busy)return;
  const abort=new AbortController();controller.current=abort;
  clear();setBusy(true);
  try{
   const seedValue=seed.trim()===''?Math.floor(Math.random()*2000000000):Number(seed);
   const result=await generateStyleTransferCandidates(profile,{
    assetId:chosenAsset,style,port:Number(port),checkpoint,denoise,seed:seedValue,consent
   },{
    current:()=>latest.current,session:session(),signal:abort.signal,
    onProgress:(done,total,detail)=>setStatus('SD 변환 '+done+'/'+total+' · '+detail)
   });
   const created=result.candidates.map((c,i)=>{
    const url=URL.createObjectURL(c.blob);urls.current.push(url);
    return {...c,url,index:i};
   });
   setBundle(result);setImages(created);setSelected(0);
   setStatus('실제 SD 후보 4개 생성 완료. 선택한 한 장만 새 자산으로 저장할 수 있습니다.');
  }catch(error){setStatus('원본 보존 · 스타일 변환 중단: '+error.message);}
  finally{setBusy(false);controller.current=null;}
 };
 const saveSelection=async()=>{
  if(busy||!bundle||selected<0)return;
  setBusy(true);setStatus('선택한 이미지 1개를 신규 자료로 저장하고 있습니다.');
  try{
   const saved=await saveStyleTransferSelection(profile,bundle,selected,{
    current:()=>latest.current,existingIds,onSave
   });
   notify?.(saved.derivedProfile?
    '원본 인물은 그대로 유지하고 파생 캐릭터 프로필을 새로 등록했습니다.':
    '원본 캐릭터 프로필에 실사풍 이미지를 새 자료로 추가했습니다.');
  }catch(e){setStatus('저장 실패 · 기존 프로필과 파일 유지: '+e.message);}
  finally{setBusy(false);}
 };
 if(!profile||!['person','character'].includes(profile.kind))return <p>선택한 사람 또는 2D 캐릭터가 없습니다.</p>;
 return <Panel title={profile.kind==='person'?'원본 42항 · 실제 사람을 캐릭터화':'원본 43항 · 내 캐릭터를 실사풍으로'}
  description="설치된 로컬 SD img2img를 사용합니다. 실제 생성 이미지 4개를 고른 뒤 원본을 덮어쓰지 않고 저장합니다.">
  <Notice>기존 사진·그림 파일은 읽기만 합니다. 얼굴·캐릭터의 실제 동일성을 AI가 완전히 유지한다는 보장은 없습니다. 3D 렌더풍은 2D 이미지이며 VRM·3D 모델이 아닙니다.</Notice>
  {profile.kind==='person'&&<label className="check-item"><input type="checkbox" disabled={busy} checked={consent} onChange={e=>{setConsent(e.target.checked);clear();}}/>
   본인 또는 사용 허가 인물 사진과 파생 캐릭터 제작 권한을 확인합니다.</label>}
  <Field label="변환 표현 스타일">
   <select disabled={busy} value={style} onChange={e=>{setStyle(e.target.value);clear();}}>
    {availableStyles.map(([key,value])=><option key={key} value={key}>{value.label}</option>)}
   </select>
  </Field>
  <Field label="기존 등록 원본 사진·캐릭터 그림">
   <select disabled={busy} value={chosenAsset} onChange={e=>{setSourceId(e.target.value);clear();}}>
    {assets.map(a=><option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
   </select>
  </Field>
  {chosenAsset&&<div style={{maxWidth:200}}><AssetPreview id={chosenAsset}/></div>}
  <div className="form-two">
   <Field label="ComfyUI 포트"><input disabled={busy} value={port} onChange={e=>{setPort(e.target.value);clear();}}/></Field>
   <Field label="img2img 변환 강도 (0.15~0.75)"><input type="number" min=".15" max=".75" step=".05" disabled={busy} value={denoise}
    onChange={e=>{setDenoise(Number(e.target.value));clear();}}/></Field>
   <Field label="후보 첫 시드 (빈칸이면 자동)"><input disabled={busy} value={seed} onChange={e=>{setSeed(e.target.value);clear();}} placeholder="자동 시드"/></Field>
  </div>
  <Button disabled={busy} onClick={probe}>Windows 로컬 SD 모델 목록 조회</Button>
  <Field label="설치된 실제 SD 모델">
   <select disabled={busy} value={checkpoint} onChange={e=>{setCheckpoint(e.target.value);clear();}}>
    <option value="">로컬 모델 선택</option>
    {checkpoints.map(x=><option key={x} value={x}>{x}</option>)}
   </select>
  </Field>
  <div className="look-actions">
   <Button variant="primary" disabled={busy||!chosenAsset||!checkpoint||(profile.kind==='person'&&!consent)}
    onClick={generate}>{busy?'로컬 AI 작업 중…':'실제 AI 스타일 후보 4장 생성'}</Button>
   {busy&&<Button onClick={()=>controller.current?.abort()}>생성 취소</Button>}
  </div>
  {!!images.length&&<div className="asset-grid" aria-label="AI 스타일 변환 이미지 후보">
   {images.map((item,index)=><label className="asset-card" key={item.seed} style={{cursor:'pointer',padding:10}}>
    <input type="radio" name="style-transfer-choice" checked={selected===index} disabled={busy}
     onChange={()=>setSelected(index)}/>
    <img src={item.url} alt={'로컬 SD 변환 후보 '+(index+1)} style={{maxWidth:'100%',maxHeight:270}}/>
    이미지 {index+1} / 시드 {item.seed}
   </label>)}
  </div>}
  {bundle&&<Button variant="primary" disabled={busy||selected<0} onClick={saveSelection}>
   {profile.kind==='person'?'선택 결과로 새 캐릭터 프로필 생성':'실사풍 이미지를 기존 캐릭터에 새 자산으로 추가'}
  </Button>}
  <p className="muted" role="status">{status||'변환 이미지를 생성하려면 실제 로컬 SD 엔진을 선택하세요.'}</p>
 </Panel>;
}
