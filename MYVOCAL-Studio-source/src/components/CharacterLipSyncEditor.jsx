import React,{useState} from 'react';
import {Button,Field,Notice} from './UI';
import {parseLipSyncLines,lipSyncLines,saveLipSync,visemeAt} from '../lib/characterLipSync.js';
export default function CharacterLipSyncEditor({character,onSave,notify}){
 const [source,setSource]=useState(character.lipSync?lipSyncLines(character.lipSync):'0.000,0.300,ㅁ,마\n0.300,0.600,ㅏ,마');
 const [time,setTime]=useState(0);let result,error='';try{result=parseLipSyncLines(source);}catch(e){error=e.message;}
 const duration=result?.cues.at(-1)?.endMs/1000||0;const active=result?visemeAt(result,time):{viseme:'sil',weight:0,lyric:''};
 return <div className="modal-form"><Notice>STEP85 · 캐릭터 Lip Sync. 음소 타이밍은 자동 추측하지 않습니다. Singing에서 확보한 시간 또는 직접 검토한 시간을 초 단위로 입력하세요. 기존 2D 입 영역과 3D VRM 표정 모프에 연결됩니다. 모델에 해당 모프가 없으면 3D 입 모양은 변하지 않습니다.</Notice>
 <Field label="시작초,종료초,음소,가사 (한 줄에 하나)"><textarea rows="9" value={source} onChange={e=>setSource(e.target.value)}/></Field>
 {error?<p role="alert">{error}</p>:<><p>음소 {result.cues.length}개 · 길이 {duration.toFixed(3)}초</p><input aria-label="Lip Sync 시간" type="range" min="0" max={Math.max(.001,duration)} step=".01" value={Math.min(time,duration)} onChange={e=>setTime(Number(e.target.value))}/><p>현재 {time.toFixed(2)}초 · Viseme {active.viseme} · 가사 {active.lyric}</p></>}
 <Button disabled={!!error} onClick={()=>{try{onSave(saveLipSync(character,result));notify('STEP85 캐릭터 Lip Sync 저장 완료');}catch(e){notify(e.message);}}}>Lip Sync 저장</Button></div>;
}
