import React,{useEffect,useRef,useState} from 'react';
import {Button,Icon,Notice} from './UI';
import {genId} from '../lib/schema';
import {putFile} from '../lib/assetDb';
import {AudioEngine,audioBufferFor,audioEnd,formatClock,forgetAudio,mixdownWav,readAudioInfo,secondsPerBar} from '../lib/audioEngine';
import {downloadText} from '../lib/store';
const palette=['#a48dff','#62c5fe','#f58fbb','#7dddb5','#f1b97b','#9d9efb','#8dd6db','#e3aeef'];
const BAR=38,HEADER=230;
const safe=(s)=>String(s||'Project').replace(/[\\/:*?"<>|]/g,'_');
function Waveform({assetId,width,color}){
 const seen=useRef('');const [error,setError]=useState('');
 // Callback-ref ensures painting also happens when a custom offline UI runtime
 // batches extra renders before running its normal effect queue.
 const paint=(el)=>{if(!el||!assetId)return;const key=assetId+':'+width+':'+color;if(seen.current===key)return;seen.current=key;
  audioBufferFor(assetId).then(buf=>{
   if(!el.isConnected)return;
   const w=Math.max(50,Math.round(width)),h=46;el.width=w;el.height=h;
   const context=el.getContext('2d');if(!context)return;
   const channel=buf.getChannelData(0),step=Math.max(1,Math.ceil(channel.length/w));
   context.clearRect(0,0,w,h);context.strokeStyle=color;context.lineWidth=1;context.beginPath();
   for(let x=0;x<w;x++){
    const begin=x*step,end=Math.min(channel.length,begin+step),increment=Math.max(1,Math.floor((end-begin)/32));
    let peak=0;for(let i=begin;i<end;i+=increment)peak=Math.max(peak,Math.abs(channel[i]));
    peak=Math.max(.012,peak);context.moveTo(x,h/2-peak*(h/2-3));context.lineTo(x,h/2+peak*(h/2-3));
   }context.stroke();
  }).catch(()=>setError('파일 없음'));
 };
 return error?<span className="mv2-wave-error">{error}</span>:<canvas className="mv2-wave" ref={paint} style={{width:'100%',height:46}} aria-label="오디오 파형"/>;
}
export default function AudioWorkstation({project:p,onChange,notify}){
 const [newTrack,setNewTrack]=useState(''),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState('');
 const engine=useRef(null),fileInputs=useRef({}),positionRef=useRef(0),playState=useRef(false),projectRef=useRef(p);
 if(!engine.current)engine.current=new AudioEngine();
 projectRef.current=p;
 const change=patch=>onChange({...projectRef.current,...patch});
 const changeTrack=(trackId,patch)=>change({tracks:projectRef.current.tracks.map(t=>t.id===trackId?{...t,...patch}:t)});
 const changeClip=(trackId,clipId,patch)=>change({tracks:projectRef.current.tracks.map(t=>t.id!==trackId?t:{...t,clips:(t.clips||[]).map(c=>c.id===clipId?{...c,...patch}:c)})});
 const duration=audioEnd(p),secBar=secondsPerBar(p.bpm),maxBars=Math.max(24,p.sections.reduce((v,s)=>v+(Number(s.bars)||0),0),Math.ceil(duration/secBar)+2),laneWidth=Math.round(maxBars*BAR);
 const activeClips=p.tracks.reduce((x,t)=>x+(t.clips||[]).length,0);
 const activeNotes=p.tracks.reduce((x,t)=>x+(t.midiNotes||[]).length,0);
 const updatePosition=x=>{positionRef.current=x;setPosition(x);};
 const stop=(reset=false)=>{engine.current.stop(reset?0:undefined);playState.current=false;setPlaying(false);updatePosition(reset?0:Math.min(engine.current.position(),duration));};
 const start=async(at)=>{
  if(busy)return;
  setBusy('오디오 불러오는 중');
  try {const ok=await engine.current.play(projectRef.current,at);if(ok){playState.current=true;setPlaying(true);updatePosition(at);}}
  catch(e){playState.current=false;setPlaying(false);notify('재생 실패: '+e.message);}
  finally{setBusy('');}
 };
 const toggle=()=>{if(playState.current)stop();else start(positionRef.current>=duration-.01?0:positionRef.current);};
 const seek=sec=>{const at=Math.max(0,Math.min(duration,sec));updatePosition(at);if(playState.current)start(at);else engine.current.stop(at);};
 useEffect(()=>{return()=>{engine.current?.stop(0);playState.current=false;};},[]);
 useEffect(()=>{engine.current.updateGains(p.tracks);},[p.tracks.map(t=>t.id+':'+t.volume+':'+t.mute+':'+t.solo).join('|')]);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{
   const t=engine.current.position(),max=audioEnd(projectRef.current);
   if(t>=max){engine.current.stop(0);playState.current=false;setPlaying(false);updatePosition(0);}
   else updatePosition(t);
  },90);return()=>clearInterval(timer);
 },[playing]);
 useEffect(()=>{if(!playing)return;const pos=engine.current.position();engine.current.stop(pos);playState.current=false;setPlaying(false);updatePosition(pos);notify('BPM/클립 위치가 변경되어 재생을 멈췄습니다.');},[p.bpm,p.tracks.map(t=>(t.clips||[]).map(c=>c.id+':'+c.startBar+':'+c.assetId).join('|')).join('~')]);
 const importAudio=async(track,files)=>{
  if(!files?.length)return;setBusy('오디오 가져오는 중');const added=[];
  try{
   let last=Math.max(1,...(track.clips||[]).map(c=>Math.ceil((Number(c.startBar)||1)+(Number(c.durationSec)||0)/secBar)));
   for(const f of files){
    if(f.size>90*1024*1024)throw new Error(f.name+'은 90MB를 초과합니다.');
    const decoded=await readAudioInfo(f);if(decoded.duration>8*60)throw new Error(f.name+'은 8분을 초과합니다.');
    const assetId=genId('audio');await putFile(assetId,f);forgetAudio(assetId);
    added.push({id:genId('clip'),assetId,fileName:f.name,durationSec:decoded.duration,startBar:last,size:f.size});
    last=Math.ceil(last+decoded.duration/secBar);
   }
   const latest=projectRef.current;
   change({tracks:latest.tracks.map(t=>t.id!==track.id?t:{...t,clips:[...(t.clips||[]),...added]})});
   notify(added.length+'개 오디오 클립을 '+track.name+' 트랙에 추가했습니다.');
  }catch(e){notify('오디오 가져오기 실패: '+e.message);}
  finally{setBusy('');}
 };
 const addTrack=()=>{const current=projectRef.current;change({tracks:[...current.tracks,{id:genId('trk'),name:newTrack.trim()||`Audio Track ${current.tracks.length+1}`,type:'instrument',mute:false,solo:false,volume:80,clips:[]}]});setNewTrack('');};
 const exportMix=async()=>{setBusy('WAV 믹싱 중');try{const wav=await mixdownWav(p);const url=URL.createObjectURL(wav),a=document.createElement('a');a.href=url;a.download=safe(p.title)+'-mix.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);notify('WAV 믹스를 내보냈습니다. (16비트 / 44.1kHz 스테레오)');}catch(e){notify('WAV 내보내기 실패: '+e.message);}finally{setBusy('');}};
 return <>
  <div className="panel mv2-editor">
   <div className="panel-top"><div><h3>오디오 · MIDI 멀티트랙 편집기</h3><p>오디오 파일과 MIDI 합성음을 동시에 재생하고 WAV로 믹싱합니다. MIDI 입력은 위 피아노 롤 탭에서 편집하세요.</p></div><span className="hint-pill">{p.tracks.length} TRACKS · {activeClips} AUDIO · {activeNotes} MIDI</span></div>
   <div className="mv2-transport" role="group" aria-label="오디오 재생 제어">
    <button className="mv2-play" onClick={toggle} disabled={!!busy||!duration} title={playing?'일시정지':'재생'}>{playing?'Ⅱ':'▶'}</button>
    <button className="mv2-stop" onClick={()=>stop(true)} disabled={!!busy} title="처음으로"><span>■</span></button>
    <div className="mv2-time"><strong>{formatClock(position)}</strong><span> / {formatClock(duration)}</span></div>
    <input className="mv2-seek" aria-label="재생 위치" type="range" min="0" max={Math.max(.01,duration)} step="0.01" value={Math.min(position,Math.max(.01,duration))} onChange={e=>seek(Number(e.target.value))} disabled={!duration||!!busy}/>
    <span className="mv2-bpm">{p.bpm} BPM</span>
    <Button onClick={exportMix} icon="download" disabled={!duration||!!busy}>WAV 믹스 저장</Button>
   </div>
   {busy&&<div className="mv2-busy" role="status">{busy}...</div>}
   <div className="mv2-scroll" aria-label="오디오 편집 타임라인">
    <div className="mv2-lines" style={{width:HEADER+laneWidth}}>
     <div className="mv2-ruler"><div className="mv2-trackhead mv2-rulerhead">TRACK / BAR</div><div className="mv2-barlabels" style={{width:laneWidth}} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();seek((e.clientX-rect.left)/BAR*secBar)}}>{Array.from({length:maxBars},(_,i)=><span key={i} style={{width:BAR}}>{i%2===0?i+1:''}</span>)}</div></div>
     {p.tracks.map((track,index)=>{
      const color=palette[index%palette.length];return <div className="mv2-row" key={track.id}>
       <div className="mv2-trackhead"><div className="mv2-trackname"><i style={{background:color}}/><input value={track.name} aria-label="트랙 이름" onChange={e=>changeTrack(track.id,{name:e.target.value})}/></div>
       <div className="mv2-tracktools"><button className={track.mute?'on':''} title="음소거" onClick={()=>changeTrack(track.id,{mute:!track.mute})}>M</button><button className={track.solo?'on':''} title="솔로" onClick={()=>changeTrack(track.id,{solo:!track.solo})}>S</button><button title="오디오 파일 추가" onClick={()=>fileInputs.current[track.id]?.click()}>＋ Audio</button><input ref={node=>fileInputs.current[track.id]=node} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" multiple hidden onChange={e=>{importAudio(track,[...e.target.files]);e.target.value='';}}/></div></div>
       <div className="mv2-lane" style={{width:laneWidth,backgroundSize:`${BAR}px 100%`}}>
        {(track.midiNotes||[]).map(n=><div className="mv3-audio-midi" key={n.id} style={{left:Math.max(0,Number(n.startBeat)||0)/4*BAR,width:Math.max(3,Math.max(.1,Number(n.length)||1)/4*BAR-2),background:color}} title={`MIDI ${n.pitch} · ${n.startBeat+1}박`} />)}
        {(track.clips||[]).map(clip=>{const clipWidth=Math.max(52,(Number(clip.durationSec)||0)/secBar*BAR);const left=(Math.max(1,Number(clip.startBar)||1)-1)*BAR;return <div className="mv2-clip" key={clip.id} style={{left,width:clipWidth,borderColor:color,backgroundColor:color+'20'}} title={clip.fileName}>
         <div className="mv2-cliptitle" style={{color}} title={clip.fileName}>{clip.fileName}</div><Waveform assetId={clip.assetId} width={clipWidth-12} color={color}/></div>;})}
       </div>
      </div>;
     })}
     <div className="mv2-row mv2-last"><div className="mv2-trackhead mv2-new-track"><input value={newTrack} placeholder="새 트랙 이름" aria-label="새 트랙 이름" onChange={e=>setNewTrack(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTrack()}/><button onClick={addTrack} title="트랙 추가"><Icon name="plus" size={15}/></button></div><div className="mv2-lastlane"/></div>
     <div className="mv2-cursor" aria-hidden="true" style={{left:HEADER+position/secBar*BAR}}><span/></div>
    </div>
   </div>
   <div className="mv2-list">
    <h4>오디오 클립 설정</h4>
    {p.tracks.flatMap((t,idx)=>(t.clips||[]).map(c=><div className="mv2-cliprow" key={c.id}>
     <span className="mv2-clip-color" style={{background:palette[idx%palette.length]}}/>
     <span className="mv2-clipfile" title={c.fileName}>{t.name} / {c.fileName}</span>
     <label>시작 마디 <input type="number" min="1" max="999" aria-label={`${c.fileName} 시작 마디`} value={c.startBar||1} onChange={e=>changeClip(t.id,c.id,{startBar:Math.max(1,Number(e.target.value)||1)})}/></label>
     <span className="mv2-clipdur">{formatClock(c.durationSec)}</span>
     <button className="mv2-trash" aria-label={`${c.fileName} 삭제`} onClick={()=>{if(confirm(`'${c.fileName}' 클립을 제거하시겠습니까?`))changeTrack(t.id,{clips:t.clips.filter(x=>x.id!==c.id)});}}><Icon name="trash" size={16}/></button>
    </div>))}
    {!activeClips&&<div className="mv2-empty">각 트랙에서 <strong>＋ Audio</strong>를 눌러 오디오 파일을 불러와 주세요.</div>}
   </div>
  </div>
  <div className="panel"><div className="panel-top"><div><h3>실시간 믹서</h3><p>재생 및 WAV 믹스에 트랙별 볼륨·음소거·솔로가 적용됩니다.</p></div></div>
   <div className="mixer-list">{p.tracks.map((t,i)=><div className="mixer-row" key={t.id}><span className="track-color" style={{background:palette[i%palette.length]}}/><span>{t.name}</span><input aria-label={`${t.name} 음량`} type="range" min="0" max="100" value={t.volume} onChange={e=>changeTrack(t.id,{volume:Number(e.target.value)})}/><strong>{t.volume}%</strong></div>)}</div>
  </div>
  <Notice>오디오는 PC 내부에서 처리하며 외부로 전송하지 않습니다. 클립의 실제 오디오 파일은 로컬 IndexedDB에 저장됩니다. 일반 프로젝트 JSON에는 오디오 원본이 포함되지 않으므로 별도의 전체 백업 기능을 사용하세요. MIDI 피아노 롤과 로컬 신스 재생은 지원합니다. AI 작곡과 AI 보컬 합성은 아직 미구현입니다.</Notice>
 </>;
}
