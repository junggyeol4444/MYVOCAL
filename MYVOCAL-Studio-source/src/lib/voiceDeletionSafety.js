// Pure reference guards: deleting a linked original would corrupt saved projects.
export function sampleDependents(data,voiceId,id){
 const uses=[];
 for(const p of data.trainingPlans||[])if((p.sampleIds||[]).includes(id)||(p.sampleSnapshot||[]).some(s=>s?.id===id))uses.push('학습 기록 '+(p.voiceName||p.id));
 for(const v of data.voices||[])if(v.id!==voiceId&&(v.assetId===id||(v.assets||[]).some(s=>s.id===id)))uses.push('목소리 '+(v.name||v.id));
 for(const m of data.voiceModels||[])if(m.sourceSampleId===id||m.assetId===id)uses.push('모델 '+(m.name||m.id));
 for(const p of data.projects||[])if((p.tracks||[]).some(t=>(t.clips||[]).some(c=>c.assetId===id)))uses.push('곡 '+(p.title||p.id));
 return uses;
}
export function voiceDependents(data,voice){
 const ids=new Set((data.voiceModels||[]).filter(m=>m.voiceId===voice.id).map(m=>m.id)),uses=[];
 for(const p of data.projects||[])if(p.voiceId===voice.id||ids.has(p.singingEngine?.modelId))uses.push('프로젝트 '+(p.title||p.id));
 for(const x of data.virtualSingers||[])if(x.voiceId===voice.id)uses.push('가상 가수 '+(x.name||x.id));
 for(const x of data.voicebanks||[])if(x.voiceId===voice.id)uses.push('보이스뱅크 '+(x.name||x.id));
 return uses;
}
export function modelDependents(data,model){
 const uses=[];
 for(const p of data.projects||[])if(p.singingEngine?.modelId===model.id)uses.push('프로젝트 '+(p.title||p.id));
 for(const other of data.voiceModels||[])if(other.id!==model.id&&other.assetId&&other.assetId===model.assetId)uses.push('모델 '+(other.name||other.id));
 if(model.assetId){
  for(const v of data.voices||[])if(v.assetId===model.assetId||(v.assets||[]).some(s=>s.id===model.assetId))uses.push('목소리 '+(v.name||v.id));
  for(const p of data.trainingPlans||[])if((p.sampleIds||[]).includes(model.assetId)||(p.sampleSnapshot||[]).some(s=>s?.id===model.assetId))uses.push('학습 기록 '+(p.voiceName||p.id));
  for(const p of data.projects||[])if((p.tracks||[]).some(t=>(t.clips||[]).some(c=>c.assetId===model.assetId)))uses.push('곡 '+(p.title||p.id));
 }
 return uses;
}
export function voiceOwnedFileIds(data,voice){
 const owned=[voice.assetId,...(voice.assets||[]).map(s=>s.id),...(data.voiceModels||[]).filter(m=>m.voiceId===voice.id).map(m=>m.assetId)].filter(Boolean);
 const others=new Set((data.voices||[]).filter(v=>v.id!==voice.id).flatMap(v=>[v.assetId,...(v.assets||[]).map(s=>s.id)]).filter(Boolean));
 for(const m of data.voiceModels||[])if(m.voiceId!==voice.id&&m.assetId)others.add(m.assetId);
 for(const p of data.trainingPlans||[])if(p.voiceId!==voice.id){
  for(const id of p.sampleIds||[])if(id)others.add(id);
  for(const s of p.sampleSnapshot||[])if(s?.id)others.add(s.id);
 }
 for(const p of data.projects||[])for(const t of p.tracks||[])for(const c of t.clips||[])if(c.assetId)others.add(c.assetId);
 if(owned.some(id=>others.has(id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
 return [...new Set(owned)];
}
