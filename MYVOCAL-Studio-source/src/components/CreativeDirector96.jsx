import React,{useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {previewCreativeDirection96,applyCreativeDirection96,directorCapabilities96} from '../lib/creativeDirector96.js';
export default function CreativeDirector96({project,onChange,notify}){
 const [command,setCommand]=useState(''),[plan,setPlan]=useState(null),[error,setError]=useState('');
 const inspect=()=>{try{setPlan(previewCreativeDirection96(project,command));setError('');}catch(e){setPlan(null);setError(e.message);}};
 const apply=()=>{try{onChange(applyCreativeDirection96(project,plan));setPlan(null);setCommand('');notify('로컬 프로젝트 변경 완료 · 이전 미디어 자산 보존');}catch(e){setPlan(null);setError(e.message);}};
 const caps=directorCapabilities96();
 return <Panel title="STEP96 · Creative Director" description="Music Director와 Video Director의 변경을 검토 후 프로젝트에 적용합니다. 외부 AI 호출 없음.">
  <label>한 번에 한 가지 로컬 명령<textarea rows={3} value={command} onChange={e=>{setCommand(e.target.value);setPlan(null);}} placeholder="BPM을 130으로 바꿔 / 후렴에서 기타를 더 강하게 해줘 / 베이스 오디오 음량을 50%로 설정해줘 / 배경을 비 오는 밤거리로 바꿔"/></label>
  <p className="muted">음악: {caps.music.join(', ')} · 영상: {caps.video.join(', ')}</p>
  <div className="hstack"><Button onClick={inspect}>변경 미리 검토</Button>{plan&&<Button variant="primary" onClick={apply}>검토한 변경 적용</Button>}</div>
  {plan&&<p role="status">변경 내용: {plan.summary} · {plan.action.domain==='music'?'Music Director':'Video Director'}</p>}
  {error&&<p role="alert">{error}</p>}
  <Notice>지원하지 않는 명령은 거부합니다. 신경망 WAV 음량·음소거는 실제 재생·믹스 트랙에 반영됩니다. 구간별 MIDI 쉼표·복원·강약·길이·음높이는 MIDI 음표만 편집하며 기존 WAV를 재생성하지 않습니다. 원본 오디오를 덮어쓰지 않습니다. 실제 생성 AI·가창 AI를 호출하지 않습니다.</Notice>
 </Panel>;
}
