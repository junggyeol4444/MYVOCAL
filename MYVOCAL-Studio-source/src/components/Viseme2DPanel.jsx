import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Panel} from './UI';
import {isAlignmentStale} from '../lib/lyricAlignment';
import {viseme2DAlignment,renderViseme2D} from '../lib/viseme2DClient.js';
import {readMusicGenPreferences} from '../lib/musicGenPreferences.js';
import {getFile,putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {genId} from '../lib/schema';

function download(file){const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name||'MYVOCAL-2D-가사립싱크.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}

// An additive panel inside the EXISTING Windows EXE Singing Workbench.
export default function Viseme2DPanel({project,onChange,notify}){
 const [python,setPython]=useState(()=>{try{return readMusicGenPreferences(window.localStorage).python||''}catch{return ''}});
 const [ffmpeg,setFfmpeg]=useState('');
 const [image,setImage]=useState(null),[audio,setAudio]=useState(null),[soundtrack,setSoundtrack]=useState(null),[sceneMode,setSceneMode]=useState('static'),[rights,setRights]=useState(false);
 const [x,setX]=useState('.5'),[y,setY]=useState('.72'),[mouthWidth,setMouthWidth]=useState('.12');
 const [fps,setFps]=useState('12'),[size,setSize]=useState('512');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>{active.current?.abort();setImage(null);setAudio(null);setSoundtrack(null);setSceneMode('static');setRights(false);setError('');setStatus('')},[project.id]);
 const alignment=project.vocalAlignment&&!isAlignmentStale(project,project.vocalAlignment)?project.vocalAlignment:null;
 let count=0;try{if(alignment)count=viseme2DAlignment(alignment).cues.length}catch{}
 async function create(){
  if(busy)return;
  const original=latest.current;
  if(!alignment||!image||!audio)return setError('가사·MIDI 싱크, 캐릭터 이미지, 보컬 WAV를 모두 선택하세요.');
  const controller=new AbortController();active.current=controller;setBusy(true);setError('');setStatus('실제 보컬 WAV와 한국어 음소를 기준으로 2D WebM 생성 중…');
  let id=null;
  try{
   const file=await renderViseme2D({image,audio,soundtrack,sceneMode,alignment,python,ffmpeg,x:Number(x),y:Number(y),mouthWidth:Number(mouthWidth),fps:Number(fps),size:Number(size),rightsConfirmed:rights},{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 2D 립싱크 취소');
   id=genId('mv_viseme2d');
   await putFilesAtomic([[id,file]]);
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 2D 립싱크 취소');
   await Promise.resolve(onChange({...original,mv2dLipSyncExports:[...(original.mv2dLipSyncExports||[]),{id:genId('mv2d'),assetId:id,name:file.name,createdAt:new Date().toISOString(),type:'video/webm',sourceImageName:image.name}]}));
   id=null;
   download(file);
   setStatus('실제 WebM 영상을 새 프로젝트 자산으로 저장하고 내려받았습니다.');
   notify('2D 가사·립싱크 WebM을 기존 프로젝트에 추가했습니다. 3D·실사 신경망 립싱크는 아닙니다.');
  }catch(e){if(id)await deleteFilesAtomic([id]).catch(()=>{});setError(e.message)}
  finally{active.current=null;setBusy(false)}
 }
 async function downloadSaved(entry){try{const file=await getFile(entry.assetId);if(!file)throw Error('저장된 영상 파일이 없습니다.');download(file)}catch(e){setError(e.message)}}
 return <Panel title="한국어 가사 싱크 → 실제 2D 립싱크 WebM" description="기존 가사·MIDI 싱크에 맞춰 2D 캐릭터 입 모양과 음악 전체 WAV를 실제 영상으로 렌더링합니다.">
  <p className="muted">사용 권한이 있는 캐릭터 이미지와 보컬 WAV를 사용합니다. 입력 원본을 수정하지 않고 새 WebM을 만듭니다. 실제 보컬 WAV는 입 모양 계산에만 사용하고, 전체 음악 WAV를 선택하면 완성된 음악을 영상 오디오로 사용합니다. 2D 입 모양 오버레이이며 얼굴 학습·실사/3D 신경망 애니메이션은 아닙니다.</p>
  <div className="mv10-grid">
   <Field label="설치된 Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\\AI\\python.exe"/></Field>
   <Field label="설치된 FFmpeg.exe"><input value={ffmpeg} disabled={busy} onChange={e=>setFfmpeg(e.target.value)} placeholder="D:\\ffmpeg\\bin\\ffmpeg.exe"/></Field>
   <Field label="캐릭터 이미지 PNG/JPEG"><input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" disabled={busy} onChange={e=>setImage(e.target.files?.[0]||null)}/></Field>
   <Field label="보컬 WAV (입 모양 동기화용)"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={e=>setAudio(e.target.files?.[0]||null)}/></Field>
   <Field label="전체 음악·반주 믹싱 WAV (선택, 영상에 실제 삽입)"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={e=>setSoundtrack(e.target.files?.[0]||null)}/></Field>
   <Field label="2D MV 장면 연출"><select disabled={busy} value={sceneMode} onChange={e=>setSceneMode(e.target.value)}><option value="static">기존 고정 화면</option><option value="performance">공연 - 부드러운 움직임</option><option value="story">스토리 - 확대 및 이동</option><option value="mixed">혼합 - 4초 구간별 전환</option></select></Field>
   <Field label="입 중심 가로 비율 (0.1~0.9)"><input type="number" min="0.1" max="0.9" step="0.01" value={x} disabled={busy} onChange={e=>setX(e.target.value)}/></Field>
   <Field label="입 중심 세로 비율 (0.1~0.9)"><input type="number" min="0.1" max="0.9" step="0.01" value={y} disabled={busy} onChange={e=>setY(e.target.value)}/></Field>
   <Field label="입 너비 비율 (0.03~0.30)"><input type="number" min="0.03" max="0.30" step="0.01" value={mouthWidth} disabled={busy} onChange={e=>setMouthWidth(e.target.value)}/></Field>
   <Field label="영상 FPS"><select value={fps} disabled={busy} onChange={e=>setFps(e.target.value)}><option value="12">12</option><option value="24">24</option></select></Field>
   <Field label="정사각형 영상 해상도"><select value={size} disabled={busy} onChange={e=>setSize(e.target.value)}><option value="512">512px</option><option value="720">720px</option></select></Field>
  </div>
  <label className="check-item"><input type="checkbox" checked={rights} disabled={busy} onChange={e=>setRights(e.target.checked)}/>이미지와 보컬 사용 권한을 확인했습니다.</label>
  <p className="muted">기존 가사·MIDI 싱크: {count}개. Python에 numpy, soundfile, Pillow가 설치돼 있어야 합니다. FFmpeg는 로컬 실행 파일을 사용합니다.</p>
  <div className="mv7-actions"><Button disabled={busy||!count||!image||!audio||!rights||!python||!ffmpeg} onClick={create}>{busy?'렌더링 중':'실제 2D 립싱크 WebM 생성·저장'}</Button>{busy&&<Button onClick={()=>active.current?.abort()}>영상 렌더링 취소</Button>}</div>
  {(project.mv2dLipSyncExports||[]).map(e=><div key={e.id}><Button disabled={busy} onClick={()=>downloadSaved(e)}>저장된 2D 영상 다시 받기 · {e.name}</Button></div>)}
  {status&&<p role="status" className="muted">{status}</p>}{error&&<p role="alert" className="mv4-error">{error}</p>}
 </Panel>;
}
