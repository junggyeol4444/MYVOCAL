import React,{useEffect,useRef,useState} from 'react';
import {AssetPreview,Button,Empty,Field,Icon,Modal,Notice,SectionHead,Status} from '../components/UI';
import {genId,now,rightsOptions} from '../lib/schema';
import {getFile,putFile,putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {sampleDependents,voiceDependents,voiceOwnedFileIds} from '../lib/voiceDeletionSafety.js';
import {analyzeAudioFile,voiceAdvice} from '../lib/voiceAnalysis';
import {VOICE_GUIDES,getVoiceGuide,checkSampleQuality,voiceDatasetSummary,downloadVoiceDataset} from '../lib/voiceDataset';

const STYLES=['Natural','Ballad','Soft','Power','Rock','Whisper','Falsetto','Emotional'];
const niceTime=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function PitchTrace({analysis:a}){
 const pts=a?.points||[];
 if(pts.length<2)return <div className="voice-trace-empty">음정 추적 데이터가 충분하지 않습니다.</div>;
 const maxT=a.analyzedSeconds||1;
 const path=pts.map((p,i)=>`${i?'L':'M'}${(p.time/maxT*690+16).toFixed(1)},${(100-Math.max(0,Math.min(1,(Math.log2(Math.max(75,p.hz))-Math.log2(75))/(Math.log2(900)-Math.log2(75))))*80).toFixed(1)}`).join(' ');
 return <svg role="img" aria-label="시간에 따른 추정 피치 선그래프" viewBox="0 0 720 125" preserveAspectRatio="none" className="voice-pitch-trace"><line x1="16" y1="20" x2="706" y2="20" stroke="#3b465b"/><line x1="16" y1="60" x2="706" y2="60" stroke="#3b465b"/><line x1="16" y1="100" x2="706" y2="100" stroke="#3b465b"/><text x="18" y="116" fill="#8ea4b9" fontSize="11">0초</text><text x="653" y="116" fill="#8ea4b9" fontSize="11">{niceTime(maxT)}</text><path d={path} fill="none" stroke="#60c8f5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}
function AnalysisView({analysis:a}){
 if(!a)return <div className="voice-not-analyzed">아직 분석한 오디오가 없습니다. 샘플을 녹음하거나 추가해 주세요.</div>;
 return <div className="voice-report">
  <div className="voice-report-grid"><div><span>추정 대표 음정</span><strong>{a.medianNote||'—'}</strong><small>{a.medianHz?`${a.medianHz} Hz`:'검출 안 됨'}</small></div><div><span>추정 음역 (10~90백분위)</span><strong>{a.voicedFrames?`${a.lowNote} ~ ${a.highNote}`:'—'}</strong><small>도달 가능한 전체 음역과 다름</small></div><div><span>피치 검출 구간</span><strong>{a.voicedPercent}%</strong><small>{a.voicedFrames} / {a.frames} 프레임</small></div><div><span>신호 피크</span><strong>{a.peakDb} dBFS</strong><small>클리핑 {a.clippedPercent}%</small></div></div>
  <PitchTrace analysis={a}/><p className="voice-report-note">{voiceAdvice(a)}</p><small className="voice-disclaimer">측정 구간 {niceTime(a.analyzedSeconds)} / 파일 {niceTime(a.duration)} · 단독 노래 음성에서 추정 정확도가 높아집니다. 반주·잡음·화음에서는 오차가 발생할 수 있습니다.</small>
 </div>;
}
export default function Voices({data,add,remove,notify}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[style,setStyle]=useState('Natural'),[rights,setRights]=useState('self'),[file,setFile]=useState(null);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[recording,setRecording]=useState(false),[elapsed,setElapsed]=useState(0),[expanded,setExpanded]=useState(''),[guideOpen,setGuideOpen]=useState(''),[guideTarget,setGuideTarget]=useState(VOICE_GUIDES[0].id),[guideFile,setGuideFile]=useState(null),[guideNotes,setGuideNotes]=useState('');
 const rec=useRef(null),stream=useRef(null),chunks=useRef([]),seconds=useRef(null);
 useEffect(()=>()=>{if(rec.current?.state==='recording')rec.current.stop();stream.current?.getTracks().forEach(t=>t.stop());if(seconds.current)clearInterval(seconds.current);},[]);
 const reset=()=>{setOpen(false);setName('');setFile(null);setRights('self');setStyle('Natural');setProgress(0);setElapsed(0);};
 const checkFile=f=>{if(!f)return false;if(f.size>40*1024*1024){notify('40MB 이하 파일만 등록할 수 있습니다.');return false;}if(f.size===0){notify('빈 파일입니다.');return false;}return true;};
 const save=async e=>{
  e?.preventDefault?.();if(busy||recording)return;if(!name.trim()){notify('목소리 이름을 입력하세요.');return;}
  setBusy(true);setProgress(0);
  try{
   const id=genId('voice'),assetId=file?genId('asset'):'';
   let analysis=null,analysisError='';
   if(file){await putFile(assetId,file);try{analysis=await analyzeAudioFile(file,{onProgress:setProgress});}catch(err){analysisError=err.message;}}
   add('voices',{id,name:name.trim(),style,rights,assetId,fileName:file?.name||'',analysis,analysisError,assets:[],createdAt:now(),modelStatus:'학습 전'});
   reset();setExpanded(id);notify(analysis?'목소리 등록 및 기초 피치 분석을 완료했습니다. AI 모델 학습은 아닙니다.':`프로필을 등록했습니다.${analysisError?' 분석 불가: '+analysisError:''}`);
  }catch(err){notify('자료 저장에 실패했습니다: '+err.message);}finally{setBusy(false)}
 };
 const startRecord=async(destination='profile')=>{
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('마이크 녹음이 지원되지 않습니다.');
   stream.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}});
   chunks.current=[];const mr=new MediaRecorder(stream.current);rec.current=mr;
   mr.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
   mr.onerror=()=>{notify('녹음 오류가 발생했습니다.');stopRecord();};
   mr.onstop=()=>{
    const mime=mr.mimeType||'audio/webm';const blob=new Blob(chunks.current,{type:mime});
    const output=new File([blob],`voice-recording-${new Date().toISOString().replace(/[:.]/g,'-')}.${mime.includes('mp4')?'m4a':'webm'}`,{type:blob.type});
    if(destination==='guide')setGuideFile(output);else setFile(output);
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    if(seconds.current)clearInterval(seconds.current);setRecording(false);
   };
   setElapsed(0);mr.start(500);seconds.current=setInterval(()=>setElapsed(s=>{if(s>=119){stopRecord();return 120;}return s+1;}),1000);setRecording(true);
  }catch(err){stream.current?.getTracks().forEach(t=>t.stop());notify('녹음 실패: '+err.message);}
 };
 const stopRecord=()=>{if(rec.current?.state==='recording')rec.current.stop();};
 const close=()=>{if(recording){notify('먼저 녹음을 중지하세요.');return;}if(busy)return;reset();};
 const addSamples=async(v,files,capturePromptId='',notes='')=>{
  if(busy)return false;
  const chosen=[...files].filter(checkFile).slice(0,8);
  if(!chosen.length)return false;
  setBusy(true);setProgress(0);
  try{
   // Inspect all samples before committing any original. Recording files
   // are stored together so a quota/disk failure cannot leave half a batch.
   const prepared=[];let failures=0;
   for(const f of chosen){
    const id=genId('asset');let analysis=null,error='';
    try{analysis=await analyzeAudioFile(f,{onProgress:setProgress});}
    catch(err){error=err.message;failures++;}
    prepared.push({id,file:f,entry:{id,fileName:f.name,createdAt:now(),analysis,analysisError:error,capturePromptId,notes}});
   }
   await putFilesAtomic(prepared.map(({id,file})=>[id,file]));
   add('voices',{...v,assets:[...(v.assets||[]),...prepared.map(p=>p.entry)]});
   setExpanded(v.id);
   notify(`${prepared.length}개 샘플을 저장했습니다.${failures?` ${failures}개는 분석할 수 없습니다.`:''}`);
   return true;
  }catch(err){notify('샘플 저장 실패: '+err.message);return false;}
  finally{setBusy(false);setProgress(0);}
 };
 const rerun=async(v,entry)=>{
  if(busy)return;setBusy(true);setProgress(0);
  try{
   const f=await getFile(entry.id);if(!f)throw Error('원본 파일이 없습니다.');
   const analysis=await analyzeAudioFile(f,{onProgress:setProgress});
   if(entry.original)add('voices',{...v,analysis,analysisError:''});
   else add('voices',{...v,assets:(v.assets||[]).map(x=>x.id===entry.id?{...x,analysis,analysisError:''}:x)});
   notify('기초 분석을 다시 완료했습니다.');
  }catch(err){notify('분석 실패: '+err.message);}finally{setBusy(false);setProgress(0)}
 };
 const updateSample= (v,entry,changes)=>{
  if(entry.original)add('voices',{...v,...changes});
  else add('voices',{...v,assets:(v.assets||[]).map(a=>a.id===entry.id?{...a,...changes}:a)});
 };
 const saveGuide=async v=>{
  if(!guideFile){notify('녹음하거나 오디오 파일을 선택해 주세요.');return;}
  const saved=await addSamples(v,[guideFile],guideTarget,guideNotes.trim());
  // Keep the recorded original in the form if IndexedDB rejected the write.
  if(saved){setGuideFile(null);setGuideNotes('');}
 };
 const downloadDataset=async v=>{
  if(busy||recording)return;setBusy(true);
  try{const n=await downloadVoiceDataset(v);notify(`${n}개 원본 음성 파일과 안내·품질 메타데이터를 ZIP에 저장했습니다. 실제 AI 학습은 실행되지 않습니다.`);}
  catch(err){notify('데이터셋 내보내기 실패: '+err.message);}finally{setBusy(false)}
 };
 const deleteSample=async(v,entry)=>{
  if(busy||recording)return;
  const uses=sampleDependents(data,v.id,entry.id);
  if(uses.length){notify('사용 중인 음성 파일은 삭제할 수 없습니다: '+uses.join(', '));return;}
  if(!confirm('이 샘플을 삭제할까요? 원본 음성 데이터도 삭제됩니다.'))return;
  setBusy(true);
  try{
   await deleteFilesAtomic([entry.id]);
   if(entry.original)add('voices',{...v,assetId:'',fileName:'',analysis:null,analysisError:''});
   else add('voices',{...v,assets:(v.assets||[]).filter(x=>x.id!==entry.id)});
   notify('원본 삭제 확인 후 샘플 목록을 갱신했습니다.');
  }catch(err){notify('원본 삭제 실패 · 등록 정보 유지: '+err.message);}
  finally{setBusy(false)}
 };
 const deleteVoice=async v=>{
  if(busy||recording)return;
  const uses=voiceDependents(data,v);
  if(uses.length){notify('연결된 작업이 있어 목소리를 삭제할 수 없습니다: '+uses.join(', '));return;}
  let ids;
  try{ids=voiceOwnedFileIds(data,v)}catch(err){notify(err.message);return;}
  if(!confirm(`'${v.name}' 목소리와 연결된 원본 ${ids.length}개, 학습 기록과 모델을 삭제할까요?`))return;
  setBusy(true);
  try{
   await deleteFilesAtomic(ids);
   for(const p of data.trainingPlans||[])if(p.voiceId===v.id)remove('trainingPlans',p.id);
   for(const m of data.voiceModels||[])if(m.voiceId===v.id)remove('voiceModels',m.id);
   remove('voices',v.id);
   if(expanded===v.id)setExpanded('');
   notify('원본 일괄 삭제 확인 후 목소리와 학습 기록을 갱신했습니다.');
  }catch(err){notify('삭제 실패 · 원본과 프로필 유지: '+err.message);}
  finally{setBusy(false)}
 };
 return <><SectionHead eyebrow="VOICE DATASET · RECORDING GUIDE · SIGNAL QUALITY" title="Voice Studio" description="내 목소리 샘플을 녹음하고 발음·음역별로 정리하며 품질을 점검합니다. AI 보컬 학습과 가창 합성은 아직 미구현입니다." action={<Button variant="primary" icon="plus" onClick={()=>setOpen(true)}>새 목소리 등록</Button>}/>
 <div className="feature-strip"><div className="feature-symbol"><Icon name="mic" size={28}/></div><div><strong>VOICE MODEL ≠ SINGING STYLE</strong><p>목소리 원본과 스타일을 분리해 관리합니다. 녹음 가이드와 데이터셋 내보내기를 제공하며 v1.0의 Voice Training에서 학습 준비 작업을 관리합니다. AI 가수 생성은 아직 아닙니다.</p></div><Status>학습 엔진 미연결</Status></div>
 {data.voices.length?<div className="voice-profile-list">{data.voices.map(v=>{
  const samples=[...(v.assetId?[{id:v.assetId,fileName:v.fileName,analysis:v.analysis,analysisError:v.analysisError,capturePromptId:v.capturePromptId||'',notes:v.notes||'',original:true}]:[]),...(v.assets||[])];
  const best=samples.find(x=>x.analysis)?.analysis;const isExpanded=expanded===v.id;const summary=voiceDatasetSummary(v);const guideActive=guideOpen===v.id;const done=new Set(summary.completedIds);
  return <section className="voice-profile-card" key={v.id}>
   <div className="voice-profile-top"><div className="voice-profile-icon"><Icon name="mic" size={26}/></div><div className="voice-profile-title"><span className="eyebrow">LOCAL VOICE PROFILE</span><h3>{v.name}</h3><p>{v.style} · {rightsOptions.find(x=>x.value===v.rights)?.label||v.rights} · 샘플 {samples.length}개</p></div><Status>AI 미학습</Status><button className="icon-btn danger" onClick={()=>deleteVoice(v)} title="프로필 삭제"><Icon name="trash" size={17}/></button></div>
   <div className="voice-summary"><div><span>대표 추정 음정</span><strong>{best?.medianNote||'—'}</strong></div><div><span>측정 음역</span><strong>{best?.voicedFrames?`${best.lowNote} ~ ${best.highNote}`:'측정 전'}</strong></div><div><span>샘플 파일</span><strong>{samples.length}개</strong></div></div>
   <div className="voice-v06-summary"><div className="voice-v06-progress-head"><strong>녹음 가이드 충족 {summary.completed} / {summary.count}</strong><span>품질 확인 샘플 {summary.passed}/{summary.total} · 총 약 {summary.seconds}초</span></div><div className="voice-v06-progress"><i style={{width:summary.percent+'%'}}/></div><p>가이드 완료 여부는 사용자가 선택한 발음 라벨과 음향 품질만 확인합니다. 실제 발음이나 음역대가 맞는지는 자동 검증하지 않습니다.</p></div>
   <div className="voice-profile-actions"><Button icon="wave" onClick={()=>setExpanded(isExpanded?'':v.id)}>{isExpanded?'샘플·분석 접기':'샘플·분석 보기'}</Button><input id={'voice-add-'+v.id} type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" hidden onChange={e=>{const list=e.target.files;if(list?.length)addSamples(v,list);e.target.value='';}}/><Button icon="plus" disabled={busy} onClick={()=>document.getElementById('voice-add-'+v.id)?.click()}>샘플 추가</Button><Button icon="mic" onClick={()=>{setGuideOpen(guideActive?'':v.id);setExpanded(v.id);setGuideFile(null);}}>녹음 가이드</Button><Button icon="download" disabled={busy||recording||!samples.length} onClick={()=>downloadDataset(v)}>데이터셋 ZIP 내보내기</Button></div>
   {guideActive&&<div className="voice-guide-panel"><div className="voice-guide-heading"><strong>발음 · 음역별 샘플 녹음</strong><span>학습용 데이터 수집 단계 — AI 모델 학습은 수행하지 않음</span></div><div className="voice-guide-checklist">{VOICE_GUIDES.map(g=><button key={g.id} type="button" className={'voice-guide-chip '+(guideTarget===g.id?'active ':'')+(done.has(g.id)?'complete':'')} onClick={()=>{setGuideTarget(g.id);setGuideFile(null);}}><span>{done.has(g.id)?'✓ ':'○ '}{g.title}</span></button>)}</div><div className="voice-guide-instructions"><strong>{getVoiceGuide(guideTarget)?.title}</strong><p>{getVoiceGuide(guideTarget)?.prompt}</p><small>{getVoiceGuide(guideTarget)?.notes}</small></div><div className="voice-guide-controls"><label className="voice-guide-file">오디오 파일 선택 <input aria-label="가이드 샘플 오디오 선택" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" disabled={recording||busy} onChange={e=>{const f=e.target.files?.[0];if(checkFile(f))setGuideFile(f);e.target.value='';}}/></label>{recording?<Button icon="wave" onClick={stopRecord}>■ 녹음 중지 ({niceTime(elapsed)})</Button>:<Button icon="mic" disabled={busy} onClick={()=>startRecord('guide')}>가이드 마이크 녹음</Button>}<input type="text" aria-label="샘플 메모" placeholder="메모 (선택)" value={guideNotes} onChange={e=>setGuideNotes(e.target.value)} maxLength={150}/><Button variant="primary" icon="save" disabled={busy||recording||!guideFile} onClick={()=>saveGuide(v)}>이 가이드에 샘플 저장</Button></div>{guideFile&&<p className="voice-guide-selected">선택한 파일: {guideFile.name} · {(guideFile.size/1024/1024).toFixed(2)}MB</p>}<p className="voice-guide-caveat">무리해서 고음을 내지 마세요. 진짜 발음 일치·목소리 신원·학습 적합성은 검사하지 않습니다. 권한이 있는 목소리만 녹음하세요.</p></div>}
   {isExpanded&&<div className="voice-samples">{samples.length?samples.map((s,i)=><div className="voice-sample" key={s.id}><div className="voice-sample-head"><strong>샘플 {i+1} · {s.fileName||'녹음 파일'}</strong><span>{s.analysis?`분석 완료 · ${niceTime(s.analysis.duration)}`:s.analysisError?'분석 불가':'분석 전'}</span></div><div className="voice-v06-tag-row"><label>녹음 가이드 <select aria-label={'샘플 '+(i+1)+' 발음 음역 라벨'} value={s.capturePromptId||''} onChange={e=>updateSample(v,s,{capturePromptId:e.target.value})}><option value="">지정하지 않음</option>{VOICE_GUIDES.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label><span className={'voice-v06-quality quality-'+checkSampleQuality(s.analysis).status}>{checkSampleQuality(s.analysis).title}</span></div><div className="voice-v06-issues">{checkSampleQuality(s.analysis).issues.map((issue,j)=><span key={j}>• {issue}</span>)}</div><AssetPreview id={s.id} kind="audio"/>{s.analysis?<AnalysisView analysis={s.analysis}/>:<p className="voice-no-data">{s.analysisError||'원본 파일은 보관 중이지만 분석하지 않았습니다.'}</p>}<label className="voice-v06-note">샘플 메모 <input key={s.id} type="text" defaultValue={s.notes||''} maxLength={150} placeholder="발성이나 녹음 상태 기록" onBlur={e=>{if((s.notes||'')!==e.target.value)updateSample(v,s,{notes:e.target.value});}}/></label><div className="voice-sample-actions"><Button disabled={busy} icon="wave" onClick={()=>rerun(v,s)}>다시 분석</Button><Button disabled={busy} icon="trash" onClick={()=>deleteSample(v,s)}>샘플 삭제</Button></div></div>):<div className="voice-not-analyzed">이 프로필에 저장된 오디오가 없습니다. 샘플 추가 버튼으로 음성 파일을 넣어 주세요.</div>}</div>}
  </section>;
 })}</div>:<Empty icon="mic" title="등록한 목소리가 없습니다" description="마이크로 직접 녹음하거나 오디오 파일을 등록해 주세요. 기초 피치 분석이 함께 제공됩니다." action={<Button variant="primary" icon="mic" onClick={()=>setOpen(true)}>내 목소리 등록</Button>}/>}
 <Notice>음성 원본은 로컬 IndexedDB에 보관됩니다. 「데이터셋 ZIP」에는 원본 오디오·녹음 가이드 라벨·품질 메타데이터가 포함되므로 안전하게 보관하세요. 피치·발음 라벨은 학습 적합성이나 진짜 발음의 자동 확인이 아닙니다. AI 학습·합성은 미구현입니다. 등록 권한이 있는 목소리만 사용하세요.</Notice>
 {busy&&<div className="voice-progress" role="status"><span>음성 파일 분석/저장 중… {progress}%</span><div><i style={{width:progress+'%'}}/></div></div>}
 {open&&<Modal title="새 목소리 프로필 만들기" onClose={close}><form onSubmit={save} className="modal-form"><Field label="목소리 이름"><input autoFocus value={name} onChange={e=>setName(e.target.value)} required placeholder="예: MY VOICE"/></Field><div className="form-two"><Field label="기본 Singing Style"><select value={style} onChange={e=>setStyle(e.target.value)}>{STYLES.map(s=><option key={s}>{s}</option>)}</select></Field><Field label="자료 권한"><select value={rights} onChange={e=>setRights(e.target.value)}>{rightsOptions.filter(r=>r.value!=='reference').map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field></div><Field label="오디오 샘플"><input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" onChange={e=>{const f=e.target.files?.[0];if(checkFile(f))setFile(f);}}/><small>목소리만 담긴 20~30초 정도의 깨끗한 샘플 권장</small></Field><div className="record-row"><div><strong>마이크로 직접 녹음</strong><p>Windows 마이크 권한 필요 · 최대 2분 · {recording?`녹음 중 ${niceTime(elapsed)}`:'로컬 저장'}</p></div>{recording?<Button icon="wave" onClick={stopRecord}>■ 녹음 중지</Button>:<Button icon="mic" disabled={busy} onClick={()=>startRecord('profile')}>녹음 시작</Button>}</div>{file&&<div className="selected-file"><Icon name="check" size={16}/>{file.name} · {Math.ceil(file.size/1024)}KB</div>}<Notice>프로필을 저장하면 샘플 음정을 분석합니다. 분석에 실패하더라도 원본을 저장할 수 있습니다. AI 보컬 모델 학습이 아닙니다.</Notice><div className="modal-actions"><Button disabled={busy||recording} onClick={close}>취소</Button><Button variant="primary" icon="save" disabled={busy||recording} onClick={save}>{busy?`분석 중 ${progress}%`:'프로필 저장'}</Button></div></form></Modal>}
 </>;
}
