import React,{useState} from 'react';
import {Button,Field,Notice} from './UI';
import {parseLipSyncLines,lipSyncLines,saveLipSync,visemeAt} from '../lib/characterLipSync.js';
import {readAudioInfo} from '../lib/audioEngine';
import {getFile} from '../lib/assetDb.js';
import {projectVocalSources} from '../lib/lipSyncProjectSources.js';
import {lipSyncFromSingingAudio} from '../lib/audioDrivenLipSync.js';
import {isAlignmentStale} from '../lib/lyricAlignment.js';
export default function CharacterLipSyncEditor({character,onSave,notify,projects=[]}){
 const [source,setSource]=useState(character.lipSync?lipSyncLines(character.lipSync):'0.000,0.300,ㅁ,마\n0.300,0.600,ㅏ,마');
 const eligible=(projects||[]).filter(p=>p?.vocalAlignment?.cues?.length&&!isAlignmentStale(p,p.vocalAlignment));
 const [projectId,setProjectId]=useState(''),[assetId,setAssetId]=useState(''),[audio,setAudio]=useState(null),[processing,setProcessing]=useState(false),[audioError,setAudioError]=useState('');
 const activeProject=eligible.find(p=>p.id===projectId)||eligible[0];
 const storedVocal=projectVocalSources(activeProject);
 const selectedStoredId=storedVocal.some(s=>s.assetId===assetId)?assetId:(storedVocal[0]?.assetId||'');
 const audioProposal=async()=>{if(!audio)return;setProcessing(true);setAudioError('');try{
  const project=eligible.find(p=>p.id===projectId)||eligible[0];if(!project)throw Error('노래 프로젝트의 가사·MIDI 싱크가 필요합니다.');
  if(audio.size>96*1024*1024||!audio.name?.toLowerCase().endsWith('.wav'))throw Error('96MB 이하의 실제 보컬 WAV를 선택하세요.');
  const decoded=await readAudioInfo(audio);
  const proposal=lipSyncFromSingingAudio(project.vocalAlignment,decoded);
  setSource(lipSyncLines(proposal));notify('실제 오디오의 발성 에너지와 MIDI 가사 타이밍으로 편집 가능한 입 모양 시간표를 만들었습니다. 검토 후 저장하세요.');
 }catch(e){setAudioError(e.message)}finally{setProcessing(false)}};
 const storedProposal=async()=>{setProcessing(true);setAudioError('');try{
  const selected=storedVocal.find(x=>x.assetId===selectedStoredId);
  if(!activeProject||!selected)throw Error('기존 프로젝트의 보컬 WAV 파일을 선택하세요.');
  const file=await getFile(selected.assetId);
  if(!file||!file.size||file.size>96*1024*1024||(!String(file.type).includes('wav')&&!String(file.name||selected.name).toLowerCase().endsWith('.wav')))
   throw Error('보컬 원본 파일이 없거나 WAV 형식이 아닙니다. 백업을 확인하세요.');
  const decoded=await readAudioInfo(file);
  const proposal=lipSyncFromSingingAudio(activeProject.vocalAlignment,decoded);
  setSource(lipSyncLines(proposal));notify('기존 보컬 WAV를 다시 업로드하지 않고 Lip Sync 제안을 만들었습니다. 편집 후 저장하세요.');
 }catch(e){setAudioError(e.message)}finally{setProcessing(false)}};
 const [time,setTime]=useState(0);let result,error='';try{result=parseLipSyncLines(source);}catch(e){error=e.message;}
 const duration=result?.cues.at(-1)?.endMs/1000||0;const active=result?visemeAt(result,time):{viseme:'sil',weight:0,lyric:''};
 return <div className="modal-form"><Notice>STEP85 · 캐릭터 Lip Sync. 음소 타이밍은 자동 추측하지 않습니다. Singing에서 확보한 시간 또는 직접 검토한 시간을 초 단위로 입력하세요. 기존 2D 입 영역과 3D VRM 표정 모프에 연결됩니다. 모델에 해당 모프가 없으면 3D 입 모양은 변하지 않습니다.</Notice>
 <Notice>프로젝트 MIDI·가사가 바뀌어 이전 싱크가 오래된 경우에는 Singing 작업실에서 싱크를 다시 생성해야 합니다.</Notice>
 <Notice>실제 보컬 WAV의 음량과 프로젝트 가사·MIDI 싱크를 사용해 입 모양을 제안합니다. 음소 자동 인식·신경망 얼굴 변형은 아니며, 만들어진 시간표를 아래에서 수정·검토한 뒤 저장하세요.</Notice>
 {eligible.length>0&&<><Field label="가사·MIDI가 있는 프로젝트"><select value={projectId||eligible[0].id} disabled={processing} onChange={e=>{setProjectId(e.target.value);setAssetId("");setAudioError("")}}>{eligible.map(p=><option key={p.id} value={p.id}>{p.title||p.id}</option>)}</select></Field>
 {storedVocal.length>0&&<><Field label="프로젝트에 저장된 보컬 WAV"><select value={selectedStoredId} disabled={processing} onChange={e=>setAssetId(e.target.value)}>{storedVocal.map(s=><option key={s.assetId} value={s.assetId}>{s.trackName} · {s.name}</option>)}</select></Field>
 <Button disabled={processing} onClick={storedProposal}>프로젝트 보컬로 Lip Sync 시간표 생성</Button></>}
 <Field label="실제 노래 WAV"><input type="file" accept=".wav,audio/wav" disabled={processing} onChange={e=>setAudio(e.target.files?.[0]||null)}/></Field>
 <Button disabled={!audio||processing} onClick={audioProposal}>{processing?'실제 오디오 분석 중':'보컬 WAV + MIDI로 Lip Sync 시간표 생성'}</Button>
 {audioError&&<p role="alert">{audioError}</p>}</>}
 <Field label="시작초,종료초,음소,가사 (한 줄에 하나)"><textarea rows="9" value={source} onChange={e=>setSource(e.target.value)}/></Field>
 {error?<p role="alert">{error}</p>:<><p>음소 {result.cues.length}개 · 길이 {duration.toFixed(3)}초</p><input aria-label="Lip Sync 시간" type="range" min="0" max={Math.max(.001,duration)} step=".01" value={Math.min(time,duration)} onChange={e=>setTime(Number(e.target.value))}/><p>현재 {time.toFixed(2)}초 · Viseme {active.viseme} · 가사 {active.lyric}</p></>}
 <Button disabled={!!error} onClick={()=>{try{onSave(saveLipSync(character,result));notify('STEP85 캐릭터 Lip Sync 저장 완료');}catch(e){notify(e.message);}}}>Lip Sync 저장</Button></div>;
}
