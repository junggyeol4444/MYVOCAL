import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {getFile,putFile,removeFile} from '../lib/assetDb';
import {sampleEntries} from '../lib/voiceTraining';
import {createSamplerModel,DEMO_NOTES,projectPreviewNotes,renderSamplerPreview} from '../lib/localVocalSampler';

export default function VocalPreview({data,voice,add,remove,notify}){
 const [sourceId,setSourceId]=useState(''),[modelId,setModelId]=useState(''),[projectId,setProjectId]=useState('demo'),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[message,setMessage]=useState('');
 const audio=useRef(null),url=useRef(null);
 const samples=sampleEntries(voice),source=samples.find(x=>x.id===sourceId)||samples[0],models=(data.voiceModels||[]).filter(m=>m.voiceId===voice?.id&&m.engineId==='sampler'&&m.status==='sample-preview-ready');
 const model=models.find(m=>m.id===modelId)||models[0];
 const projects=(data.projects||[]).filter(p=>projectPreviewNotes(p).length>0);
 const project=projects.find(p=>p.id===projectId),notes=project?projectPreviewNotes(project):DEMO_NOTES;
 useEffect(()=>()=>{if(audio.current){audio.current.pause();audio.current.src='';}if(url.current)URL.revokeObjectURL(url.current);},[]);
 function stop(){if(audio.current){audio.current.pause();audio.current.currentTime=0;}}
 function clearPreview(){stop();if(url.current){URL.revokeObjectURL(url.current);url.current=null;}setResult(null);}
 async function guarded(fn){if(busy)return;setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(e.message);notify('샘플러: '+e.message)}finally{setBusy(false)}}
 const train=()=>guarded(async()=>{
  if(!voice)throw Error('목소리를 먼저 선택해 주세요.');
  const {record,file}=await createSamplerModel(voice,source?.id);
  await putFile(record.assetId,file);
  try{add('voiceModels',record)}catch(e){await removeFile(record.assetId);throw e}
  clearPreview();setModelId(record.id);notify('로컬 보컬 샘플 추출 완료. AI 학습 모델은 아닙니다.');
 });
 const render=()=>guarded(async()=>{
  if(!model)throw Error('미리보기용 샘플 모델을 먼저 만들어 주세요.');
  clearPreview();
  const bpm=project?Number(project.bpm)||120:120;
  const file=await renderSamplerPreview(model,notes,bpm);
  setResult({file,name:`MYVOCAL-v0.8-voice-preview-${Date.now()}.wav`,count:notes.length});
  notify('음성 샘플 기반 보컬 미리보기 WAV를 생성했습니다. 재생 버튼으로 확인하세요.');
 });
 async function play(){if(!result){setMessage('WAV 생성 후 재생해 주세요.');return;}
  try{stop();if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(result.file);
   if(!audio.current)audio.current=new Audio();audio.current.src=url.current;await audio.current.play();}catch(e){setMessage('재생에 실패했습니다: '+e.message)}
 }
 function download(){if(!result)return;const tmp=URL.createObjectURL(result.file),a=document.createElement('a');a.href=tmp;a.download=result.name;a.click();setTimeout(()=>URL.revokeObjectURL(tmp),2000)}
 const erase=m=>guarded(async()=>{if(!confirm('이 로컬 샘플 모델을 삭제할까요? 원본 목소리 녹음은 유지됩니다.'))return;
  if(model?.id===m.id)clearPreview();remove('voiceModels',m.id);if(m.assetId)await removeFile(m.assetId);setModelId('');notify('로컬 샘플 모델을 삭제했습니다.');
 });
 return <Panel title="5. 로컬 보컬 샘플러 · 실제 소리 미리보기 (v0.8)" description="권한 있는 지속 발성 녹음에서 짧은 소리를 추출해, 멜로디 음높이에 맞춰 재생하고 WAV를 만듭니다. AI 학습이나 가사 합성은 아닙니다.">
  <div className="mv8-info"><strong>동작하는 보컬 프로토타입</strong><p>음원 추출 → 샘플 모델 저장 → MIDI 멜로디 피치 변환 → WAV 렌더링. 단, 원본 속도 변경 방식이므로 음색·발음이 변형될 수 있고 가사를 발음하지 않습니다.</p></div>
  <div className="mv7-columns">
   <div><Field label="1. 기준 목소리 녹음 (모음 지속 발성 권장)"><select value={source?.id||''} onChange={e=>{setSourceId(e.target.value);clearPreview()}}>{samples.length?samples.map(s=><option key={s.id} value={s.id}>{s.fileName||s.id} · {s.analysis?.medianNote||'분석 없음'} ({s.analysis?.medianHz||0}Hz)</option>):<option value="">등록된 샘플 없음</option>}</select></Field><p className="mv7-hint">최소 10개 피치 프레임이 측정되어야 하며, 단독 음성·장음 샘플이 가장 적합합니다.</p><div className="mv7-actions"><Button icon="plus" variant="primary" disabled={busy||!voice||!source||!['self','owned','licensed'].includes(voice.rights)} onClick={train}>{busy?'처리 중':'음성 샘플 모델 추출'}</Button></div></div>
   <div><Field label="2. 추출한 로컬 샘플 모델"><select value={model?.id||''} onChange={e=>{setModelId(e.target.value);clearPreview()}}>{models.length?models.map(m=><option key={m.id} value={m.id}>{m.name} · 기준 {Math.round(m.sourceHz)}Hz</option>):<option value="">아직 모델 없음</option>}</select></Field><p className="mv7-hint">이 모델은 0.5초 내외 녹음 조각을 저장한 샘플러입니다. RVC/SVC 체크포인트와 호환되지 않습니다.</p>{model&&<div className="mv7-actions"><Button disabled={busy} icon="trash" onClick={()=>erase(model)}>모델 삭제</Button></div>}</div>
  </div>
  <div className="mv8-divider"/>
  <div className="mv7-columns">
   <div><Field label="3. 미리보기 멜로디"><select value={projectId} onChange={e=>{setProjectId(e.target.value);clearPreview()}}><option value="demo">기본 8음 멜로디 (120 BPM)</option>{projects.map(p=><option value={p.id} key={p.id}>{p.title} · MIDI {projectPreviewNotes(p).length}음</option>)}</select></Field><p className="mv7-hint">프로젝트의 보컬 MIDI가 있으면 우선 적용하고, 없으면 다른 멜로디 트랙을 사용합니다. 128음/90초 한도.</p></div>
   <div><p className="mv8-noteinfo">선택한 음표 {notes.length}개 · {project?project.bpm:120} BPM</p><div className="mv7-actions"><Button icon="wave" variant="primary" disabled={busy||!model} onClick={render}>{busy?'렌더링 중':'보컬 WAV 생성'}</Button><Button disabled={busy||!result} onClick={play}>▶ 재생</Button><Button disabled={!result} onClick={stop}>■ 정지</Button><Button icon="download" disabled={!result} onClick={download}>WAV 저장</Button></div></div>
  </div>
  {result&&<div className="mv8-result"><Status>렌더 완료</Status><strong>{result.count}개 음표 · WAV {(result.file.size/1024/1024).toFixed(2)}MB</strong><span>실제 오디오가 렌더링되었지만 AI 가창은 아닙니다.</span></div>}
  {message&&<Notice>{message}</Notice>}
  <Notice>목소리 소유권·사용 허가가 있는 샘플만 사용하세요. 현재는 음절·단어 발음, 감정 표현, 음질 일관성, 실제 AI 학습, Singing 엔진의 결과를 제공하지 않습니다. 원본 오디오와 로컬 샘플 모델은 개별 백업해야 합니다.</Notice>
 </Panel>;
}
