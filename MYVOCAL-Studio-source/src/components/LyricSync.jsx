import React,{useEffect,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {alignLyricNotes,midiVocalTracks,isAlignmentStale,createVocalExchangePackage,makeImportedVocalTrack} from '../lib/lyricAlignment';
import {genId} from '../lib/schema';
import {putFile,removeFile} from '../lib/assetDb';
import {readAudioInfo} from '../lib/audioEngine';

function saveFile(data,name){const blob=new Blob([data],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);}
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}.${String(Math.round((t%1)*10))}`;
export default function LyricSync({project:p,data,onChange,notify}){
 const tracks=midiVocalTracks(p);
 const saved=p.vocalAlignment&&!isAlignmentStale(p,p.vocalAlignment)?p.vocalAlignment:null;
 const [trackId,setTrackId]=useState(saved?.trackId||''),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[voiceId,setVoiceId]=useState(p.voiceId||''),[modelId,setModelId]=useState('');
 const voices=data.voices||[],voice=voices.find(v=>v.id===voiceId);
 const models=(data.voiceModels||[]).filter(m=>m.engineId!=='sampler'&&m.voiceId===voice?.id),model=models.find(m=>m.id===modelId);
 useEffect(()=>{setDraft(null);setTrackId('');setVoiceId(p.voiceId||'');setModelId('');},[p.id]);
 const current=draft||saved;
 function generate(){try{const value=alignLyricNotes(p,trackId);setDraft(value);notify('가사 글자와 MIDI 음표를 순서대로 배치했습니다. 발음 분석은 아닙니다.');}catch(e){notify('싱크 생성 실패: '+e.message)}}
 const edit=(i,text)=>setDraft({...current,cues:current.cues.map((c,j)=>j===i?{...c,lyric:text.slice(0,80)}:c)});
 function persist(){if(!current){notify('가사 싱크를 먼저 생성해 주세요.');return;}if(isAlignmentStale(p,current)){notify('원본 가사나 MIDI가 변경되었습니다. 다시 생성해 주세요.');return;}onChange({...p,vocalAlignment:current});setDraft(null);notify('가사·MIDI 싱크를 프로젝트에 저장했습니다.');}
 async function exportPackage(){if(!current)return;setBusy(true);try{const {bytes,fileName}=await createVocalExchangePackage(p,current,voice||null,model||null);saveFile(bytes,fileName);notify('외부 추론용 ZIP을 저장했습니다. MYVOCAL에서 AI 모델은 실행하지 않았습니다.');}catch(e){notify('추론 교환 ZIP 생성 실패: '+e.message)}finally{setBusy(false)}}
 async function importWav(file){if(!file)return;setBusy(true);let assetId='';try{
  if(!/\.wav$/i.test(file.name))throw Error('외부 렌더 결과는 WAV 파일만 지원합니다.');
  if(file.size>90*1024*1024)throw Error('최대 90MB만 지원합니다.');
  const header=new TextDecoder('ascii').decode(new Uint8Array(await file.slice(0,12).arrayBuffer()));
  if(!header.startsWith('RIFF')||!header.includes('WAVE'))throw Error('올바른 WAV 파일이 아닙니다.');
  const info=await readAudioInfo(file);if(!info.duration||info.duration>480)throw Error('오디오는 최대 8분만 지원합니다.');
  assetId=genId('vocal_wav');await putFile(assetId,file);
  const track=makeImportedVocalTrack(p,file,assetId,info.duration);
  onChange({...p,tracks:[...p.tracks,track]});notify('외부 보컬 WAV를 새 오디오 트랙으로 추가했습니다. 실제 목소리 합성은 외부에서 수행된 결과입니다.');
 }catch(e){if(assetId)await removeFile(assetId).catch(()=>{});notify('WAV 가져오기 실패: '+e.message)}finally{setBusy(false)}}
 return <>
  <Panel title="가사 ↔ MIDI 음표 싱크 · v0.9" description="가사를 MIDI 음표에 일대일로 수동 정렬하는 편집기입니다. 한국어는 글자 단위, 영어는 단어 단위로 자동 배치합니다.">
   <div className="mv9-controls">
    <Field label="보컬 MIDI 트랙"><select value={trackId||saved?.trackId||tracks[0]?.id||''} onChange={e=>{setTrackId(e.target.value);setDraft(null)}}>{tracks.map(t=><option value={t.id} key={t.id}>{t.name} ({t.midiNotes.length}음)</option>)}{!tracks.length&&<option value="">MIDI 트랙 없음</option>}</select></Field>
    <Button variant="primary" icon="spark" disabled={!tracks.length||busy} onClick={generate}>가사 자동 배치</Button>
    <Button icon="save" disabled={!current||busy} onClick={persist}>싱크 저장</Button>
   </div>
   {!tracks.length&&<Notice>먼저 MIDI 피아노 롤에서 보컬 멜로디를 만들어 주세요. 트랙이 있어야 가사를 음표에 배치할 수 있어요.</Notice>}
   {!String(p.lyrics||'').trim()&&<Notice>‘가사’ 탭에서 가사를 작성해 주세요. 가사 없이 생성하면 음표에 ‘—’가 표시됩니다.</Notice>}
   {p.vocalAlignment&&isAlignmentStale(p,p.vocalAlignment)&&<Notice>프로젝트의 MIDI·가사·BPM이 변경되어 이전 싱크는 오래된 상태입니다. ‘가사 자동 배치’를 다시 눌러 주세요.</Notice>}
   {current&&<>
    <div className="mv9-info"><Status>{draft?'미저장 편집':'프로젝트 저장됨'}</Status><span>음표 {current.cues.length}개 / 가사 요소 {current.syllablesTotal}개</span>{current.overflow>0&&<span className="mv9-warn">가사 {current.overflow}개는 음표 부족으로 배치되지 않음</span>}{current.unfilled>0&&<span className="mv9-warn">음표 {current.unfilled}개는 가사 없음(—)</span>}</div>
    <div className="mv9-scroll"><table className="mv9-table"><thead><tr><th>#</th><th>시작 ~ 종료</th><th>MIDI</th><th>가사 / 음절 수정</th></tr></thead><tbody>{current.cues.map((c,i)=><tr key={i}><td>{c.index}</td><td>{format(c.startSec)} ~ {format(c.endSec)}</td><td>{c.pitch}</td><td><input aria-label={`${i+1}번째 가사` } value={c.lyric} maxLength={80} onChange={e=>edit(i,e.target.value)}/></td></tr>)}</tbody></table></div>
   </>}
  </Panel>
  <Panel title="외부 Singing 엔진 연동 준비" description="MIDI · 가사 싱크 · 모델 참조 정보를 ZIP으로 내보냅니다. RVC/SVC/ONNX 등의 AI 학습이나 추론을 자동 실행하지 않습니다.">
   <div className="mv9-controls">
    <Field label="목소리 프로필 (선택)"><select value={voiceId} onChange={e=>{setVoiceId(e.target.value);setModelId('')}}><option value="">모델 미지정</option>{voices.map(v=><option key={v.id} value={v.id}>{v.name} · {v.rights}</option>)}</select></Field>
    <Field label="보관 중인 외부 체크포인트 (선택)"><select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">없음</option>{models.map(m=><option key={m.id} value={m.id}>{m.name} ({m.engineId})</option>)}</select></Field>
   </div>
   <div className="mv7-actions"><Button icon="download" variant="primary" disabled={!current||busy} onClick={exportPackage}>외부 추론용 ZIP 내보내기</Button></div>
   <Notice>ZIP에는 `manifest.json`, `melody.mid`, `lyrics.srt`와 안내문을 넣습니다. 체크포인트 바이너리나 녹음 원본은 포함하지 않습니다. 텍스트 싱크는 발음/음소 타이밍이 아니며, 실제 Singing 엔진의 형식 변환은 외부에서 필요합니다.</Notice>
   <div className="mv9-import"><strong>외부에서 생성한 보컬 WAV 다시 가져오기</strong><p>별도 엔진에서 렌더링한 WAV를 업로드하면 이 프로젝트에 새 보컬 오디오 트랙으로 추가합니다. 일반 WAV도 가져올 수 있습니다.</p><input aria-label="외부 보컬 WAV 가져오기" type="file" accept=".wav,audio/wav" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';importWav(file)}}/></div>
  </Panel>
  <Notice>v0.9의 ‘싱크’는 텍스트와 MIDI의 시간상 연결을 돕는 도구입니다. 음성에서 발음을 분석하거나 글자를 노래로 자동 읽지 않으며, 외부 체크포인트를 AI 엔진으로 실행하지 않습니다. 프로젝트 전체 백업 시 등록된 WAV는 함께 보관됩니다.</Notice>
 </>;
}
