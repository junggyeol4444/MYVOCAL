import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {alignLyricNotes,isAlignmentStale,makeImportedVocalTrack,midiVocalTracks} from '../lib/lyricAlignment';
import {lyricVowel,VOWEL_NAMES,guessVowelModels,renderVowelSinging} from '../lib/singingRender';
import {genId} from '../lib/schema';
import {putFile,removeFile} from '../lib/assetDb';
import {readAudioInfo} from '../lib/audioEngine';
import {hangulHint,singingCapabilitiesView,engineModelCompatibility,buildSingingRequest,appendRenderHistory} from '../lib/singingBridge';
import EngineManager from './EngineManager';
import {isPhonemePlanStale} from '../lib/phonemePlan';

const outputName=(title,kind)=>`MYVOCAL-${String(title||'Song').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,55)}-${kind}.wav`;
const format=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function safePort(text){const port=Number(text);if(!/^\d{4,5}$/.test(String(text))||!Number.isInteger(port)||port<1024||port>65535||port===58319)throw Error('엔진 포트는 1024~65535 사이(58319 제외)에서 선택하세요.');return port;}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}
export default function SingingWorkbench({project:p,data,onChange,notify}){
 const usable=(data.voices||[]).filter(v=>['self','owned','licensed'].includes(v.rights));
 const [voiceId,setVoiceId]=useState(p.voiceId||''),[modelMap,setModelMap]=useState({a:'',eo:'',i:'',u:''}),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[url,setUrl]=useState('');
 const [port,setPort]=useState(String(p.singingEngine?.port||7867)),[bridgeState,setBridgeState]=useState('연결 확인 전'),[externalModelId,setExternalModelId]=useState(p.singingEngine?.modelId||''),[status,setStatus]=useState('');
 const [capability,setCapability]=useState(null),[engineModelId,setEngineModelId]=useState(p.singingEngine?.modelId||'');
 const latestUrl=useRef('');
 const alignment=p.vocalAlignment&&!isAlignmentStale(p,p.vocalAlignment)?p.vocalAlignment:null;
 const phonemePlan=alignment&&p.phonemePlan&&!isPhonemePlanStale(alignment,p.phonemePlan)?p.phonemePlan:null;
 const voice=usable.find(v=>v.id===voiceId)||usable[0];
 const samples=(data.voiceModels||[]).filter(m=>m.voiceId===voice?.id&&m.engineId==='sampler'&&m.status==='sample-preview-ready');
 const externalModels=(data.voiceModels||[]).filter(m=>m.voiceId===voice?.id&&m.engineId!=='sampler');
 useEffect(()=>{setVoiceId(p.voiceId||'');setResult(null);setStatus('');setPort(String(p.singingEngine?.port||7867));setEngineModelId(p.singingEngine?.modelId||'');setCapability(null);},[p.id]);
 useEffect(()=>{const suggested=guessVowelModels(samples);if(!Object.values(suggested).some(Boolean)&&samples.length)suggested.a=samples[0].id;setModelMap(suggested);setExternalModelId('')},[voice?.id,data.voiceModels]);
 useEffect(()=>()=>{if(latestUrl.current)URL.revokeObjectURL(latestUrl.current)},[]);
 const changeResult=(blob,kind,count)=>{if(latestUrl.current)URL.revokeObjectURL(latestUrl.current);const u=URL.createObjectURL(blob);latestUrl.current=u;setUrl(u);setResult({file:new File([blob],outputName(p.title,kind),{type:'audio/wav'}),kind,count});};
 const run=async fn=>{if(busy)return;setBusy(true);setStatus('');try{await fn()}catch(e){setStatus('오류: '+e.message);notify('가창 작업 오류: '+e.message)}finally{setBusy(false)}};
 const createSync=()=>{try{const synced=alignLyricNotes(p);onChange({...p,vocalAlignment:synced});notify('보컬 멜로디와 가사를 순서대로 연결했습니다. 음소 분석은 아닙니다.')}catch(e){notify(e.message)}};
 const localRender=()=>run(async()=>{if(!alignment)throw Error('가사·MIDI 싱크를 먼저 준비하세요.');if(!voice)throw Error('사용 가능한 목소리가 없습니다.');
  const made=await renderVowelSinging(alignment,voice,modelMap,samples);changeResult(made.file,'vowel-preview',made.rendered);setStatus(`모음 샘플 렌더링: ${made.rendered}음표, 건너뜀 ${made.skipped}, ${format(made.seconds)} · AI 가창 아님`);notify('샘플 기반 WAV 생성 성공. 들어보고 트랙에 추가할 수 있습니다.');
 });
 const addTrack=()=>run(async()=>{if(!result)throw Error('먼저 보컬 WAV를 생성해 주세요.');
  const file=result.file,info=await readAudioInfo(file);if(!info.duration||info.duration>480)throw Error('WAV 길이가 유효하지 않습니다.');
  const assetId=genId('vocal_wav');await putFile(assetId,file);
  try{const track=makeImportedVocalTrack(p,file,assetId,info.duration);track.name=result.kind==='engine'?'외부 엔진 보컬':'모음 샘플 보컬';onChange({...p,tracks:[...p.tracks,track]});notify('보컬 WAV가 새로운 오디오 트랙에 추가됐습니다.');setStatus('WAV를 프로젝트에 추가했습니다.');}
  catch(e){await removeFile(assetId).catch(()=>{});throw e}
 });
 async function requestBridge(path,body){const key=window.__MYVOCAL_SESSION_KEY;if(!key)throw Error('외부 엔진 연결은 Windows EXE에서만 사용할 수 있습니다.');
  const method=body?'POST':'GET';const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
  try{const response=await fetch(path,{method,headers:{'X-MYVOCAL-Session':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
   if(!response.ok){const err=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(err.error||`HTTP ${response.status}`)}return response;
  }finally{clearTimeout(timeout)}
 }
 const checkEngine=()=>run(async()=>{const number=safePort(port),res=await requestBridge(`/api/singing/health?port=${number}`);const info=await res.json();
  const cRes=await requestBridge(`/api/singing/capabilities?port=${number}`),cap=singingCapabilitiesView(await cRes.json());setCapability(cap);
  const first=cap.models.find(m=>m.id===engineModelId);if(cap.models.length&&!first)setEngineModelId(cap.models[0].id);
  setBridgeState(`${info.name||'외부 엔진'} · 연결됨 · ${cap.message}`);
  onChange({...p,singingEngine:{port:number,modelId:engineModelId||cap.models[0]?.id||''}});
  notify('엔진 접속과 모델 목록 조회를 마쳤습니다. 엔진 정보는 자체 신고이며 추론 품질을 보증하지 않습니다.');});
 const renderExternal=()=>run(async()=>{if(!alignment)throw Error('먼저 가사·MIDI 싱크를 저장해 주세요.');if(!voice)throw Error('사용 허가가 있는 목소리를 선택해 주세요.');
  const number=safePort(port);
  let checkpoint=externalModels.find(m=>m.id===externalModelId)||null;
  if(capability?.supported&&capability.models.length){
   const advertised=capability.models.find(m=>m.id===engineModelId);
   if(!advertised)throw Error('엔진이 제공하는 모델 목록에서 모델을 먼저 선택해 주세요.');
   checkpoint={id:advertised.id,name:advertised.name,engineId:advertised.engineId};
  }
  if(capability?.mode==='neural'&&!capability.inferenceReady)throw Error('외부 엔진이 추론 준비 상태가 아니라고 보고했습니다. 모델과 실행 환경을 확인하세요.');
  const compatibility=engineModelCompatibility(capability,checkpoint);
  if(!compatibility.ok)throw Error(compatibility.warning);
  const req=buildSingingRequest(number,p,alignment,voice,checkpoint,phonemePlan);
  const res=await requestBridge('/api/singing/render',req),blob=await res.blob();if(blob.size<44)throw Error('엔진에서 유효한 WAV를 받지 못했습니다.');
  changeResult(blob,'engine',alignment.cues.length);
  const job={id:genId('singjob'),at:new Date().toISOString(),mode:capability?.mode==='demo'?'외부 데모':'외부 엔진',result:'WAV 수신',notes:alignment.cues.length,engine:capability?.name||'미확인'};
  onChange({...p,singingEngine:{port:number,modelId:checkpoint?.id||''},singingJobs:appendRenderHistory(p.singingJobs,job)});
  setStatus(capability?.mode==='demo'?'외부 데모 엔진에서 테스트 WAV를 받았습니다. 실제 AI 가창이 아닙니다.':'외부 엔진에서 WAV를 받아왔습니다. 품질과 모델 종류는 직접 검증해 주세요.');notify('외부 엔진 WAV 수신 성공.');
 });
 const validCount=alignment?.cues?.filter(c=>c.lyric&&c.lyric!=='—').length||0;
 return <>
  <Panel title="Singing Workbench · v1.3" description="가사와 MIDI를 하나의 보컬 렌더링 작업으로 연결합니다. 기본 모드는 녹음 샘플 기반이며, 실제 AI 추론에는 별도의 호환 엔진이 필요합니다.">
   <div className="mv10-strip"><div><strong>가사와 멜로디 준비</strong><span>{alignment?`싱크 완료 · ${validCount}/${alignment.cues.length}개 가사 있는 음표`:'싱크 없음 또는 원본 변경됨'}</span></div><Button icon="wave" disabled={busy||midiVocalTracks(p).length===0} onClick={createSync}>가사·MIDI 싱크 생성/갱신</Button></div>
   {!midiVocalTracks(p).length&&<Notice>먼저 MIDI 피아노 롤에서 보컬 음표를 작성해 주세요.</Notice>}
   {phonemePlan?<Notice>v1.3 발음 타임라인 {phonemePlan.segments.length}개 구간을 외부 엔진 요청에 포함합니다. 지원하지 않는 엔진은 무시할 수 있습니다.</Notice>:<Notice>저장된 발음 타임라인이 없습니다. ‘발음 타임라인’ 탭에서 만들면 외부 엔진 요청에 포함됩니다.</Notice>}
   {alignment&&<div className="mv10-cues">{alignment.cues.slice(0,24).map((c,i)=><div key={i} title={`${c.startSec}s · MIDI ${c.pitch}`}><span>{c.lyric}</span><small>{hangulHint(c.lyric)?Object.values(hangulHint(c.lyric)).filter(Boolean).join('·'):(lyricVowel(c.lyric)?VOWEL_NAMES[lyricVowel(c.lyric)]:'기본')}</small></div>)}{alignment.cues.length>24&&<span className="mv10-remaining">+{alignment.cues.length-24}음</span>}</div>}
   <Field label="가창 목소리"><select value={voice?.id||''} onChange={e=>setVoiceId(e.target.value)}>{usable.length?usable.map(v=><option key={v.id} value={v.id}>{v.name}</option>):<option value="">등록된 사용 허가 목소리 없음</option>}</select></Field>
  </Panel>
  <Panel title="A. 내 목소리 모음 샘플로 WAV 만들기" description="ㅏ·ㅓ·ㅣ·ㅜ 샘플을 음절의 대표 모음에 맞춰 선택합니다. 자음 발음은 생성하지 않으며 자연스러운 AI 노래가 아닙니다.">
   <div className="mv10-grid">{Object.entries(VOWEL_NAMES).map(([k,label])=><Field key={k} label={`${label} 녹음 샘플`}><select value={modelMap[k]||''} onChange={e=>setModelMap(v=>({...v,[k]:e.target.value}))}><option value="">미지정 (선택된 첫 샘플 사용)</option>{samples.map(m=><option key={m.id} value={m.id}>{m.name.slice(0,48)} · {Math.round(m.sourceHz)}Hz</option>)}</select></Field>)}</div>
   {!samples.length&&<Notice>먼저 Voice Training → 로컬 보컬 샘플러에서 음성 조각을 추출해 주세요. ㅏ·ㅓ·ㅣ·ㅜ 녹음을 따로 등록하면 더 나은 구분이 가능합니다.</Notice>}
   <div className="mv7-actions"><Button variant="primary" icon="play" disabled={!alignment||!samples.length||busy} onClick={localRender}>{busy?'처리 중':'모음 샘플 WAV 생성'}</Button><Status>로컬 샘플 합성 · AI 아님</Status></div>
  </Panel>
  <Panel title="B. 외부 AI Singing 엔진 연결" description="Windows EXE가 127.0.0.1의 별도 추론 서버로 가사·음표·모델 참조를 보내고 WAV를 받아옵니다. v1.2부터 설치된 엔진의 프로세스를 직접 시작할 수 있습니다.">
   <EngineManager port={port} onPort={setPort} requestBridge={requestBridge} notify={notify}/>
   <div className="mv10-grid"><Field label="로컬 엔진 포트"><input aria-label="외부 엔진 포트" value={port} onChange={e=>{setPort(e.target.value);setBridgeState('연결 확인 전');setCapability(null)}} placeholder="7867" inputMode="numeric"/></Field>
    <Field label="외부 체크포인트 참조 (선택)"><select value={externalModelId} onChange={e=>setExternalModelId(e.target.value)}><option value="">모델 지정 없음</option>{externalModels.map(m=><option value={m.id} key={m.id}>{m.name} ({m.engineId})</option>)}</select></Field></div>
   <div className="mv7-actions"><Button disabled={busy} onClick={checkEngine}>엔진 · 모델 조회</Button><Button icon="wave" variant="primary" disabled={!alignment||!voice||busy} onClick={renderExternal}>{capability?.mode==='demo'?'데모 테스트 WAV 생성':'외부 엔진으로 보컬 WAV 생성'}</Button><Status>{bridgeState}</Status></div>
   {capability&&<div className="mv11-engine"><div><strong>{capability.name||'외부 엔진'}</strong><span>모드: {capability.message} · 모델 수: {capability.models.length} · 준비 상태: {capability.inferenceReady?'엔진 신고상 준비':'준비 확인 안 됨'}</span></div>
     {capability.models.length>0&&<Field label="엔진에서 사용 가능한 모델"><select value={engineModelId} onChange={e=>setEngineModelId(e.target.value)}>{capability.models.map(m=><option key={m.id} value={m.id}>{m.name} · {m.engineId||'종류 미상'} ({m.id})</option>)}</select></Field>}
     <Notice>{capability.mode==='neural'?'신경망 모드는 외부 엔진의 자체 신고입니다. 프로그램이 AI 모델이나 학습 품질을 검증한 것은 아닙니다.':capability.mode==='demo'?'데모 엔진입니다. 실제 목소리나 가사를 부르지 않습니다.':capability.message}</Notice>
   </div>}
   <Notice>엔진 계약: <code>GET /health</code> → JSON, <code>POST /v1/sing</code> → WAV(PCM RIFF) 응답. 연결 검사 성공은 AI 모델 학습/추론 성공을 뜻하지 않습니다. 엔진 설치 및 체크포인트 호환성은 별도로 확인해야 합니다.</Notice>
  </Panel>
  <Panel title="렌더링 결과 · 프로젝트 적용" description="로컬 샘플러 또는 외부 엔진에서 생성된 WAV를 재생, 저장하거나 음악 편집 타임라인에 오디오 트랙으로 추가할 수 있습니다.">
   {result?<><div className="mv10-strip"><div><strong>{result.kind==='engine'?'외부 엔진 결과':'모음 샘플 기반 결과'}</strong><span>{result.count}개 음표 · {(result.file.size/1024/1024).toFixed(2)}MB</span></div><Status ready>WAV 생성됨</Status></div><audio src={url} controls className="mv10-player"/></>:<Notice>아직 렌더링된 WAV가 없습니다.</Notice>}
   <div className="mv7-actions"><Button icon="download" disabled={!result||busy} onClick={()=>download(result.file,result.file.name)}>WAV 저장</Button><Button icon="plus" variant="primary" disabled={!result||busy} onClick={addTrack}>프로젝트 오디오 트랙에 추가</Button></div>
   {status&&<Notice>{status}</Notice>}
  </Panel>
  <Panel title="최근 보컬 생성 기록" description="프로젝트별 최근 20개 작업의 결과와 사용한 엔진을 저장합니다. WAV 원본은 트랙에 추가해야 유지됩니다.">
   {(p.singingJobs||[]).length? <div className="mv11-history">{[...(p.singingJobs||[])].reverse().map(j=><div key={j.id}><strong>{j.mode} · {j.result}</strong><span>{j.at?.slice(0,19).replace('T',' ')} · {j.notes}음표 · {j.engine}</span></div>)}</div>:<Notice>기록된 외부 보컬 생성 작업이 없습니다.</Notice>}
  </Panel>
  <Notice>보컬의 정체성과 권리는 등록된 목소리의 사용 권한을 확인한 뒤 선택해 주세요. 이 기능은 기존 음성 파일의 구간을 재생하거나, 호환 외부 엔진에 요청을 보내는 도구입니다. 내장 신경망 보컬 학습 모델은 포함되어 있지 않습니다.</Notice>
 </>;
}
