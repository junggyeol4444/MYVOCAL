import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Panel} from './UI';
import {renderMidiSoundFont} from '../lib/midiSoundFontClient.js';
import {createMidiFile} from '../lib/midiFile.js';
import {readAudioInfo} from '../lib/audioEngine';
import {genId} from '../lib/schema';
import {putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
import {readMusicGenPreferences} from '../lib/musicGenPreferences.js';

// Existing Windows EXE MIDI editor extension. No new application or web product.
export default function MidiSoundFontPanel({project,onChange,notify}){
 const [python,setPython]=useState(()=>{try{return readMusicGenPreferences(window.localStorage).python||''}catch{return ''}});
 const [library,setLibrary]=useState(''),[soundfont,setSoundfont]=useState(''),[gain,setGain]=useState('0.2');
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
 const active=useRef(null),latest=useRef(project);latest.current=project;
 useEffect(()=>()=>active.current?.abort(),[]);
 useEffect(()=>{active.current?.abort();setError('');setProgress('')},[project.id]);
 const available=(project.tracks||[]).filter(t=>!t.mute&&Array.isArray(t.midiNotes)&&t.midiNotes.length);
 const render=async()=>{
  if(busy)return;
  const original=latest.current;
  const tracks=(original.tracks||[]).filter(t=>!t.mute&&Array.isArray(t.midiNotes)&&t.midiNotes.length);
  if(!tracks.length)return setError('현재 프로젝트에 MIDI 음표 트랙이 없습니다.');
  if(tracks.length>12)return setError('한 번에 최대 12개 MIDI 트랙을 렌더링할 수 있습니다.');
  const controller=new AbortController();active.current=controller;setBusy(true);setError('');
  const ids=[];
  try{
   const entries=[],newTracks=[];
   for(let i=0;i<tracks.length;i++){
    if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 렌더링 취소');
    const source=tracks[i];setProgress(`실제 SoundFont PCM 렌더링 ${i+1}/${tracks.length}`);
    const midi=createMidiFile({bpm:original.bpm,tracks:[source]});
    const wav=await renderMidiSoundFont(midi,{python,library,soundfont,gain:Number(gain)},{signal:controller.signal});
    if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 렌더링 취소');
    const info=await readAudioInfo(wav),id=genId('soundfont');
    const track=makeImportedVocalTrack(original,wav,id,info.duration);
    track.id=genId('trk');track.name=`SoundFont ${source.name||'악기'} WAV`;track.type='instrument';track.volume=75;
    ids.push(id);entries.push([id,wav]);newTracks.push(track);
   }
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 렌더링 취소');
   await putFilesAtomic(entries);
   if(controller.signal.aborted||latest.current!==original)throw Error('프로젝트 변경 또는 렌더링 취소');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...newTracks]}));
   ids.length=0;
   notify(`설치된 FluidSynth·SoundFont로 ${newTracks.length}개 MIDI 악기를 실제 PCM WAV로 렌더링하고 새 프로젝트 트랙에 추가했습니다.`);
  }catch(e){if(ids.length)await deleteFilesAtomic(ids).catch(()=>{});setError(e.message)}
  finally{active.current=null;setBusy(false);setProgress('')}
 };
 return <Panel title="MIDI → SoundFont 악기 WAV" description="기존 피아노 롤의 MIDI 음표를 사용자가 설치한 SoundFont 샘플 악기로 실제 PCM WAV에 렌더링합니다.">
  <p className="muted">인터넷 다운로드 없이 로컬 FluidSynth DLL과 권한 있는 SF2/SF3만 사용합니다. 기존 MIDI·음원·프로젝트 트랙은 변경하지 않고 결과 WAV 트랙만 추가합니다. 신경망 작곡이나 보컬 Singing 기능은 아닙니다.</p>
  <div className="mv10-grid">
   <Field label="설치된 Python.exe"><input value={python} disabled={busy} onChange={e=>setPython(e.target.value)} placeholder="D:\\AI\\python.exe"/></Field>
   <Field label="FluidSynth DLL 절대 경로"><input value={library} disabled={busy} onChange={e=>setLibrary(e.target.value)} placeholder="D:\\AI\\FluidSynth\\libfluidsynth-3.dll"/></Field>
   <Field label="사용 권한이 있는 SoundFont SF2/SF3"><input value={soundfont} disabled={busy} onChange={e=>setSoundfont(e.target.value)} placeholder="D:\\AI\\SoundFonts\\instrument.sf2"/></Field>
   <Field label="합성 음량 (0.01~1)"><input type="number" min="0.01" max="1" step="0.05" value={gain} disabled={busy} onChange={e=>setGain(e.target.value)}/></Field>
  </div>
  <p className="muted">렌더링 가능한 MIDI 트랙: {available.length}개 / 한 번에 최대 12개</p>
  <div className="mv7-actions"><Button disabled={busy||!python||!library||!soundfont||!available.length} onClick={render}>프로젝트 MIDI 전 트랙을 개별 WAV로 실제 렌더링·추가</Button>
   {busy&&<Button onClick={()=>active.current?.abort()}>SoundFont 렌더링 취소</Button>}</div>
  {progress&&<p role="status" className="muted">{progress}</p>}
  {error&&<p role="alert" className="mv4-error">{error}</p>}
 </Panel>;
}
