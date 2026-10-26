import React,{useState} from 'react';
import {Button,Field,Notice,Panel} from './UI';
import {applyOwnedMusicMidiDynamics8,undoOwnedMusicMidiDynamics8} from '../lib/ownedMusicMidiDynamics8.js';
import {validateOwnedMusicStyle8} from '../lib/ownedMusicStyle8.js';

// Reusable original #8 energy contour can drive actual editable velocities;
// this is user-confirmed deterministic MIDI editing, not fake neural training.
export default function OwnedMusicMidiDynamics8Panel({project,data,onChange,notify}){
 const [selected,setSelected]=useState(''),[strength,setStrength]=useState(65);
 const [status,setStatus]=useState('사용 허가된 내 음악의 실제 PCM 강약을 이 곡의 MIDI 벨로시티에 적용할 수 있습니다.');
 const profiles=(data?.musicStyles||[]).filter(p=>{
  try{return validateOwnedMusicStyle8(p)}catch{return false}
 });
 const apply=()=>{
  try{
   const profile=profiles.find(p=>p.id===selected);
   if(!profile)throw Error('실제 학습·분석 완료한 내 음악 스타일 프로필을 선택하세요.');
   const next=applyOwnedMusicMidiDynamics8(project,profile,{strength});
   onChange(next);
   const count=(next.ownedMusicMidiUndo8?.saved||[]).reduce((n,t)=>n+t.after.length,0);
   setStatus('기존 음표 '+count+'개에 원본 에너지 강약만 반영했습니다. 음높이·시작점·가사·트랙 원본은 보존했습니다.');
   notify('MY MUSIC STYLE · 실제 MIDI 벨로시티 '+count+'개에 내 음악 PCM 강약 적용 완료');
  }catch(error){setStatus('스타일 적용 보류: '+error.message);}
 };
 const undo=()=>{
  try{
   onChange(undoOwnedMusicMidiDynamics8(project));
   setStatus('이전 MIDI 벨로시티를 정확히 복원했습니다. 원본 음악과 개인 스타일 프로필은 유지했습니다.');
  }catch(error){setStatus('원본 덮어쓰기 차단 · 수동 MIDI 변경 보호: '+error.message);}
 };
 const active=project?.ownedMusicMidiUndo8;
 return <Panel title="MY MUSIC STYLE · 실제 원곡 PCM → 이 곡 MIDI 강약"
  description="본인 또는 학습 권한 있는 음악에서 분석한 RMS 강약을 현재 MIDI 노트의 Velocity에 적용합니다. 원곡의 멜로디·화음·샘플·가사는 복제하지 않으며 기존 MIDI를 그대로 복구할 수 있습니다.">
  <div className="form-two">
   <Field label="분석 완료한 내 음악 스타일"><select disabled={!!active} value={selected}
    onChange={e=>setSelected(e.target.value)}>
    <option value="">내 음악 에너지 프로필 선택</option>
    {profiles.map(p=><option key={p.id} value={p.id}>{p.name} · 실제 PCM 분석</option>)}
   </select></Field>
   <Field label={'강약 반영 정도 '+strength+'%'}><input type="range" min="0" max="100"
    disabled={!!active} value={strength} onChange={e=>setStrength(Number(e.target.value))}/></Field>
  </div>
  <div className="hstack">
   <Button disabled={!!active||!selected||!(project?.tracks||[]).some(t=>t.midiNotes?.length)}
    onClick={apply}>원곡 MIDI 음표 유지 + 강약만 실제 편집 적용</Button>
   <Button disabled={!active} onClick={undo}>적용 전 MIDI 강약 그대로 복원</Button>
  </div>
  {active&&<p className="muted">현재 적용: {profiles.find(p=>p.id===active.profileId)?.name||active.profileId} · {active.strength}%</p>}
  <p role="status">{status}</p>
  <Notice>사용자가 MIDI 음표를 스타일 적용 후 직접 고치면, 그 수정을 지우지 않도록 자동 복원은 차단됩니다. 저장된 실제 원곡 WAV는 수정하지 않습니다. 이 기능은 MIDI 강약 편집이며 완전한 신경망 음악 스타일 학습이 아닙니다.</Notice>
 </Panel>;
}
