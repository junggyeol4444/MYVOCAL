import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadText} from '../lib/store.js';
import {eligibleBandCharacters,createBand90,saveBand90,bandFrame90,BAND90_ROLES} from '../lib/virtualBand90.js';
import {modelAssets,parseCharacter3d} from '../lib/character3d.js';
import {Character3dRenderer} from '../lib/character3dRenderer.js';
import {createStageSettings,stageRigSettings} from '../lib/characterStage3d.js';
import {drawAnimationFrame} from '../lib/characterAnimation2d.js';
import {personVideoAssets} from '../lib/personLipSync.js';
import {usableDancePlan} from '../lib/characterDanceDirector.js';
import {usableExpressionPlan} from '../lib/characterExpressionDirector.js';
import {usablePerformance89} from '../lib/characterPerformance89.js';
import {recordStageWebM,supportedStageWebM} from '../lib/stage3dRecording.js';
const positions=['left','center','right'];
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
export default function VirtualBand90Editor({project,characters,onSave,notify}){
 const [plan,setPlan]=useState(()=>project.band90||createBand90(project,characters));
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('멤버별 로컬 영상·모델을 불러옵니다.');
 const canvas=useRef(null),sources=useRef(new Map()),frameRef=useRef(0),lastRef=useRef(0),timeRef=useRef(0),abort=useRef(null);
 const available=eligibleBandCharacters(characters),byId=new Map(characters.map(c=>[c.id,c]));
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
   try{if(src?.kind==='3d'){src.renderer.render(stageRigSettings(src.settings),t-member.startSec,c.stage3d||null,c.lipSync,usableExpressionPlan(c),c,usableDancePlan(c),usablePerformance89(c));ctx.drawImage(src.element,x,0,tileW,h-62);}
    else if(src?.kind==='2d'){if(c.animation2d&&c.layerPlan?.reviewed){const off=document.createElement('canvas');off.width=c.layerPlan.width;off.height=c.layerPlan.height;drawAnimationFrame(off.getContext('2d'),src.element,c.layerPlan,c.animation2d,t-member.startSec,off.width,off.height,c.lipSync,usableExpressionPlan(c),c,usableDancePlan(c),usablePerformance89(c));ctx.drawImage(off,x,0,tileW,h-62);}else ctx.drawImage(src.element,x,0,tileW,h-62);}
    else if(src?.kind==='person'&&src.element.readyState>=2)ctx.drawImage(src.element,x,0,tileW,h-62);
   }catch{/* display fallback tile instead of failing the entire ensemble */}
   ctx.fillStyle='#0a1022';ctx.fillRect(x,h-62,tileW,62);ctx.fillStyle='white';ctx.font='bold 21px sans-serif';ctx.fillText(String(member.name).slice(0,28),x+12,h-34);ctx.font='15px sans-serif';ctx.fillStyle='#b8d2ef';ctx.fillText(`${member.role} · ${member.viseme?.viseme||'-'} · ${member.kind}`,x+12,h-12);ctx.restore();});
  ctx.fillStyle='white';ctx.font='17px sans-serif';ctx.fillText(`MYVOCAL 90 · ${t.toFixed(2)}s`,12,25);
 };
 useEffect(()=>{if(busy)return;draw(timeRef.current);},[plan,busy,status]);
 useEffect(()=>{if(!playing||busy)return;lastRef.current=0;const tick=stamp=>{if(!lastRef.current)lastRef.current=stamp;timeRef.current=Math.min(plan.durationSec,timeRef.current+(stamp-lastRef.current)/1000);lastRef.current=stamp;
  for(const m of plan.members){const src=sources.current.get(m.characterId);if(src?.kind==='person'&&src.element.readyState>=1){const should=Math.max(0,timeRef.current-m.startSec),diff=Math.abs(src.element.currentTime-should);if(diff>.1)try{src.element.currentTime=Math.min(should,src.element.duration||should);}catch{}}}
  try{draw(timeRef.current);}catch(e){setStatus(e.message);setPlaying(false);return;}
  setTime(timeRef.current);if(timeRef.current>=plan.durationSec){setPlaying(false);return;}frameRef.current=requestAnimationFrame(tick);};frameRef.current=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frameRef.current);},[playing,busy,plan]);
 const seek=t=>{timeRef.current=t;setTime(t);draw(t);};
 const save=()=>{try{onSave(saveBand90(project,characters,plan));notify('90단계 다중 캐릭터 공연 타임라인을 저장했습니다.');}catch(e){notify('공연 저장 오류: '+e.message);}};
 const record=async()=>{try{saveBand90(project,characters,plan);if(!supportedStageWebM())throw Error('이 브라우저는 무음 WebM 녹화를 지원하지 않습니다.');setPlaying(false);setBusy(true);const controller=new AbortController();abort.current=controller;
  const video=await recordStageWebM({canvas:canvas.current,duration:plan.durationSec,fps:plan.fps,draw:t=>{for(const m of plan.members){const src=sources.current.get(m.characterId);if(src?.kind==='person'&&src.element.readyState>=1)try{src.element.currentTime=Math.max(0,t-m.startSec);}catch{}}draw(t);},signal:controller.signal});download(video,'MYVOCAL-Step90-band.webm');notify('90단계 무음 밴드 영상 출력 완료');
 }catch(e){notify('밴드 영상 출력 실패: '+e.message);}finally{abort.current=null;setBusy(false);}};
 return <div className="modal-form" style={{maxHeight:'78vh',overflowY:'auto'}}><Notice>**STEP90 가상 밴드** · 최대 6명의 2D·3D·실제 사람을 단일 Canvas에 동시에 합성하고 각자의 STEP85/87/88/89 연출을 사용합니다. 출력은 **무음 WebM**입니다. 별도 가창 오디오 믹스나 MP4는 98단계입니다. 실제 사람은 등록 영상 프레임만 사용합니다.</Notice>
 <Field label="영상 길이 (2~30초)"><input type="number" min="2" max="30" value={plan.durationSec} disabled={busy} onChange={e=>patch('durationSec',Number(e.target.value))}/></Field>
 <Field label="FPS"><select value={plan.fps} onChange={e=>patch('fps',Number(e.target.value))}><option value={24}>24</option><option value={30}>30</option></select></Field>
 {plan.members.map((m,i)=><div className="hstack" key={i} style={{gap:6,flexWrap:'wrap',margin:'8px 0'}}><select aria-label={`멤버 ${i+1}`} value={m.characterId} onChange={e=>patchMember(i,'characterId',e.target.value)}>{available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label={`역할 ${i+1}`} value={m.role} onChange={e=>patchMember(i,'role',e.target.value)}>{BAND90_ROLES.map(role=><option key={role}>{role}</option>)}</select><select value={m.position} onChange={e=>patchMember(i,'position',e.target.value)}>{positions.map(pos=><option key={pos}>{pos}</option>)}</select><label>시작<input type="number" min="0" step="0.1" style={{width:58}} value={m.startSec} onChange={e=>patchMember(i,'startSec',Number(e.target.value))}/></label><label>종료<input type="number" min="0" step="0.1" style={{width:58}} value={m.endSec} onChange={e=>patchMember(i,'endSec',Number(e.target.value))}/></label><Button onClick={()=>patch('members',plan.members.filter((_,j)=>j!==i))}>제외</Button></div>)}
 <Button disabled={plan.members.length>=6||available.length<=plan.members.length} onClick={()=>patch('members',[...plan.members,{characterId:available.find(c=>!plan.members.some(m=>m.characterId===c.id))?.id||'',role:'harmony',position:'center',startSec:0,endSec:plan.durationSec}])}>멤버 추가</Button>
 <p role="status">{status}</p><canvas ref={canvas} width="960" height="540" style={{display:'block',width:'100%',height:'auto',background:'#111827'}} aria-label="90단계 가상 밴드 동시 공연"/>
 <div className="look-actions"><Button disabled={busy} onClick={()=>setPlaying(v=>!v)}>{playing?'일시정지':'재생'}</Button><span>{time.toFixed(2)} / {plan.durationSec}초</span></div><input type="range" min="0" max={plan.durationSec} step="0.02" value={time} disabled={busy} onChange={e=>{setPlaying(false);seek(Number(e.target.value));}} style={{width:'100%'}}/>
 <div className="modal-actions"><Button disabled={busy} onClick={()=>downloadText(JSON.stringify({format:'MYVOCAL_BAND90',...plan},null,2),'MYVOCAL-Step90-band.json','application/json')}>JSON</Button><Button disabled={busy} onClick={save}>공연 설정 저장</Button><Button disabled={busy||!supportedStageWebM()} onClick={record}>무음 WebM 출력</Button>{busy&&<Button onClick={()=>abort.current?.abort()}>중단</Button>}</div>
 <Notice>프로그램 내부 3D WebGL/2D Canvas 렌더러를 재사용합니다. GPU·웹캠·동영상 디코딩은 실제 Windows에서 확인이 필요합니다. 3D 호환 모프가 없으면 발음에 따른 입 변화가 보이지 않습니다. 90단계는 오디오 녹음/믹싱·개별 MIDI 악기 모델 접촉을 생성하지 않습니다.</Notice></div>;
}
