import React,{useState} from 'react';
import VocalPreview from '../components/VocalPreview';
import RvcTrainingPanel from '../components/RvcTrainingPanel.jsx';
import {Button,Empty,Field,Icon,Notice,Panel,SectionHead,Status} from '../components/UI';
import {genId} from '../lib/schema';
import {getFile,putFile,removeFile,deleteFilesAtomic} from '../lib/assetDb';
import {modelDependents} from '../lib/voiceDeletionSafety.js';
import {TRAINING_ENGINES,TRAINING_PRESETS,assessTrainingData,createTrainingPlan,packageTrainingPlan,validateCheckpoint,buildCheckpointRecord,sha256File} from '../lib/voiceTraining';
const byteText=n=>n>1024*1024?(n/1024/1024).toFixed(1)+' MB':Math.round(n/1024)+' KB';
const formatDate=s=>{try{return new Date(s).toLocaleString('ko-KR')}catch{return '-'}};
function saveBlob(bytes,fileName){const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500)}
export default function Training({data,add,remove,notify,navigate}){
 const [voiceId,setVoiceId]=useState(''),[engineId,setEngineId]=useState('generic'),[preset,setPreset]=useState('standard'),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[checkpoint,setCheckpoint]=useState(null),[checkpointEngine,setCheckpointEngine]=useState('generic');
 const voices=data.voices||[],voice=voices.find(v=>v.id===voiceId)||voices[0],selected=voice?.id||'';
 const quality=voice?assessTrainingData(voice):null,plans=(data.trainingPlans||[]).filter(p=>p.voiceId===selected),models=(data.voiceModels||[]).filter(m=>m.voiceId===selected&&m.engineId!=='sampler');
 const run=async fn=>{if(busy)return;setBusy(true);try{await fn()}catch(e){notify('작업 실패: '+e.message)}finally{setBusy(false)}};
 const create=()=>run(async()=>{const job=createTrainingPlan(voice,{engineId,preset,notes});add('trainingPlans',job);setNotes('');notify('학습 데이터 준비 기록을 저장했습니다. 모델 학습은 실행되지 않았습니다.');});
 const download=plan=>run(async()=>{
  const bundle=await packageTrainingPlan(plan,voice);saveBlob(bundle.bytes,bundle.fileName);
  add('trainingPlans',{...plan,status:'exported',updatedAt:new Date().toISOString()});
  notify(`${bundle.manifest.samples.length}개 음성 원본이 포함된 학습 준비 ZIP을 다운로드했습니다. 외부 학습은 별도로 실행해야 합니다.`);
 });
 const importCheckpoint=()=>run(async()=>{
  if(!checkpoint)throw Error('체크포인트 파일을 선택해 주세요.');
  validateCheckpoint(checkpoint,voice);
  const sha256=await sha256File(checkpoint),assetId=genId('checkpoint');
  await putFile(assetId,checkpoint);
  try{const record=buildCheckpointRecord(voice,checkpoint,sha256,checkpointEngine,assetId);add('voiceModels',record);}
  catch(err){await removeFile(assetId).catch(()=>{});throw err}
  setCheckpoint(null);const field=document.getElementById('voice-checkpoint-file');if(field)field.value='';
  notify('외부 체크포인트를 로컬 보관했습니다. 모델 적합성·가창 합성은 검증되지 않았습니다.');
 });
 const downloadCheckpoint=model=>run(async()=>{
  const file=await getFile(model.assetId);if(!file)throw Error('체크포인트 원본이 없습니다.');
  if(model.sha256 && (await sha256File(file))!==model.sha256)throw Error('원본 체크포인트의 SHA-256이 등록할 때와 다릅니다. 교체·손상된 파일은 내보낼 수 없습니다.');
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=model.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
  notify('원본 체크포인트를 내려받았습니다.');
 });
 const downloadIndex=model=>run(async()=>{
  if(!model.indexAssetId)throw Error('등록된 FAISS 인덱스가 없습니다.');
  const file=await getFile(model.indexAssetId);
  if(!file)throw Error('FAISS 인덱스 원본을 찾지 못했습니다. 모델은 변경하지 않았습니다.');
  if(model.indexSha256 && (await sha256File(file))!==model.indexSha256)throw Error('FAISS 인덱스 SHA-256이 등록 시점과 다릅니다.');
  const head=new Uint8Array(await file.slice(0,4).arrayBuffer());
  if(file.size<1024||head[0]!==73||head[1]!==120)throw Error('FAISS 인덱스 파일 형식이 올바르지 않습니다.');
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=(String(model.name||'model').replace(/\\.pth$/i,'')||'MYVOCAL-RVC')+'.index';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
  notify('학습된 FAISS 인덱스를 별도 파일로 내려받았습니다. 모델과 함께 RVC 설치 폴더에서 사용하세요.');
 });
 const deleteCheckpoint=model=>run(async()=>{
  const uses=modelDependents(data,model);
  if(uses.length)throw Error('사용 중인 모델 원본을 삭제할 수 없습니다: '+uses.join(', '));
  if(!confirm(`'${model.name}' 체크포인트를 로컬에서 삭제할까요?`))return;
  const stored=[model.assetId,model.indexAssetId].filter(Boolean);
  if(stored.length)await deleteFilesAtomic(stored);
  remove('voiceModels',model.id);
  notify('선택한 체크포인트와 연결된 FAISS 인덱스 신규 자산을 삭제한 뒤 등록 정보를 갱신했습니다.');
 });
 return <>
  <SectionHead eyebrow="VOICE TRAINING · MODEL REGISTRY · LOCAL VOCAL PREVIEW" title="Voice Training Manager" description="목소리 학습 데이터를 준비하고 샘플 기반 보컬 미리보기를 생성합니다. 사용자가 설치한 로컬 RVC 학습 스크립트를 실행할 수 있으며 한국어 신경망 가창은 별도 엔진이 필요합니다. 가사·MIDI 싱크는 Music Studio에서 편집할 수 있습니다." action={<Button icon="mic" onClick={()=>navigate('voices')}>녹음 스튜디오</Button>}/>
  <div className="feature-strip"><div className="feature-symbol"><Icon name="wave" size={27}/></div><div><strong>v1.0 · 학습 준비 + 보컬 샘플 미리보기</strong><p>녹음 샘플 → 품질 사전 점검 → 학습 준비 작업 생성 → ZIP 내보내기 → 외부 모델 등록. 학습 실행에는 별도 설치된 로컬 학습 엔진이 필요하며 내장 보컬 샘플 미리보기도 제공합니다.</p></div><Status>실제 엔진 미연결</Status></div>
  {voices.length===0?<Empty icon="mic" title="먼저 Voice Studio에서 목소리를 등록하세요" description="권한이 있는 목소리 프로필과 하나 이상의 오디오 샘플이 필요합니다." action={<Button variant="primary" onClick={()=>navigate('voices')}>목소리 등록하기</Button>}/>:<>
   <div className="mv7-selector panel"><div><span className="eyebrow">TRAINING SOURCE</span><h3>학습할 목소리 선택</h3><p>등록한 샘플 및 분석 결과를 확인하고 학습 준비 묶음을 만듭니다.</p></div><select aria-label="학습 목소리 선택" value={selected} onChange={e=>{setVoiceId(e.target.value);setCheckpoint(null)}}>{voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
   <div className="mv7-stats">
    <div><span>원본 샘플</span><strong>{quality.total}</strong><small>등록된 음성 파일</small></div>
    <div><span>품질 통과</span><strong>{quality.passed}</strong><small>기초 신호 검사 기준</small></div>
    <div><span>발음 가이드 확보</span><strong>{quality.labeled}<i> / 12</i></strong><small>품질 통과·라벨 지정</small></div>
    <div><span>추정 총 길이</span><strong>{quality.seconds}s</strong><small>음성 파일 길이 합계</small></div>
   </div>
   <div className="mv7-columns"><Panel title="1. 학습 데이터 사전 점검" description="아래는 보조 지표입니다. 학습 가능 여부나 발음의 정확성을 보증하지 않습니다.">
    {quality.issues.length?<div className="mv7-issues">{quality.issues.map((issue,i)=><p key={i}><Icon name="info" size={15}/>{issue}</p>)}</div>:<p className="mv7-good"><Icon name="check" size={17}/>기초 점검 경고 없음 · 실제 학습 성공 보장은 아님</p>}
    <Notice>프로필 권한: <strong>{voice.rights==='self'?'본인 목소리':voice.rights==='owned'?'내가 제작한 자료':voice.rights==='licensed'?'사용 허가': 'Reference 분석용'}</strong> · 권한이 없는 자료는 학습 준비 ZIP으로 내보내지 않습니다.</Notice>
    <div className="mv7-actions"><Button icon="mic" onClick={()=>navigate('voices')}>추가 녹음·품질 점검</Button></div>
   </Panel><Panel title="2. 학습 준비 작업 만들기" description="학습 엔진별 연동 규약을 준비합니다. 모든 엔진은 현재 오프라인/미연결 상태입니다.">
    <Field label="목표 학습 엔진"><select value={engineId} onChange={e=>setEngineId(e.target.value)}>{TRAINING_ENGINES.map(e=><option key={e.id} value={e.id}>{e.name} · 미연결</option>)}</select></Field>
    <p className="mv7-hint">{TRAINING_ENGINES.find(x=>x.id===engineId)?.description}</p>
    <Field label="준비 옵션"><select value={preset} onChange={e=>setPreset(e.target.value)}>{TRAINING_PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="학습 작업 메모"><textarea rows={3} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="예: 높은 음역 샘플 보강 후 외부 학습"/></Field>
    <Button variant="primary" icon="plus" disabled={busy||!quality.permitted||quality.total===0} onClick={create}>학습 준비 기록 생성</Button>
    <p className="mv7-hint">학습 대기열에 제출하는 버튼이 아닙니다. 실행 없이 기록과 샘플 목록만 보존합니다.</p>
   </Panel></div>
   <Panel title="3. 학습 준비 작업 목록" description="작업 생성 당시의 샘플 목록·품질 결과를 보존합니다. 이후 샘플이 삭제되면 내보내기에 실패하므로 새로운 작업을 만드세요.">
    {plans.length?<div className="mv7-list">{plans.map(p=><div className="mv7-item" key={p.id}><div className="mv7-item-title"><div><strong>{TRAINING_ENGINES.find(e=>e.id===p.engineId)?.name||p.engineId}</strong><small>{formatDate(p.createdAt)} · 샘플 {p.sampleIds?.length||0}개 · {p.preset} · {p.status==='exported'?'ZIP 내보낸 기록':'준비됨 (미학습)'}</small></div><Status>{p.status==='exported'?'데이터 내보냄':'실행 전'}</Status></div>{p.notes&&<p className="mv7-hint">{p.notes}</p>}<div className="mv7-actions"><Button icon="download" disabled={busy} onClick={()=>download(p)}>학습 자료 ZIP</Button><Button icon="trash" disabled={busy} onClick={()=>{if(confirm('이 학습 준비 기록을 삭제할까요? 원본 녹음은 유지됩니다.'))remove('trainingPlans',p.id)}}>기록 삭제</Button></div></div>)}</div>:<div className="mv7-empty">준비된 작업이 없습니다. 위에서 먼저 학습 준비 기록을 만드세요.</div>}
   </Panel>
   <Panel title="4. 외부 모델 체크포인트 보관함" description="외부에서 학습한 파일을 보관하고 SHA-256 지문을 기록합니다. 파일 검증이나 노래 합성이 아닙니다.">
    <div className="mv7-columns mv7-model-import"><div><Field label="외부 체크포인트 파일 (.pth / .pt / .onnx / .ckpt / .safetensors)"><input id="voice-checkpoint-file" type="file" accept=".pth,.pt,.onnx,.ckpt,.safetensors" disabled={busy} onChange={e=>setCheckpoint(e.target.files?.[0]||null)}/></Field><p className="mv7-hint">파일당 200MB 이하 · 로컬 IndexedDB에 저장 · 모델 파일의 안전성/호환성은 자동 검증하지 않음</p></div><div><Field label="외부 모델 종류"><select value={checkpointEngine} onChange={e=>setCheckpointEngine(e.target.value)}>{TRAINING_ENGINES.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></Field><Button variant="primary" icon="save" disabled={busy||!checkpoint||!quality.permitted} onClick={importCheckpoint}>{busy?'처리 중':'체크포인트 등록'}</Button></div></div>
    {models.length?<div className="mv7-list">{models.map(model=><div className="mv7-item" key={model.id}><div className="mv7-item-title"><div><strong>{model.name}</strong><small>{byteText(model.bytes)} · {formatDate(model.createdAt)} · {TRAINING_ENGINES.find(e=>e.id===model.engineId)?.name||model.engineId}</small></div><Status>미검증 · 합성 미연결</Status></div><p className="mv7-hash">SHA-256: {model.sha256||'미계산'}</p><div className="mv7-actions"><Button icon="download" disabled={busy} onClick={()=>downloadCheckpoint(model)}>원본 내보내기</Button>{model.indexAssetId&&<Button icon="download" disabled={busy} onClick={()=>downloadIndex(model)}>FAISS 인덱스 내보내기</Button>}<Button icon="trash" disabled={busy} onClick={()=>deleteCheckpoint(model)}>삭제</Button></div></div>)}</div>:<div className="mv7-empty">등록된 외부 체크포인트가 없습니다.</div>}
   </Panel>
   <RvcTrainingPanel voice={voice} plans={plans} add={add} notify={notify}/>
   <VocalPreview data={data} voice={voice} add={add} remove={remove} notify={notify}/>
  </>}
  <Notice>외부 RVC 학습 스크립트 실행과 외부 변환 엔진 연결은 지원하지만, 실제 모델 설치·추론 호환성과 음질은 검증 대상입니다. 자연스러운 한국어 신경망 가창·음소 학습 및 모델 자동 설치는 아직 지원하지 않습니다. 로컬 샘플러는 단순 음높이 변경 미리보기입니다. 등록·학습 권한이 있는 본인 또는 허가된 음성만 사용하세요. 파일 원본은 별도로 백업하세요.</Notice>
 </>;
}
