import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usableDancePlan} from '../lib/characterDanceDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {downloadText} from '../lib/store.js';
import {audioEnd,mixdownWav} from '../lib/audioEngine.js';
import {recordFullSong2dCharacter} from '../lib/fullSong2dSinging.js';
import {projectVocalSources} from '../lib/lipSyncProjectSources.js';
import {isAlignmentStale} from '../lib/lyricAlignment.js';
import {convertRecordedWebMToMP4} from '../lib/mvMp4Export.js';
import {layerPlanStatus} from '../lib/characterLayers.js';
import {ANIMATION_PRESETS,ANIMATION_FIELDS,EXPRESSIONS,animationStatus,createAnimationSettings,validateAnimationSettings,changeAnimationSettings,saveAnimationSettings,animationManifest,animationCanvasSize,drawAnimationFrame} from '../lib/characterAnimation2d.js';
const expressionNames={neutral:'보통',happy:'웃음',sad:'슬픔',surprised:'놀람'};
const fieldNames={durationSec:'길이 (초)',fps:'프레임/초',headDegrees:'고개 기울기 (도)',bodyPixels:'몸 움직임 강도',hairDegrees:'머리카락 흔들림 (도)',blinkRate:'눈 깜빡임 (회/초)',mouthRate:'입 열기/닫기 (회/초)',mouthStrength:'입 움직임 강도',cameraZoom:'카메라 확대',cameraPan:'카메라 이동'};
const fieldStep={durationSec:.5,fps:1,headDegrees:.5,bodyPixels:.5,hairDegrees:.5,blinkRate:.05,mouthRate:.1,mouthStrength:.05,cameraZoom:.005,cameraPan:.005};
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
export default function CharacterAnimationEditor({character,onSave,notify,projects=[]}){
 const canvasRef=useRef(null),imageRef=useRef(null),rafRef=useRef(0),playingRef=useRef(false),tRef=useRef(0),configRef=useRef(null),durationRef=useRef(6),activeRef=useRef(true),songAbortRef=useRef(null);
 const [imageReady,setImageReady]=useState(false),[status,setStatus]=useState('원본 이미지 로딩 중'),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(false);
 const [songId,setSongId]=useState(''),[makeMp4,setMakeMp4]=useState(false),[useVoiceEnergy,setUseVoiceEnergy]=useState(false);
 const [settings,setSettings]=useState(()=>{try{const saved=character.animation2d;if(saved){validateAnimationSettings(character,saved);return {...saved};}return createAnimationSettings(character);}catch{return null;}});
 const plan=character.layerPlan;
 const fullSongs=(Array.isArray(projects)?projects:[]).filter(p=>p?.id&&
  (p.characterId===character.id||p.scenes?.some(x=>x.characterId===character.id))&&
  p.tracks?.some(t=>t.type==='vocal'&&!t.mute&&t.clips?.length)&&
  audioEnd(p)>=150&&audioEnd(p)<=360);
 const selectedSong=fullSongs.find(p=>p.id===songId)||null;
 const directedPlan=usableExpressionPlan(character);
 const dancePlan=usableDancePlan(character);
 const performancePlan=usablePerformance89(character);
 configRef.current=settings;durationRef.current=settings?.durationSec||6;
 const valid=(()=>{try{return !!settings&&!!validateAnimationSettings(character,settings);}catch{return false;}})();
 const draw=(t)=>{const c=canvasRef.current,img=imageRef.current,config=configRef.current;if(!c||!img||!config)return;drawAnimationFrame(c.getContext('2d'),img,plan,config,t,c.width,c.height,character.lipSync,directedPlan,character,dancePlan,performancePlan);};
 useEffect(()=>()=>songAbortRef.current?.abort(),[]);
 useEffect(()=>{
  if(!valid)return;
  let cancelled=false,url='';activeRef.current=true;
  setImageReady(false);setStatus('저장된 원본 이미지 불러오는 중…');
  (async()=>{try{
   const blob=await getFile(plan.sourceAssetId);if(!blob)throw Error('원본 파일이 로컬 저장소에 없습니다.');
   url=URL.createObjectURL(blob);
   const img=await new Promise((ok,fail)=>{const el=new Image();el.onload=()=>ok(el);el.onerror=()=>fail(Error('원본 이미지 디코딩 실패'));el.src=url;});
   if(cancelled)return;
   if(img.naturalWidth!==plan.width||img.naturalHeight!==plan.height)throw Error('분석 당시의 원본 크기와 현재 파일이 다릅니다.');
   imageRef.current=img;
   const c=canvasRef.current;if(!c)throw Error('미리보기 Canvas를 찾을 수 없습니다.');
   const sz=animationCanvasSize(plan);c.width=sz.width;c.height=sz.height;
   drawAnimationFrame(c.getContext('2d'),img,plan,configRef.current,0,c.width,c.height,character.lipSync,directedPlan,character,dancePlan,performancePlan);
   setImageReady(true);setStatus('2D 모션 준비 완료. 단일 평면 그림의 영역 기반 합성입니다.');
  }catch(e){if(!cancelled)setStatus('원본 로딩 실패: '+e.message);}})();
  return ()=>{cancelled=true;activeRef.current=false;playingRef.current=false;cancelAnimationFrame(rafRef.current);imageRef.current=null;if(url)URL.revokeObjectURL(url);};
 },[character.id,plan?.sourceAssetId,plan?.width,plan?.height,valid]);
 useEffect(()=>{if(imageReady&&!playingRef.current)draw(Math.min(tRef.current,durationRef.current));},[settings,imageReady]);
 const stop=()=>{playingRef.current=false;cancelAnimationFrame(rafRef.current);setPlaying(false);};
 const seek=v=>{stop();const n=Number(v);tRef.current=n;setTime(n);draw(n);};
 const play=()=>{
  if(!imageReady||busy||!valid)return;
  if(playingRef.current){stop();return;}
  playingRef.current=true;setPlaying(true);
  const from=tRef.current>=durationRef.current?tRef.current=0:tRef.current;
  const start=performance.now();let lastLabel=-1;
  const step=now=>{if(!playingRef.current)return;const t=from+(now-start)/1000;
   if(t>=durationRef.current){tRef.current=durationRef.current;draw(tRef.current);setTime(tRef.current);stop();return;}
   tRef.current=t;draw(t);
   if(Math.floor(now/100)!==lastLabel){lastLabel=Math.floor(now/100);setTime(t);}
   rafRef.current=requestAnimationFrame(step);
  };rafRef.current=requestAnimationFrame(step);
 };
 const patch=(key,value)=>{if(value==='')return;try{const n=key==='expression'?value:Number(value);const next=changeAnimationSettings(character,settings,{[key]:n});setSettings(next);if(key==='durationSec'&&tRef.current>n)seek(n);}catch(e){setStatus('설정 확인: '+e.message);}};
 const preset=id=>{try{const next=createAnimationSettings(character,id);setSettings(next);seek(0);setStatus(`${id} 동작 프리셋을 적용했습니다. 저장하기 전에는 캐릭터 원본이 변경되지 않습니다.`);}catch(e){notify(e.message);}};
 const save=()=>{try{const next=saveAnimationSettings(character,settings);onSave(next);notify('82단계 2D 애니메이션 설정 저장 완료. 원본 그림과 81단계 레이어 계획은 유지했습니다.');}catch(e){notify('설정 저장 실패: '+e.message);}};
 const png=async()=>{try{if(!imageReady)throw Error('미리보기 준비가 필요합니다.');const blob=await new Promise((ok,fail)=>canvasRef.current.toBlob(b=>b?ok(b):fail(Error('PNG 인코딩 실패')),'image/png'));downloadBlob(blob,`MYVOCAL-Step82-${character.id}-frame.png`);}catch(e){notify(e.message);}};
 const record=async()=>{
  if(busy||!imageReady||!valid)return;
  if(typeof MediaRecorder==='undefined'||typeof canvasRef.current.captureStream!=='function'){notify('이 Windows/브라우저 엔진에서는 WebM 녹화 API를 지원하지 않습니다. PNG 프레임 출력은 사용할 수 있습니다.');return;}
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime){notify('지원되는 WebM 코덱이 없습니다. PNG 프레임 내보내기를 사용하세요.');return;}
  stop();setBusy(true);let recorder=null,stream=null,frame=0,interval=0;
  try{
   const cfg={...settings},canvas=canvasRef.current,duration=cfg.durationSec,fps=cfg.fps;
   seek(0);drawAnimationFrame(canvas.getContext('2d'),imageRef.current,plan,cfg,0,canvas.width,canvas.height,character.lipSync,directedPlan,character,dancePlan,performancePlan);
   stream=canvas.captureStream(fps);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1600000});const chunks=[];
   const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onerror=e=>reject(Error(e.error?.message||'WebM 녹화 오류'));recorder.onstop=()=>{const file=new Blob(chunks,{type:mime});file.size?resolve(file):reject(Error('빈 영상이 생성되었습니다.'));};});
   recorder.start();
   // Realtime recording: browser controls output FPS, so do not claim exact frame encoding.
   const started=performance.now();
   await new Promise((resolve,reject)=>{
    const advance=()=>{if(!activeRef.current){reject(Error('화면을 닫아 녹화가 중단되었습니다.'));return;}
     const t=Math.min(duration,(performance.now()-started)/1000);drawAnimationFrame(canvas.getContext('2d'),imageRef.current,plan,cfg,t,canvas.width,canvas.height,character.lipSync,directedPlan,character,dancePlan,performancePlan);
     tRef.current=t;if(frame++%3===0)setTime(t);
     if(t>=duration){resolve();return;}interval=requestAnimationFrame(advance);
    };interval=requestAnimationFrame(advance);
   });
   recorder.stop();const file=await finished;downloadBlob(file,`MYVOCAL-Step82-${character.id}.webm`);setStatus(`실제 Canvas 프레임이 포함된 WebM (${(file.size/1024).toFixed(0)}KB) 녹화 완료. 음성은 포함하지 않습니다.`);
  }catch(e){notify('WebM 녹화 실패: '+e.message);setStatus('녹화 실패: '+e.message);}finally{cancelAnimationFrame(interval);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());setBusy(false);stop();}
 };
 const exportEntireSong=async()=>{
  if(!selectedSong||busy||!imageReady||!valid)return;
  const controller=new AbortController();songAbortRef.current=controller;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass){notify('이 Windows WebView2는 PCM 음악 공연 녹화를 지원하지 않습니다.');return;}
  setBusy(true);stop();let warm=null;
  try{
   // 실제 Windows 사용자 클릭에서 오디오 권한을 먼저 연다.
   warm=new AudioContextClass();await warm.resume();
   setStatus('한국어 신경망 Singing과 반주를 원곡 길이 PCM WAV로 믹싱 중');
   const wav=await mixdownWav(selectedSong,{bitDepth:16,channels:2,sampleRate:44100});
   if(controller.signal.aborted||!activeRef.current)throw Error('전곡 2D 공연이 중단됐습니다.');
   let vocalAudioBuffer=null;
   if(useVoiceEnergy){
    if(!selectedSong.vocalAlignment||isAlignmentStale(selectedSong,selectedSong.vocalAlignment))
     throw Error('실제 한국어 보컬 RMS 립싱크에는 현재 MIDI 가사·음표 싱크가 필요합니다.');
    const source=projectVocalSources(selectedSong).find(x=>
     selectedSong.tracks.some(t=>t.id===x.trackId&&!t.mute));
    if(!source)throw Error('반주가 아닌 실제 보컬 WAV의 독립 편집 트랙이 필요합니다.');
    const vocals=await getFile(source.assetId);
    if(!(vocals instanceof Blob)||vocals.size<44||vocals.size>90*1024*1024)
     throw Error('등록된 한국어 원곡 보컬 WAV를 불러올 수 없습니다.');
    vocalAudioBuffer=await warm.decodeAudioData(await vocals.arrayBuffer());
    if(controller.signal.aborted)throw Error('실제 2D 보컬 립싱크 제작이 취소됐습니다.');
   }
   const produced=await recordFullSong2dCharacter({
    project:selectedSong,character,canvas:canvasRef.current,image:imageRef.current,settings,
    audioBlob:wav,vocalAudioBuffer,prewarmedAudioContext:warm,signal:controller.signal,
    onProgress:p=>setStatus('실제 2D 가창·립싱크 영상 녹화 '+Math.round(p*100)+'%')
   });
   downloadBlob(produced.file,'MYVOCAL-2D-'+character.id+'-전곡Singing.webm');
   setStatus('원곡 '+produced.durationSec.toFixed(2)+'초 · 음소 '+produced.phonemeCues+'개 실제 2D 노래 WebM 생성 완료');
   if(makeMp4){
    const session=window.__MYVOCAL_SESSION_KEY;
    if(!session)throw Error('MP4는 기존 Windows MYVOCAL EXE 세션이 필요합니다.');
    const mp4=await convertRecordedWebMToMP4(produced.file,{session,signal:controller.signal});
    downloadBlob(mp4,'MYVOCAL-2D-'+character.id+'-전곡Singing.mp4');
    setStatus('실제 3~6분 2D 가창 WebM/MP4 둘 다 출력 완료');
   }
  }catch(e){setStatus('2D 노래 영상 생성 실패: '+e.message);notify('2D 전곡 MV 실패: '+e.message);}
  finally{songAbortRef.current=null;try{await warm?.close()}catch{}setBusy(false);}
 };
 const exportJson=()=>{try{downloadText(JSON.stringify(animationManifest(character,settings),null,2),`MYVOCAL-Step82-${character.id}.json`,'application/json');}catch(e){notify('애니메이션 JSON 내보내기 실패: '+e.message);}};
 if(layerPlanStatus(character).status!=='ready')return <Notice>먼저 STEP81에서 사용 권한이 있는 2D 캐릭터 원본의 6개 영역을 검토·저장하세요. 자동 얼굴 분할이나 리깅은 제공하지 않습니다.</Notice>;
 if(!valid)return <div className="modal-form"><Notice>이전에 저장된 애니메이션 설정의 원본 또는 레이어 영역이 변경되었거나 설정값이 잘못됐습니다. 아래 버튼으로 81단계의 현재 영역 기준 새 동작 설정을 만드세요. 기존 프로필 데이터는 지우지 않습니다.</Notice><Button onClick={()=>{try{setSettings(createAnimationSettings(character));setStatus('새 동작 설정이 준비되었습니다.');}catch(e){notify(e.message);}}}>현재 레이어로 새 설정</Button></div>;
 return <div className="modal-form" style={{maxHeight:'75vh',overflowY:'auto'}}>
  <Notice>**STEP82 — 2D 캐릭터 애니메이션.** 81단계에서 검토한 원본 영역으로 눈 깜빡임·수동 주기 입모양·고개 기울기·표정 가이드·머리카락·몸 흔들림·카메라 줌/이동을 Canvas에 합성합니다. 단일 평면 그림이라 독립 레이어/가려진 픽셀은 복구하지 못합니다. STEP85 음소 Lip Sync와 STEP87 표정 연출이 저장된 경우 미리보기·WebM에 적용합니다.</Notice>
  <p role="status" className="muted">{status}</p>
  <canvas ref={canvasRef} role="img" aria-label={`${character.name} 2D 움직임 미리보기`} style={{display:'block',width:'min(100%,390px)',height:'auto',maxHeight:320,objectFit:'contain',margin:'auto',border:'1px solid #666',background:'#171b2c'}}/>
  <div className="look-actions"><Button disabled={!imageReady||busy} onClick={play}>{playing?'일시정지':'재생'}</Button><Button disabled={!imageReady||busy} onClick={()=>seek(0)}>처음으로</Button><small>{time.toFixed(2)} / {settings.durationSec.toFixed(1)}초</small></div>
  <Field label="프레임 탐색"><input type="range" min="0" max={settings.durationSec} step={1/settings.fps} value={time} disabled={!imageReady||busy} onChange={e=>seek(e.target.value)} style={{width:'100%'}}/></Field>
  <Field label="동작 프리셋"><select defaultValue="gentle" onChange={e=>preset(e.target.value)} disabled={busy}>{Object.keys(ANIMATION_PRESETS).map(x=><option value={x} key={x}>{({gentle:'차분한 동작',energetic:'역동적',ballad:'발라드',still:'정지'})[x]}</option>)}</select></Field>
  <Field label="수동 표정"><select value={settings.expression} onChange={e=>patch('expression',e.target.value)}>{EXPRESSIONS.map(x=><option key={x} value={x}>{expressionNames[x]}</option>)}</select></Field>
  <div className="form-two">{Object.entries(ANIMATION_FIELDS).map(([field,[min,max]])=><Field label={fieldNames[field]} key={field}><input type="number" min={min} max={max} step={fieldStep[field]} value={settings[field]} onChange={e=>patch(field,e.target.value)} disabled={busy}/></Field>)}</div>
  <Notice>**3~6분 실제 한국어 2D Singing 공연** — 81단계에서 검토한 눈·입·얼굴·몸 원본 영역을 보존한 채, 신경망 보컬+반주 PCM과 음소·표정·모션을 같은 시간축으로 WebM에 녹화합니다.</Notice>
  <Field label="실제 보컬 WAV와 연결된 3~6분 노래 선택"><select disabled={busy} value={songId} onChange={e=>setSongId(e.target.value)}>
   <option value="">등록한 2D 캐릭터와 연결된 원곡 선택</option>
   {fullSongs.map(p=><option key={p.id} value={p.id}>{p.title||p.id} · {audioEnd(p).toFixed(1)}초</option>)}
  </select></Field>
  <label className="check-item"><input type="checkbox" disabled={busy} checked={useVoiceEnergy} onChange={e=>setUseVoiceEnergy(e.target.checked)}/> 실제 원본 보컬 WAV의 발성 PCM을 한국어 MIDI 가사·입 모양 시간표에 적용 (반주 제외)</label>
  <label className="check-item"><input type="checkbox" disabled={busy} checked={makeMp4} onChange={e=>setMakeMp4(e.target.checked)}/> 완성 2D 가창 WebM을 기존 FFmpeg로 MP4도 생성</label>
  <div className="hstack" style={{flexWrap:'wrap',gap:8}}>
   <Button variant="primary" disabled={!selectedSong||busy||!imageReady||!valid} onClick={exportEntireSong}>3~6분 원곡 보컬·2D 립싱크 전곡 공연 실제 녹화</Button>
   {busy&&songAbortRef.current&&<Button onClick={()=>songAbortRef.current?.abort()}>전곡 공연 취소</Button>}
  </div>
  <div className="modal-actions"><Button onClick={png} disabled={!imageReady||busy}>현재 프레임 PNG</Button><Button onClick={record} disabled={!imageReady||busy}>움직이는 WebM 출력</Button><Button onClick={exportJson} disabled={busy}>동작 설정 JSON</Button><Button variant="primary" onClick={save} disabled={busy}>캐릭터 동작 설정 저장</Button></div>
  <Notice>WebM은 지원하는 Windows 브라우저/MediaRecorder에서 **실시간 무음 녹화**로 출력됩니다. 타임라인 FPS는 목표값이며 결과 코덱/프레임 간격은 환경에 따라 달라집니다. 배경·얼굴 원본 보존, 실제 눈/입 분리, 자동 음소 정렬은 보장하지 않습니다. 사용자 등록 원본 파일은 변경되지 않습니다.</Notice>
 </div>;
}
