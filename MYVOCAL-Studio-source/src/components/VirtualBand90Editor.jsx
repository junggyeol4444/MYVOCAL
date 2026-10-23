import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {eligibleBandCharacters,createBand90,createFullSongBand90,saveBand90,bandFrame90,BAND90_ROLES} from '../lib/virtualBand90.js';
import {modelAssets,parseCharacter3d} from '../lib/character3d.js';
import {Character3dRenderer} from '../lib/character3dRenderer.js';
import {createStageSettings,stageRigSettings} from '../lib/characterStage3d.js';
import {drawAnimationFrame} from '../lib/characterAnimation2d.js';
import {personVideoAssets} from '../lib/personLipSync.js';
import {usableDancePlan} from '../lib/characterDanceDirector.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {recordStageWebM,supportedStageWebM} from '../lib/stage3dRecording.js';
import {audioEnd,mixdownWav} from '../lib/audioEngine.js';
import {convertRecordedWebMToMP4} from '../lib/mvMp4Export.js';
import {resolveProjectVrmLipSync} from '../lib/projectVrmSingingSync.js';
import {makeFullSongInstrumentPerformance} from '../lib/fullSongInstrumentPerformance.js';
import {lipSyncFromSingingAudio} from '../lib/audioDrivenLipSync.js';
import {visemeAt} from '../lib/characterLipSync.js';
import {stageSingerExpressionFromVocal} from '../lib/duetSingingExpression.js';
import {projectVocalSources} from '../lib/lipSyncProjectSources.js';
import {isAlignmentStale} from '../lib/lyricAlignment.js';
const positions=['left','center','right'];
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
export default function VirtualBand90Editor({project,characters,onSave,notify}){
 const [plan,setPlan]=useState(()=>project.band90||createBand90(project,characters));
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('멤버별 로컬 영상·모델을 불러옵니다.');
 const [music,setMusic]=useState(null);
 const [duetLipSyncs,setDuetLipSyncs]=useState(null);
 const canvas=useRef(null),sources=useRef(new Map()),frameRef=useRef(0),lastRef=useRef(0),timeRef=useRef(0),abort=useRef(null);
 const available=eligibleBandCharacters(characters),byId=new Map(characters.map(c=>[c.id,c]));
 const rolePerformance=useMemo(()=>{
  const plans=new Map();
  if(plan.durationSec<150)return plans;
  for(const member of plan.members){
   if(!['guitar','bass','drums','piano','strings','synth'].includes(member.role))continue;
   try{plans.set(member.characterId,makeFullSongInstrumentPerformance(project,{durationSec:plan.durationSec,role:member.role}));}
   catch{/* 해당 악기 MIDI가 없으면 기존 STEP89 공연 계획을 사용한다. */}
  }
  return plans;
 },[project,plan.durationSec,plan.members]);
 const lipByMember=useMemo(()=>{
  const result=new Map();
  for(const member of plan.members){
   const c=byId.get(member.characterId);if(!c)continue;
   try{
    const singerLip=duetLipSyncs?.projectId===project.id?duetLipSyncs.lips.get(c.id):null;
    if(singerLip){
     // 듀엣 실제 PCM 립싱크는 원곡 절대시각이므로 가수 등장 시작을 빼서
     // 각 2D/VRM 렌더러가 사용하는 로컬 공연 시각으로 맞춘다.
     const origin=Math.round(member.startSec*1000);
     const sliced=origin?singerLip.cues.filter(cue=>cue.endMs>origin)
      .map(cue=>({...cue,startMs:Math.max(0,cue.startMs-origin),
       endMs:cue.endMs-origin})):singerLip.cues;
     result.set(c.id,origin?{...singerLip,cues:sliced}:singerLip);
    }else result.set(c.id,resolveProjectVrmLipSync(project,c)?.lipSync||c.lipSync);
   }
   catch{result.set(c.id,c.lipSync);}
  }
  return result;
 },[project,characters,plan.members,duetLipSyncs]);
 // 가수별 실제 PCM 보컬의 입 모양을 자기 2D/VRM 표정에도 반영한다.
 // 직접 검토한 STEP87 표정은 건드리지 않는다.
 const liveSingerExpression=useMemo(()=>{
  const rows=new Map();
  if(duetLipSyncs?.projectId!==project.id)return rows;
  for(const member of plan.members){
   const character=byId.get(member.characterId);
   if(!character||usableExpressionPlan(character))continue;
   const lip=lipByMember.get(character.id);
   if(!lip?.cues?.length||!duetLipSyncs.lips.has(character.id))continue;
   try{rows.set(character.id,stageSingerExpressionFromVocal(character,lip));}catch{/* 기존 표정 유지 */}
  }
  return rows;
 },[project.id,plan.members,lipByMember,duetLipSyncs,characters]);
 const patch=(key,value)=>setPlan(p=>({...p,[key]:value}));
 const patchMember=(index,key,value)=>setPlan(p=>({...p,members:p.members.map((m,i)=>i===index?{...m,[key]:value}:m)}));
 useEffect(()=>{let stopped=false;const fresh=new Map();setStatus('로컬 미디어 불러오는 중…');
  (async()=>{for(const m of plan.members){if(fresh.has(m.characterId))continue;const c=byId.get(m.characterId);if(!c)continue;
   try{if(modelAssets(c).length){const a=modelAssets(c)[0],f=await getFile(a.id);if(!f||f.size>40*1024*1024)throw Error('모델 파일 누락 또는 용량 초과');const model=parseCharacter3d(await f.arrayBuffer(),f.name||a.name);if(stopped)return;
    const el=document.createElement('canvas');el.width=320;el.height=360;const renderer=new Character3dRenderer(el,model);fresh.set(c.id,{kind:'3d',element:el,renderer,settings:c.stage3d||createStageSettings(c)});
   }else if(personVideoAssets(c).length){const a=personVideoAssets(c)[0],f=await getFile(a.id);if(!f)throw Error('사람 영상 누락');const url=URL.createObjectURL(f),v=document.createElement('video');v.src=url;v.muted=true;v.playsInline=true;v.preload='auto';fresh.set(c.id,{kind:'person',element:v,url});
   }else{const a=c.layerPlan?.sourceAssetId,blob=a&&await getFile(a);if(!blob)throw Error('2D 레이어 이미지 누락');const url=URL.createObjectURL(blob),img=new Image();await new Promise((ok,bad)=>{img.onload=ok;img.onerror=bad;img.src=url;});if(stopped){URL.revokeObjectURL(url);return;}fresh.set(c.id,{kind:'2d',element:img,url});}
   }catch(e){fresh.set(c.id,{kind:'error',message:e.message});}}
   if(stopped)return;sources.current=fresh;setStatus(`로컬 공연 소스 ${fresh.size}명 준비됨 · 3D는 WebGL, 2D는 Canvas, 사람은 등록 영상 프레임을 사용합니다.`);
  })();return ()=>{stopped=true;for(const x of fresh.values()){x.renderer?.dispose();if(x.url)URL.revokeObjectURL(x.url);if(x.kind==='person')x.element.pause();}sources.current=new Map();};
 },[plan.members.map(m=>m.characterId).join('|'),project.id]);
 const draw=t=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;const w=960,h=540;ctx.fillStyle='#101427';ctx.fillRect(0,0,w,h);
  const active=bandFrame90(project,characters,plan,Math.max(0,Math.min(plan.durationSec,t)));const tileW=Math.floor(w/Math.max(1,active.length));
  active.forEach((member,i)=>{const c=byId.get(member.characterId),src=sources.current.get(c.id),x=i*tileW;ctx.save();ctx.beginPath();ctx.rect(x,0,tileW,h);ctx.clip();
   ctx.fillStyle=i%2?'#252d48':'#182b43';ctx.fillRect(x,0,tileW,h);
   try{if(src?.kind==='3d'){src.renderer.render(stageRigSettings(src.settings),t-member.startSec,c.stage3d||null,lipByMember.get(c.id)||c.lipSync,liveSingerExpression.get(c.id)?.plan||usableExpressionPlan(c),liveSingerExpression.get(c.id)?.character||c,usableDancePlan(c),rolePerformance.get(c.id)||usablePerformance89(c));ctx.drawImage(src.element,x,0,tileW,h-62);}
    else if(src?.kind==='2d'){if(c.animation2d&&c.layerPlan?.reviewed){const off=document.createElement('canvas');off.width=c.layerPlan.width;off.height=c.layerPlan.height;drawAnimationFrame(off.getContext('2d'),src.element,c.layerPlan,c.animation2d,t-member.startSec,off.width,off.height,lipByMember.get(c.id)||c.lipSync,liveSingerExpression.get(c.id)?.plan||usableExpressionPlan(c),liveSingerExpression.get(c.id)?.character||c,usableDancePlan(c),rolePerformance.get(c.id)||usablePerformance89(c));ctx.drawImage(off,x,0,tileW,h-62);}else ctx.drawImage(src.element,x,0,tileW,h-62);}
    else if(src?.kind==='person'&&src.element.readyState>=2)ctx.drawImage(src.element,x,0,tileW,h-62);
   }catch{/* display fallback tile instead of failing the entire ensemble */}
   ctx.fillStyle='#0a1022';ctx.fillRect(x,h-62,tileW,62);ctx.fillStyle='white';ctx.font='bold 21px sans-serif';ctx.fillText(String(member.name).slice(0,28),x+12,h-34);ctx.font='15px sans-serif';ctx.fillStyle='#b8d2ef';ctx.fillText(`${member.role} · ${visemeAt(lipByMember.get(c.id)||c.lipSync,t-member.startSec).viseme} · ${member.kind}`,x+12,h-12);ctx.restore();});
  ctx.fillStyle='white';ctx.font='17px sans-serif';ctx.fillText(`MYVOCAL 90 · ${t.toFixed(2)}s`,12,25);
 };
 useEffect(()=>{if(busy)return;draw(timeRef.current);},[plan,busy,status,duetLipSyncs]);
 useEffect(()=>{if(!playing||busy)return;lastRef.current=0;const tick=stamp=>{if(!lastRef.current)lastRef.current=stamp;timeRef.current=Math.min(plan.durationSec,timeRef.current+(stamp-lastRef.current)/1000);lastRef.current=stamp;
  for(const m of plan.members){const src=sources.current.get(m.characterId);if(src?.kind==='person'&&src.element.readyState>=1){const should=Math.max(0,timeRef.current-m.startSec),diff=Math.abs(src.element.currentTime-should);if(diff>.1)try{src.element.currentTime=Math.min(should,src.element.duration||should);}catch{}}}
  try{draw(timeRef.current);}catch(e){setStatus(e.message);setPlaying(false);return;}
  setTime(timeRef.current);if(timeRef.current>=plan.durationSec){setPlaying(false);return;}frameRef.current=requestAnimationFrame(tick);};frameRef.current=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frameRef.current);},[playing,busy,plan]);
 const seek=t=>{timeRef.current=t;setTime(t);draw(t);};
 const arrangeDuetSingerStage=()=>{
  try{
   const mapping=project.duetSingers;
   if(mapping?.version!==1||!mapping.lead?.characterId||!mapping.harmony?.characterId||
      mapping.lead.characterId===mapping.harmony.characterId)
    throw Error('Singing Workbench 또는 Music+MV에서 먼저 두 명의 실제 신경망 듀엣을 생성하세요.');
   const duration=audioEnd(project);
   const full=createFullSongBand90(project,characters,duration,{existing:plan});
   const assignments=[
    {id:mapping.lead.characterId,role:'lead',position:'left'},
    {id:mapping.harmony.characterId,role:'harmony',position:'right'}
   ];
   let members=full.members.map(m=>{
    const match=assignments.find(a=>a.id===m.characterId);
    return match?{...m,role:match.role}:m;
   });
   for(const match of assignments){
    if(!available.some(c=>c.id===match.id))
     throw Error('듀엣에 저장한 캐릭터가 삭제됐거나 사용 허가가 없습니다.');
    if(!members.some(m=>m.characterId===match.id)){
     if(members.length>=6)throw Error('기존 가상 밴드 6명은 덮어쓰지 않습니다. 먼저 별도 빈 슬롯을 마련하세요.');
     members=[...members,{characterId:match.id,role:match.role,
      position:match.position,startSec:0,endSec:duration}];
    }
   }
   const next=saveBand90(project,characters,{...full,members});
   setPlan(next.band90);setDuetLipSyncs(null);
   notify('원본 악기·보컬을 보존하고 두 등록 가수를 lead/harmony 3~6분 공연에 배치했습니다. 듀엣 별도 WAV 발성 립싱크 연결 버튼으로 이어가세요.');
  }catch(e){notify('가상 밴드 두 가수 배치 실패: '+e.message);}
 };
 const prepareRealSingerDuet=async()=>{
  if(busy)return;
  const mapping=project.duetSingers;
  const source=project.vocalAlignment;
  if(!mapping||mapping.version!==1||!source||isAlignmentStale(project,source)){
   notify('실제 듀엣 보컬 두 트랙과 원곡 한국어 가사·MIDI 싱크를 먼저 저장하세요.');return;
  }
  const lead=mapping.lead,harmony=mapping.harmony;
  if(!lead?.characterId||!harmony?.characterId||lead.characterId===harmony.characterId||
     !plan.members.some(m=>m.characterId===lead.characterId&&m.role==='lead')||
     !plan.members.some(m=>m.characterId===harmony.characterId&&m.role==='harmony')){
   notify('듀엣의 주보컬·화음 캐릭터 두 명을 밴드에 lead·harmony 역할로 배치하세요.');return;
  }
  const choices=[lead,harmony];
  const availableSources=projectVocalSources(project);
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass){notify('실제 노래 WAV 디코딩은 Windows WebView2 AudioContext가 필요합니다.');return;}
  const context=new AudioContextClass();setBusy(true);setStatus('실제 듀엣 2인 보컬 WAV 각각의 발성 PCM 시간축 읽는 중');
  try{
   const lips=new Map();
   for(let i=0;i<choices.length;i++){
    const singer=choices[i];
    const character=byId.get(singer.characterId);
    if(!character||!['self','owned','licensed'].includes(character.rights)||
       character.rights==='licensed'&&!String(character.rightsNote||'').trim())
     throw Error('듀엣 가수 캐릭터 사용 권한이 올바르지 않습니다.');
    const track=project.tracks.find(t=>t.id===singer.trackId);
    const actual=availableSources.find(s=>s.trackId===track?.id);
    if(!track||track.type!=='vocal'||track.mute||!actual)
     throw Error((i===0?'주보컬':'화음')+' 실제 독립 WAV 편집 트랙을 선택하세요.');
    if(track.singerCharacterId&&track.singerCharacterId!==character.id||
       track.singerVoiceId&&track.singerVoiceId!==singer.voiceId)
     throw Error('선택한 보컬 트랙의 가수와 프로젝트 듀엣 매핑이 일치하지 않습니다.');
    const wav=await getFile(actual.assetId);
    if(!(wav instanceof Blob)||wav.size<44||wav.size>90*1024*1024)
     throw Error('등록된 듀엣 보컬 PCM WAV 자산을 읽지 못했습니다.');
    const audio=await context.decodeAudioData(await wav.arrayBuffer());
    if(audio.duration+.08<source.cues.at(-1)?.endSec||
       audio.duration+.08<plan.durationSec)
     throw Error('두 가수의 실제 독립 WAV가 원곡 MIDI 공연 시간보다 짧습니다.');
    const lip=lipSyncFromSingingAudio(source,audio);
    lips.set(character.id,lip);
    setStatus('실제 '+(i===0?'주보컬':'화음')+' PCM → 한국어 음소 립싱크 '+lip.cues.length+'개');
   }
   setDuetLipSyncs({projectId:project.id,lips,
    trackIds:choices.map(x=>x.trackId)});
   notify('실제 원곡 주보컬·신경망 화음 WAV 각각의 음성 발성으로 2인 2D/VRM 립싱크를 연결했습니다. 원본 캐릭터와 WAV는 보존됩니다.');
  }catch(e){notify('실제 듀엣 캐릭터별 립싱크 연결 실패: '+e.message);}
  finally{await context.close().catch(()=>{});setBusy(false);}
 };
 const prepareFullSong=async()=>{
  if(busy)return;
  setBusy(true);
  try{
   setStatus('기존 악기·보컬·MIDI 전곡 WAV 믹스 생성 중');
   const duration=audioEnd(project),full=createFullSongBand90(project,characters,duration,{existing:plan});
   const wav=await mixdownWav(project,{bitDepth:16,sampleRate:44100,channels:2});
   if(!(wav instanceof Blob)||wav.size<44||wav.size>96*1024*1024)
    throw Error('실제 음악 WAV가 없거나 96MiB를 초과합니다.');
   setPlan(full);
   setMusic({file:wav,projectId:project.id,durationSec:duration});
   notify('3~6분 원곡 악기·보컬 믹스와 가상 밴드 6인 이내 등장 시간표를 연결했습니다.');
  }catch(e){notify('전체 밴드 음악 연결 실패: '+e.message);}
  finally{setBusy(false);}
 };
 const prepareCurrentMusic=async()=>{
  if(busy)return;setBusy(true);
  try{
   const duration=audioEnd(project);
   if(duration+.08<plan.durationSec)throw Error('현재 공연 영상보다 프로젝트 음악이 짧습니다.');
   const wav=await mixdownWav(project,{bitDepth:16,sampleRate:44100,channels:2});
   if(!(wav instanceof Blob)||wav.size<44||wav.size>96*1024*1024)
    throw Error('프로젝트 음악 WAV가 없거나 96MiB를 초과합니다.');
   setMusic({file:wav,projectId:project.id,durationSec:duration});
   notify('기존 DAW의 실제 음악·가창 믹스를 가상 밴드 공연에 연결했습니다.');
  }catch(e){notify('밴드 음악 연결 실패: '+e.message);}
  finally{setBusy(false);}
 };
 const save=()=>{try{onSave(saveBand90(project,characters,plan));notify('90단계 다중 캐릭터 공연 타임라인을 저장했습니다.');}catch(e){notify('공연 저장 오류: '+e.message);}};
 const record=async({includeAudio=false,asMp4=false}={})=>{try{saveBand90(project,characters,plan);if(!supportedStageWebM())throw Error('이 Windows EXE는 WebM 녹화를 지원하지 않습니다.');
  if(includeAudio&&(!music||music.projectId!==project.id||music.durationSec+.08<plan.durationSec))throw Error('실제 음악 WAV를 연결해 주세요.');
  if(asMp4&&!window.__MYVOCAL_SESSION_KEY)throw Error('MP4에는 로컬 Windows EXE 세션이 필요합니다.');setPlaying(false);setBusy(true);const controller=new AbortController();abort.current=controller;
  const video=await recordStageWebM({canvas:canvas.current,duration:plan.durationSec,fps:plan.fps,
   videoBitsPerSecond:plan.durationSec>180?1600000:2400000,
   audioBlob:includeAudio?music.file:null,
   draw:t=>{for(const m of plan.members){const src=sources.current.get(m.characterId);if(src?.kind==='person'&&src.element.readyState>=1)try{src.element.currentTime=Math.max(0,t-m.startSec);}catch{}}draw(t);},
   signal:controller.signal});
  download(video,'MYVOCAL-Step90-band.webm');
  notify(includeAudio?'음악 포함 가상 밴드 실제 WebM 출력 완료':'가상 밴드 무음 WebM 출력 완료');
  if(asMp4){
   const mp4=await convertRecordedWebMToMP4(video,{session:window.__MYVOCAL_SESSION_KEY,signal:controller.signal});
   download(mp4,'MYVOCAL-Step90-band.mp4');
   notify('가상 밴드 실제 FFmpeg MP4 출력 완료 · 기존 WebM도 보존했습니다.');
  }
 }catch(e){notify('밴드 영상 출력 실패: '+e.message);}finally{abort.current=null;setBusy(false);}};
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}><Notice>**STEP90 가상 밴드** · 최대 6명의 2D·3D·실제 사람을 단일 Canvas에 동시에 합성하고 각자의 STEP85/87/88/89 연출을 사용합니다. 기존 무음 WebM 출력도 유지하며 원곡 전체 음악·가창을 넣은 3~6분 WebM과 로컬 FFmpeg MP4도 출력합니다. 실제 사람은 등록 영상 프레임만 사용합니다.</Notice>
 <Field label="영상 길이 (2~360초)"><input type="number" min="2" max="360" value={plan.durationSec} disabled={busy} onChange={e=>patch('durationSec',Number(e.target.value))}/></Field>
 <Field label="FPS"><select value={plan.fps} onChange={e=>patch('fps',Number(e.target.value))}><option value={24}>24</option><option value={30}>30</option></select></Field>
 {plan.members.map((m,i)=><div className="hstack" key={i} style={{gap:6,flexWrap:'wrap',margin:'8px 0'}}><select aria-label={`멤버 ${i+1}`} value={m.characterId} onChange={e=>patchMember(i,'characterId',e.target.value)}>{available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label={`역할 ${i+1}`} value={m.role} onChange={e=>patchMember(i,'role',e.target.value)}>{BAND90_ROLES.map(role=><option key={role}>{role}</option>)}</select><select value={m.position} onChange={e=>patchMember(i,'position',e.target.value)}>{positions.map(pos=><option key={pos}>{pos}</option>)}</select><label>시작<input type="number" min="0" step="0.1" style={{width:58}} value={m.startSec} onChange={e=>patchMember(i,'startSec',Number(e.target.value))}/></label><label>종료<input type="number" min="0" step="0.1" style={{width:58}} value={m.endSec} onChange={e=>patchMember(i,'endSec',Number(e.target.value))}/></label><Button onClick={()=>patch('members',plan.members.filter((_,j)=>j!==i))}>제외</Button></div>)}
 <Button disabled={plan.members.length>=6||available.length<=plan.members.length} onClick={()=>patch('members',[...plan.members,{characterId:available.find(c=>!plan.members.some(m=>m.characterId===c.id))?.id||'',role:'harmony',position:'center',startSec:0,endSec:plan.durationSec}])}>멤버 추가</Button>
 <div className="look-actions"><Button disabled={busy} onClick={prepareFullSong}>3~6분 전체 음악·밴드 연결</Button><Button disabled={busy} onClick={prepareCurrentMusic}>현재 밴드 음악 WAV 연결</Button></div>
 {project.duetSingers?.version===1&&<div className="look-actions">
  <Button disabled={busy} onClick={arrangeDuetSingerStage}>두 가수 실제 보컬·캐릭터를 전곡 밴드 lead/harmony로 배치</Button>
  <Button disabled={busy} onClick={prepareRealSingerDuet}>실제 서로 다른 두 가수 WAV 발성 → 2D/VRM 듀엣 립싱크</Button>
  {duetLipSyncs?.projectId===project.id&&<Button disabled={busy} onClick={()=>setDuetLipSyncs(null)}>듀엣 보컬 립싱크 해제</Button>}
 </div>}
 <p role="status">{status}{music?.projectId===project.id?' · 음악 WAV 준비됨':''}</p><canvas ref={canvas} width="960" height="540" style={{display:'block',width:'100%',height:'auto',background:'#111827'}} aria-label="90단계 가상 밴드 동시 공연"/>
 <div className="look-actions"><Button disabled={busy} onClick={()=>setPlaying(v=>!v)}>{playing?'일시정지':'재생'}</Button><span>{time.toFixed(2)} / {plan.durationSec}초</span></div><input type="range" min="0" max={plan.durationSec} step="0.02" value={time} disabled={busy} onChange={e=>{setPlaying(false);seek(Number(e.target.value));}} style={{width:'100%'}}/>
 <div className="modal-actions"><Button disabled={busy} onClick={()=>downloadText(JSON.stringify({format:'MYVOCAL_BAND90',...plan},null,2),'MYVOCAL-Step90-band.json','application/json')}>JSON</Button><Button disabled={busy} onClick={save}>공연 설정 저장</Button><Button disabled={busy||!supportedStageWebM()} onClick={()=>record()}>무음 WebM 출력</Button><Button disabled={busy||!music||music.projectId!==project.id||!supportedStageWebM()} onClick={()=>record({includeAudio:true})}>음악 포함 WebM 출력</Button><Button disabled={busy||!music||music.projectId!==project.id||!supportedStageWebM()} onClick={()=>record({includeAudio:true,asMp4:true})}>음악 포함 MP4 출력</Button>{busy&&<Button onClick={()=>abort.current?.abort()}>중단</Button>}</div>
 <Notice>프로그램 내부 3D WebGL/2D Canvas 렌더러를 재사용합니다. GPU·웹캠·동영상 디코딩은 실제 Windows에서 확인이 필요합니다. 3D 호환 모프가 없으면 발음에 따른 입 변화가 보이지 않습니다. 기존 DAW의 실제 악기·가창 믹스를 공연 오디오에 사용합니다. 6분 MP4는 로컬 FFmpeg 및 WAV·WebM 용량 제한을 따릅니다. 원본 WAV와 WebM을 보존합니다.</Notice></div>;
}
