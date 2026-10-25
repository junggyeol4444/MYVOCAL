import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,AssetPreview} from './UI';
import {characterArtworkAssets} from '../lib/characterToMv.js';
import {checkComfy} from '../lib/mvSceneImages.js';
import {generateNeuralLookCandidates,saveSelectedNeuralLook} from '../lib/characterLookNeural.js';

const CATEGORY=[['outfit','의상'],['hair','머리 모양'],['accessories','장신구·안경·모자·마이크']];
export default function CharacterOutfitStudio({character,lookId,onSave,notify}){
 const [category,setCategory]=useState('outfit'),[description,setDescription]=useState('');
 const [sourceId,setSourceId]=useState(''),[port,setPort]=useState('8188');
 const [checkpoints,setCheckpoints]=useState([]),[checkpoint,setCheckpoint]=useState('');
 const [denoise,setDenoise]=useState(.35),[seed,setSeed]=useState('');
 const [candidates,setCandidates]=useState([]),[bundle,setBundle]=useState(null),[selected,setSelected]=useState(-1);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const current=useRef(character);current.current=character;
 const abort=useRef(null),urls=useRef(new Set());
 useEffect(()=>()=>{abort.current?.abort();for(const u of urls.current)URL.revokeObjectURL(u);urls.current.clear();},[]);
 const sources=characterArtworkAssets(character||{}),look=character?.looks?.find(l=>l.id===lookId);
 const actualSource=sourceId||look?.referenceAssetId||sources[0]?.id||'';
 const clear=()=>{setBundle(null);setCandidates([]);setSelected(-1);};
 const readSession=()=>globalThis.window?.__MYVOCAL_SESSION_KEY||'';
 const probe=async()=>{
  if(busy)return;
  setBusy(true);setStatus('사용자가 설치한 ComfyUI SD 모델 목록 조회 중');
  try{
   const session=readSession();if(!session)throw Error('Windows EXE 내부 세션이 필요합니다.');
   const result=await checkComfy(Number(port),session);
   if(!result.checkpoints?.length)throw Error('설치된 로컬 SD 체크포인트가 없습니다.');
   setCheckpoints(result.checkpoints);setCheckpoint(result.checkpoints.includes(checkpoint)?checkpoint:result.checkpoints[0]);
   setStatus('실제 설치된 체크포인트 '+result.checkpoints.length+'개 확인');
  }catch(e){setStatus('모델 확인 실패: '+e.message);}
  finally{setBusy(false);}
 };
 const generate=async()=>{
  if(busy)return;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);clear();
  try{
   const result=await generateNeuralLookCandidates(character,lookId,{
    sourceAssetId:actualSource,category,description,port:Number(port),checkpoint,denoise,
    seed:seed.trim()?Number(seed):Math.floor(Math.random()*2000000000)
   },{
    session:readSession(),signal:controller.signal,current:()=>current.current,
    onProgress:(done,total,message)=>setStatus(done+'/'+total+' · '+message)
   });
   const items=result.candidates.map(c=>{
    const url=URL.createObjectURL(c.image);urls.current.add(url);return {...c,url};
   });
   setBundle(result);setCandidates(items);setSelected(0);
   setStatus('실제 로컬 SD 후보 4장 생성됨. 선택한 1장만 원본과 별도 저장합니다.');
  }catch(e){setStatus('생성 중단: '+e.message);}
  finally{abort.current=null;setBusy(false);}
 };
 const save=async()=>{
  if(!bundle||selected<0||busy)return;
  setBusy(true);setStatus('선택된 실제 이미지 새 자산으로 저장 중');
  try{
   const result=await saveSelectedNeuralLook(character,bundle,selected,{current:()=>current.current,onSave});
   notify?.('실제 이미지 선택 저장 완료 · '+result.fileName+' / 기존 원화·룩 유지');
  }catch(e){setStatus('기존 자산 보호 · 저장 중단: '+e.message);}
  finally{setBusy(false);}
 };
 if(!character||!look)return <p role="alert">선택한 캐릭터 또는 룩 프리셋이 없습니다.</p>;
 return <Panel title="원본 44·45항 · 실제 캐릭터 의상·머리·장신구 AI 제작"
  description="기존 Windows EXE에 연결된 ComfyUI img2img로 등록 원화를 참조해 후보 4개를 실제 생성합니다. 선택한 1개만 새 자산으로 저장합니다.">
  <Notice>외형 유지 명령은 SD 모델의 목표이며 얼굴·눈·체형·색상의 실제 일관성을 보장하지 않습니다. 기존 파일·룩·프로젝트는 덮어쓰지 않습니다.</Notice>
  <Field label="변경 유형"><select disabled={busy} value={category} onChange={e=>{setCategory(e.target.value);clear();}}>
   {CATEGORY.map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></Field>
  <Field label="한국어 제작 지시"><textarea value={description} maxLength={230} rows={3} disabled={busy}
   onChange={e=>{setDescription(e.target.value);clear();}} placeholder="검은색 록 공연 의상, 붉은 스티치, 실버 버튼"/></Field>
  <Field label="사용 허가된 캐릭터 원화"><select disabled={busy} value={actualSource}
   onChange={e=>{setSourceId(e.target.value);clear();}}>{sources.map(a=><option value={a.id} key={a.id}>{a.name} · {a.role}</option>)}</select></Field>
  {actualSource&&<div style={{maxWidth:180}}><AssetPreview id={actualSource}/></div>}
  <div className="form-two">
   <Field label="로컬 ComfyUI 포트"><input value={port} disabled={busy} onChange={e=>{setPort(e.target.value);clear();}}/></Field>
   <Field label="변환 강도 (0.15~0.75)"><input type="number" step=".05" min=".15" max=".75" value={denoise} disabled={busy}
    onChange={e=>{setDenoise(Number(e.target.value));clear();}}/></Field>
   <Field label="이미지 시드 (비우면 자동)"><input value={seed} disabled={busy} onChange={e=>{setSeed(e.target.value);clear();}} placeholder="자동"/></Field>
  </div>
  <Button disabled={busy} onClick={probe}>설치된 로컬 SD 체크포인트 확인</Button>
  <Field label="실제 설치된 SD 모델"><select disabled={busy} value={checkpoint}
   onChange={e=>{setCheckpoint(e.target.value);clear();}}>
   <option value="">먼저 모델 확인</option>{checkpoints.map(x=><option value={x} key={x}>{x}</option>)}</select></Field>
  <div className="look-actions">
   <Button variant="primary" disabled={busy||!description.trim()||!actualSource||!checkpoint} onClick={generate}>
    {busy?'로컬 이미지 처리 중':'실제 4개 AI 후보 생성'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>생성 취소</Button>}
  </div>
  {candidates.length>0&&<div className="asset-grid" aria-label="실제 SD 후보 4개">
   {candidates.map((c,i)=><label key={c.seed} className="asset-card" style={{padding:10,cursor:'pointer'}}>
    <input type="radio" name="neural-look-selection" checked={selected===i} disabled={busy} onChange={()=>setSelected(i)}/>
    <img src={c.url} alt={'실제 생성한 캐릭터 '+CATEGORY.find(x=>x[0]===category)?.[1]+' 후보 '+(i+1)} style={{maxWidth:'100%',maxHeight:280}}/>
    후보 {i+1} · 시드 {c.seed}</label>)}
  </div>}
  {bundle&&<Button variant="primary" disabled={busy||selected<0} onClick={save}>선택한 결과 1장만 새 캐릭터 자료로 저장</Button>}
  <p role="status" className="muted">{status||'ComfyUI 및 SD 모델 설치와 사용자 자료 권한이 필요합니다.'}</p>
 </Panel>;
}
