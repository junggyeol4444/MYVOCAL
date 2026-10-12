import React,{useEffect,useRef,useState} from 'react';
import {Button,Icon,Notice} from './UI';
import {genId} from '../lib/schema';
import {AudioEngine,audioEnd,formatClock,mixdownWav} from '../lib/audioEngine';
import {instruments,pitchName,previewNote,chordPitches} from '../lib/midiEngine';
import {createMidiFile,parseMidiFile} from '../lib/midiFile';

const ROW=21,BEAT=25,PITCHES=Array.from({length:61},(_,i)=>96-i),BAR_BEATS=4;
const clamp=(a,min,max)=>Math.max(min,Math.min(max,a));
const midiSafe=s=>String(s||'project').replace(/[\\/:*?"<>|]/g,'_');
const saveBlob=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);};
const makeNote=(pitch,startBeat,length,velocity=95)=>({id:genId('note'),pitch,startBeat,length,velocity});
const isBlack=p=>[1,3,6,8,10].includes(p%12);

export default function MidiEditor({project:p,onChange,notify}){
 const [trackId,setTrackId]=useState(()=>p.tracks.find(t=>t.name==='Piano')?.id||p.tracks[0]?.id||'');
 const [selected,setSelected]=useState('');
 const [length,setLength]=useState(1);
 const [snap,setSnap]=useState(.5);
 const [octave,setOctave]=useState(4);
 const [playing,setPlaying]=useState(false);
 const [position,setPosition]=useState(0);
 const [busy,setBusy]=useState('');
 const [newTrackName,setNewTrackName]=useState('');
 const engine=useRef(new AudioEngine()),projectRef=useRef(p),drag=useRef(null),rollRef=useRef(null),fileRef=useRef(null);
 projectRef.current=p;
 const track=p.tracks.find(t=>t.id===trackId)||p.tracks[0];
 const notes=track?.midiNotes||[];
 const edit=(patch)=>onChange({...projectRef.current,...patch});
 const editTrack=(id,patch)=>edit({tracks:projectRef.current.tracks.map(t=>t.id===id?{...t,...patch}:t)});
 const updateNote=(noteId,patch)=>{
  if(!track)return;
  editTrack(track.id,{midiNotes:(track.midiNotes||[]).map(n=>n.id===noteId?{...n,...patch}:n)});
 };
 const selectedNote=notes.find(n=>n.id===selected);
 const end=audioEnd(p);
 const bars=Math.min(80,Math.max(16,Math.ceil(Math.max(end,1)/(60/Math.max(40,p.bpm)*4))+2,(p.sections||[]).reduce((a,s)=>a+(+s.bars||0),0)));
 const totalBeats=bars*BAR_BEATS;
 const timelineWidth=totalBeats*BEAT;
 const snapBeat=value=>Math.max(0,Math.round(value/snap)*snap);
 const insertNote=(pitch,beat)=>{
  if(!track)return;
  const newN=makeNote(pitch,snapBeat(beat),length);
  editTrack(track.id,{midiNotes:[...notes,newN]});setSelected(newN.id);
  previewNote(pitch,track.instrument||'piano').catch(()=>{});
 };
 const deleteNote=()=>{if(!track||!selected)return;editTrack(track.id,{midiNotes:notes.filter(n=>n.id!==selected)});setSelected('');};
 const duplicateNote=()=>{if(!selectedNote)return;const n={...selectedNote,id:genId('note'),startBeat:selectedNote.startBeat+selectedNote.length};editTrack(track.id,{midiNotes:[...notes,n]});setSelected(n.id);};
 const addTrack=()=>{
  const t={id:genId('trk'),name:newTrackName.trim()||'New MIDI',type:'instrument',mute:false,solo:false,volume:78,clips:[],midiNotes:[],instrument:'piano'};
  edit({tracks:[...p.tracks,t]});setTrackId(t.id);setNewTrackName('');notify('MIDI 트랙을 추가했습니다.');
 };
 const demo=()=>{
  if(!track)return;
  const riff=[[60,0,1],[64,1,.5],[67,1.5,.5],[72,2,2],[69,4,1],[67,5,1],[64,6,1],[60,7,1]];
  editTrack(track.id,{midiNotes:[...notes,...riff.map(([pitch,beat,len])=>makeNote(pitch,beat,len,90))]});
  notify('예제 음표 8개를 추가했습니다. AI 작곡 결과가 아닌 기본 샘플입니다.');
 };
 const play=async()=>{
  if(playing){engine.current.stop();setPlaying(false);return;}
  setBusy('소리 준비 중');
  try{const duration=audioEnd(projectRef.current);const start=position>=duration-.02?0:position;await engine.current.play(projectRef.current,start);setPlaying(true);setPosition(start);}
  catch(e){notify('재생 실패: '+e.message);}finally{setBusy('');}
 };
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{
  const t=engine.current.position(),duration=audioEnd(projectRef.current);
  if(t>=duration){engine.current.stop(0);setPlaying(false);setPosition(0);}else setPosition(t);
 },100);return()=>clearInterval(timer);},[playing]);
 useEffect(()=>()=>{engine.current.stop(0);},[]);
 useEffect(()=>{requestAnimationFrame(()=>{if(rollRef.current)rollRef.current.scrollTop=(96-60)*ROW-210;});},[trackId,p.id]);
 // Prevent stale notes from playing when the active project or tempo is changed.
 useEffect(()=>{if(playing){engine.current.stop(0);setPlaying(false);setPosition(0);}},[p.id,p.bpm,p.tracks.map(t=>(t.midiNotes||[]).map(n=>`${n.id}:${n.pitch}:${n.startBeat}:${n.length}`).join(',')).join('|')]);
 useEffect(()=>{if(!p.tracks.some(t=>t.id===trackId))setTrackId(p.tracks[0]?.id||'');},[p.id,p.tracks.length]);
 const exportWav=async()=>{setBusy('WAV 렌더링 중');try{saveBlob(await mixdownWav(p),midiSafe(p.title)+'-midi-mix.wav');notify('MIDI와 오디오가 합쳐진 WAV를 저장했습니다.');}catch(e){notify(e.message);}finally{setBusy('');}};
 const importMidi=async(file)=>{
  if(!file)return;setBusy('MIDI 읽는 중');
  try{
   const result=await parseMidiFile(file);
   if(!result.tracks.length)throw Error('가져올 음표가 없습니다.');
   const newTracks=result.tracks.map(t=>({id:genId('trk'),name:t.name,type:'instrument',mute:false,solo:false,volume:72,clips:[],instrument:t.instrument,midiNotes:t.notes.map(n=>({...n,id:genId('note')}))}));
   edit({tracks:[...p.tracks,...newTracks],...(result.bpm?{bpm:clamp(result.bpm,40,300)}:{})});
   setTrackId(newTracks[0].id);setSelected('');notify(`MIDI 트랙 ${newTracks.length}개를 가져왔습니다.`);
  }catch(e){notify('MIDI 가져오기 실패: '+e.message);}finally{setBusy('');}
 };
 const changeChord=(id,patch)=>edit({chords:(p.chords||[]).map(c=>c.id===id?{...c,...patch}:c)});
 const addChord=()=>{
  const last=(p.chords||[]).reduce((m,c)=>Math.max(m,(+c.bar||1)+(+c.bars||1)),1);
  edit({chords:[...(p.chords||[]),{id:genId('chd'),bar:last,bars:2,symbol:'C'}]});
 };
 const generateChordNotes=()=>{
  if(!track)return;
  try{
   const sequence=(p.chords||[]).flatMap(c=>{
    const pitches=chordPitches(c.symbol,clamp(octave,1,6));
    const start=(Math.max(1,+c.bar||1)-1)*4,barlen=clamp(+c.bars||1,1,32)*4;
    return pitches.map(pitch=>makeNote(pitch,start,barlen,78));
   });
   if(!sequence.length)throw Error('코드를 먼저 추가해 주세요.');
   editTrack(track.id,{midiNotes:[...notes,...sequence]});notify(`${sequence.length}개의 코드 음표를 '${track.name}' 트랙에 추가했습니다.`);
  }catch(e){notify(e.message);}
 };
 const noteKey=e=>{
  if(!selectedNote)return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(e.key))e.preventDefault();
  if(e.key==='Delete'||e.key==='Backspace')deleteNote();
  if(e.key==='ArrowLeft')updateNote(selected,{startBeat:snapBeat(selectedNote.startBeat-snap)});
  if(e.key==='ArrowRight')updateNote(selected,{startBeat:snapBeat(selectedNote.startBeat+snap)});
  if(e.key==='ArrowUp')updateNote(selected,{pitch:clamp(selectedNote.pitch+1,0,127)});
  if(e.key==='ArrowDown')updateNote(selected,{pitch:clamp(selectedNote.pitch-1,0,127)});
 };
 return <>
 <div className="panel mv3-studio">
  <div className="panel-top"><div><h3>MIDI 피아노 롤 · 작곡 편집기</h3><p>음표를 클릭해서 배치하고, 옮기고, 길이를 바꾼 뒤 악기로 재생할 수 있습니다. AI 작곡은 아직 미연결입니다.</p></div><span className="hint-pill">{notes.length} NOTES · {p.tracks.reduce((a,t)=>a+(t.midiNotes||[]).length,0)} TOTAL</span></div>
  <div className="mv3-transport">
    <button className="mv2-play" aria-label={playing?'일시정지':'재생'} onClick={play} disabled={!!busy||!end}>{playing?'Ⅱ':'▶'}</button>
    <button className="mv2-stop" aria-label="정지" onClick={()=>{engine.current.stop(0);setPlaying(false);setPosition(0)}}>■</button>
    <span className="mv2-time"><strong>{formatClock(position)}</strong> / {formatClock(end)}</span>
    <input type="range" aria-label="재생 위치" min={0} max={Math.max(end,.01)} step={.01} value={Math.min(position,end)} onChange={e=>{const x=+e.target.value;engine.current.stop(x);setPlaying(false);setPosition(x);}} disabled={!end}/>
    <Button icon="download" onClick={()=>saveBlob(createMidiFile(p),midiSafe(p.title)+'.mid')}>MIDI 저장</Button>
    <Button icon="download" onClick={exportWav} disabled={!end||!!busy}>WAV 저장</Button>
    <Button icon="plus" onClick={()=>fileRef.current?.click()} disabled={!!busy}>MIDI 가져오기</Button>
    <input hidden type="file" ref={fileRef} accept=".mid,.midi,audio/midi" onChange={e=>{importMidi(e.target.files?.[0]);e.target.value='';}}/>
  </div>
  {busy&&<div className="mv2-busy" role="status">{busy}</div>}
  <div className="mv3-toolbar">
   <label>편집 트랙 <select aria-label="MIDI 편집 트랙" value={track?.id||''} onChange={e=>{setTrackId(e.target.value);setSelected('');}}>{p.tracks.map(t=><option value={t.id} key={t.id}>{t.name} ({(t.midiNotes||[]).length})</option>)}</select></label>
   <label>악기 <select aria-label="MIDI 악기" value={track?.instrument||'piano'} onChange={e=>editTrack(track.id,{instrument:e.target.value})}>{instruments.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
   <label>스냅 <select value={snap} onChange={e=>setSnap(+e.target.value)} aria-label="그리드 스냅">{[[.25,'1/16'],[.5,'1/8'],[1,'1/4'],[2,'1/2'],[4,'1마디']].map(([val,name])=><option value={val} key={val}>{name}</option>)}</select></label>
   <label>음표 길이 <select aria-label="기본 음표 길이" value={length} onChange={e=>setLength(+e.target.value)}>{[[.25,'1/16'],[.5,'1/8'],[1,'1/4'],[2,'1/2'],[4,'1마디'],[8,'2마디']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
   <Button icon="plus" onClick={demo}>샘플 리프</Button>
  </div>
  <div className="mv3-piano-scroll" ref={el=>{rollRef.current=el;if(el&&!el.dataset.initialScroll){el.dataset.initialScroll="yes";requestAnimationFrame(()=>{el.scrollTop=(96-60)*ROW-210;});}}} aria-label="MIDI 피아노 롤 음표 그리드">
   <div className="mv3-piano" style={{width:timelineWidth+58}}>
    <div className="mv3-barheader"><div className="mv3-keylabel">PITCH</div><div className="mv3-bars" style={{width:timelineWidth}}>{Array.from({length:bars},(_,i)=><span style={{width:BEAT*4}} key={i}>BAR {i+1}</span>)}</div></div>
    <div className="mv3-keysgrid" style={{height:PITCHES.length*ROW}}>
     <div className="mv3-keys">{PITCHES.map(pitch=><button key={pitch} type="button" title={`${pitchName(pitch)} 미리듣기`} className={`mv3-key ${isBlack(pitch)?'black':''} ${pitch%12===0?'is-c':''}`} style={{height:ROW}} onClick={()=>previewNote(pitch,track?.instrument||'piano').catch(e=>notify(e.message))}>{pitch%12===0?pitchName(pitch):isBlack(pitch)?'♯':''}</button>)}</div>
     <div className="mv3-grid" style={{width:timelineWidth,height:PITCHES.length*ROW}}>
      {PITCHES.map(pitch=><div className={`mv3-gridrow ${isBlack(pitch)?'black':''} ${pitch%12===0?'is-c':''}`} key={pitch} style={{height:ROW,width:timelineWidth,backgroundSize:`${BEAT}px ${ROW}px`}} onClick={e=>{
       const rect=e.currentTarget.getBoundingClientRect();insertNote(pitch,(e.clientX-rect.left)/BEAT);
      }}/>) }
      {notes.filter(n=>n.pitch>=PITCHES[PITCHES.length-1]&&n.pitch<=PITCHES[0]).map(n=><button key={n.id} type="button" draggable title={`${pitchName(n.pitch)} · ${n.startBeat+1}박 · ${n.length}박 (드래그로 이동)`} className={`mv3-note ${selected===n.id?'selected':''}`} style={{top:(PITCHES[0]-n.pitch)*ROW+1,left:n.startBeat*BEAT+1,width:Math.max(5,n.length*BEAT-2),height:ROW-2}} onClick={e=>{e.stopPropagation();setSelected(n.id);}} onKeyDown={noteKey} onDragStart={e=>{drag.current={id:n.id,x:e.clientX,y:e.clientY,startBeat:n.startBeat,pitch:n.pitch};e.dataTransfer.effectAllowed='move';}} onDragEnd={e=>{
       if(drag.current?.id!==n.id||e.clientX<=0)return;
       const beats=(e.clientX-drag.current.x)/BEAT,semi=-(e.clientY-drag.current.y)/ROW;
       updateNote(n.id,{startBeat:clamp(snapBeat(drag.current.startBeat+beats),0,totalBeats-1),pitch:clamp(drag.current.pitch+Math.round(semi),0,127)});drag.current=null;
      }}>{n.length>=1?pitchName(n.pitch):''}</button>)}
     </div>
    </div>
   </div>
  </div>
  <div className="mv3-note-panel" aria-label="선택한 음표 편집">
   {selectedNote?<>
    <strong>선택 음표: {pitchName(selectedNote.pitch)}</strong>
    <label>피치 <input aria-label="선택 음표 피치" type="number" min="0" max="127" value={selectedNote.pitch} onChange={e=>updateNote(selected,{pitch:clamp(+e.target.value,0,127)})}/></label>
    <label>시작 박자 <input aria-label="선택 음표 시작 박자" type="number" min="0" step={snap} value={selectedNote.startBeat} onChange={e=>updateNote(selected,{startBeat:clamp(+e.target.value,0,totalBeats)})}/></label>
    <label>길이 (박) <input aria-label="선택 음표 길이" type="number" min="0.25" max="64" step="0.25" value={selectedNote.length} onChange={e=>updateNote(selected,{length:clamp(+e.target.value,.25,64)})}/></label>
    <label>세기 <input aria-label="선택 음표 세기" type="number" min="1" max="127" value={selectedNote.velocity} onChange={e=>updateNote(selected,{velocity:clamp(+e.target.value,1,127)})}/></label>
    <Button onClick={duplicateNote}>복제</Button><Button icon="trash" onClick={deleteNote}>삭제</Button>
   </>:<span>그리드를 클릭해 음표를 추가하세요. 음표 선택 후 방향키 이동 · Delete 삭제 · 드래그 이동을 지원합니다.</span>}
  </div>
  <div className="mv3-addtrack"><input aria-label="새 MIDI 트랙 이름" placeholder="새 MIDI 트랙 이름" value={newTrackName} onChange={e=>setNewTrackName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addTrack();}}/><Button icon="plus" onClick={addTrack}>MIDI 트랙 추가</Button></div>
 </div>
 <div className="panel mv3-chordpanel">
  <div className="panel-top"><div><h3>코드 진행 편집기</h3><p>코드와 구간을 저장하고 선택한 MIDI 트랙에 화음 음표로 변환합니다.</p></div><div className="hstack"><label className="mv3-octave">옥타브 <select aria-label="코드 생성 옥타브" value={octave} onChange={e=>setOctave(+e.target.value)}>{[2,3,4,5].map(o=><option key={o} value={o}>{o}</option>)}</select></label><Button onClick={generateChordNotes} icon="plus">코드 → 음표 생성</Button></div></div>
  <div className="mv3-chords">{(p.chords||[]).map((c,i)=><div className="mv3-chord" key={c.id}><span className="mv3-index">{i+1}</span><label>코드 <input aria-label={`코드 ${i+1} 이름`} value={c.symbol} onChange={e=>changeChord(c.id,{symbol:e.target.value})}/></label><label>시작 마디 <input type="number" min="1" max="100" value={c.bar} onChange={e=>changeChord(c.id,{bar:clamp(+e.target.value,1,100)})}/></label><label>마디 수 <input type="number" min="1" max="32" value={c.bars} onChange={e=>changeChord(c.id,{bars:clamp(+e.target.value,1,32)})}/></label><button className="mv3-preview-chord" onClick={()=>{try{chordPitches(c.symbol,octave).forEach((p,i)=>setTimeout(()=>previewNote(p,track?.instrument||'piano').catch(()=>{}),i*45));}catch(e){notify(e.message);}}}>▶</button><button className="mv3-delete-chord" aria-label={`코드 ${i+1} 삭제`} onClick={()=>edit({chords:(p.chords||[]).filter(x=>x.id!==c.id)})}>✕</button></div>)}</div>
  <Button icon="plus" onClick={addChord}>코드 추가</Button>
  <p className="field-hint">지원 코드: C, Am, F, G, Dm7, Fmaj7, G7, Bdim, Dsus4 등. 이 기능은 규칙 기반 코드 배치이며 AI 자동 작곡이 아닙니다.</p>
 </div>
 <Notice>v0.3 MIDI 악기는 로컬에서 합성하는 간단한 소리입니다. 전문 가상악기(VST), 실제 MIDI 기기 연결, AI 멜로디 생성, 사운드폰트는 아직 지원하지 않습니다. 기존 프로젝트 오디오 트랙과 동시에 믹스할 수 있으며, 프로젝트 전체 백업에 MIDI 노트도 포함됩니다.</Notice>
 </>;
}
