import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {PV95_STYLES,PV95_EFFECTS,validatePv95,savePv95,pv95Frame,pv95Duration,pv95Cues,renderPv95Canvas} from '../lib/vocalSynthPv95.js';
const defaults={version:1,style:'Anime',effect:'pulse',lyricPosition:'lower',fps:24,intensity:.6};
export default function Pv95Editor({project,onSave,notify}){
 const canvas=useRef(null),images=useRef(new Map()),recording=useRef(null),recordingCancelled=useRef(false);
 const [imageRevision,setImageRevision]=useState(0);
 const [pos,setPos]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('로컬 PV 미리보기 준비');
 const [settings,setSettings]=useState(()=>{try{validatePv95(project.pv95);return {...project.pv95};}catch{return {...defaults};}});
 let duration=0;try{duration=pv95Duration(project);}catch{}
 const capped=Math.min(duration,30);
 useEffect(()=>{let alive=true;const objects=[];images.current=new Map();
  (async()=>{for(const s of project.scenes||[]){if(!s.imageAssetId)continue;try{const file=await getFile(s.imageAssetId);if(!file||!alive)continue;const url=URL.createObjectURL(file);objects.push(url);const img=new Image();img.src=url;await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});if(alive)images.current.set(s.id,img);}catch{/* missing image remains a visible blank background */}}
   if(alive){setImageRevision(i=>i+1);setStatus('장면 이미지 로드 완료 · 가사 정렬 없으면 장면 제목으로 대체');}})();
  return ()=>{alive=false;objects.forEach(url=>URL.revokeObjectURL(url));images.current.clear();};
 },[project.id,JSON.stringify((project.scenes||[]).map(s=>[s.id,s.imageAssetId]))]);
 const draw=t=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;try{const frame=pv95Frame(project,t);renderPv95Canvas(ctx,project,settings,t,images.current.get(frame.scene?.id)||null);}catch(e){setStatus(e.message);}};
 useEffect(()=>{draw(Math.min(pos,Math.max(0,duration-.001)));},[pos,settings,project,imageRevision]);
 useEffect(()=>{if(!playing||busy||!duration)return;const began=performance.now(),start=pos;const id=setInterval(()=>{const at=start+(performance.now()-began)/1000;if(at>=duration){setPos(duration);setPlaying(false);}else setPos(at);},40);return ()=>clearInterval(id);},[playing,busy,duration]);
 useEffect(()=>()=>{recordingCancelled.current=true;if(recording.current?.state==='recording')recording.current.stop();},[]);
 const update=(key,value)=>setSettings(v=>({...v,[key]:value}));
 const exportWebm=async()=>{if(busy)return;recordingCancelled.current=false;setPlaying(false);setBusy(true);setStatus('WebM 출력 준비 중…');let stream=null,rec=null,timer=null;
  try{validatePv95(settings);if(!duration||duration>30)throw Error('WebM 출력은 최대 30초 장면에 한합니다. 장면 길이를 먼저 조정하세요.');
   if(!canvas.current?.captureStream||typeof MediaRecorder==='undefined')throw Error('브라우저가 Canvas.captureStream/MediaRecorder를 지원하지 않습니다.');
   if(typeof MediaRecorder.isTypeSupported==='function'&&!MediaRecorder.isTypeSupported('video/webm'))throw Error('WebM 인코딩을 지원하지 않습니다.');
   const fps=settings.fps;draw(0);stream=canvas.current.captureStream(fps);const parts=[];
   const finished=new Promise((resolve,reject)=>{rec=new MediaRecorder(stream,{mimeType:'video/webm'});recording.current=rec;rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};rec.onerror=e=>reject(new Error(e?.error?.message||'녹화 오류'));rec.onstop=resolve;});
   rec.start();let frame=0;const start=performance.now();
   timer=setInterval(()=>{const t=Math.min(duration,(performance.now()-start)/1000);draw(t);setPos(t);frame++;if(t>=duration){clearInterval(timer);timer=null;if(rec.state!=='inactive')rec.stop();}},1000/fps);
   await finished;if(recordingCancelled.current)throw Error('취소되어 영상 파일을 저장하지 않았습니다.');if(!parts.length)throw Error('영상 데이터가 생성되지 않았습니다.');
   const blob=new Blob(parts,{type:'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`MYVOCAL-PV95-${String(project.title||'project').replace(/[^a-zA-Z0-9가-힣_-]/g,'_')}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);setStatus('무음 PV WebM 저장 완료 · 실제 재생·화질은 별도 확인 필요');
  }catch(e){setStatus('WebM 생성 실패: '+e.message);notify('PV 영상 출력 실패: '+e.message);}finally{if(timer)clearInterval(timer);if(rec?.state==='recording')rec.stop();recording.current=null;stream?.getTracks()?.forEach(t=>t.stop());setBusy(false);}
 };
 const aligned=pv95Cues(project).length;
 return <Panel title="STEP95 · Vocal Synth PV" description="장면 이미지·가사 음표 정렬을 활용한 로컬 2D 효과/타이포그래피 및 무음 WebM 제작. MP4·최종 오디오 합성은 Step98입니다.">
  <div className="form-two"><Field label="PV 스타일"><select aria-label="Step95 PV 스타일" value={settings.style} onChange={e=>update('style',e.target.value)}>{PV95_STYLES.map(s=><option key={s}>{s}</option>)}</select></Field><Field label="시각 효과"><select aria-label="Step95 효과" value={settings.effect} onChange={e=>update('effect',e.target.value)}>{PV95_EFFECTS.map(s=><option key={s} value={s}>{s}</option>)}</select></Field><Field label="가사 위치"><select aria-label="Step95 가사 위치" value={settings.lyricPosition} onChange={e=>update('lyricPosition',e.target.value)}><option value="lower">하단</option><option value="center">중앙</option><option value="upper">상단</option></select></Field><Field label="프레임률"><select aria-label="Step95 FPS" value={settings.fps} onChange={e=>update('fps',Number(e.target.value))}><option value={24}>24fps</option><option value={30}>30fps</option></select></Field><Field label="효과 강도"><input aria-label="Step95 강도" type="range" min="0" max="1" step=".05" value={settings.intensity} onChange={e=>update('intensity',Number(e.target.value))}/></Field></div>
  <canvas ref={canvas} width={768} height={432} style={{width:'100%',maxWidth:768,background:'#111',borderRadius:8,display:'block',margin:'12px 0'}} aria-label="Step95 Vocal Synth PV 실시간 Canvas 미리보기"/>
  <input aria-label="Step95 타임라인 탐색" type="range" min={0} max={duration||1} step=".05" value={Math.min(pos,duration||1)} onChange={e=>{setPlaying(false);setPos(Number(e.target.value));}} style={{width:'100%'}}/>
  <p className="muted">{pos.toFixed(2)} / {duration.toFixed(2)}초 · 실제 가사 정렬 큐 {aligned}개 · 저장된 장면 이미지가 없으면 그래픽 배경만 표시 · 음성은 미포함</p>
  <div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button disabled={busy||!duration} onClick={()=>{if(pos>=duration)setPos(0);setPlaying(!playing);}}>{playing?'일시정지':'PV 미리보기 재생'}</Button><Button onClick={()=>{try{onSave(savePv95(project,settings));notify('PV 설정이 프로젝트에 저장되었습니다.');}catch(e){notify(e.message);}}}>PV 설정 저장</Button><Button disabled={busy||!duration} onClick={()=>downloadText(JSON.stringify({format:'MYVOCAL_PV95_PLAN',projectId:project.id,pv95:settings,scenes:project.scenes?.map(s=>({id:s.id,start:s.start,end:s.end,imageAssetId:s.imageAssetId||''})),lyricCues:pv95Cues(project)},null,2),'MYVOCAL-PV95-plan.json','application/json')}>PV 계획 JSON</Button><Button disabled={busy||!capped||duration>30} onClick={exportWebm}>{busy?'WebM 생성 중…':'무음 WebM 출력'}</Button>{busy&&<Button onClick={()=>{recordingCancelled.current=true;if(recording.current?.state==='recording')recording.current.stop();setStatus('취소 요청됨 · 완료되지 않은 영상은 저장하지 않습니다.');}}>WebM 출력 취소</Button>}</div>
  <p role="status" className="muted">{status}</p><Notice>이 기능은 로컬 Canvas 연출입니다. 정렬되지 않은 가사를 음소 타이밍처럼 취급하지 않으며, 실시간 3D/실사 생성·AI 모션 합성이나 음악 포함 MP4는 제공하지 않습니다.</Notice>
 </Panel>;
}
