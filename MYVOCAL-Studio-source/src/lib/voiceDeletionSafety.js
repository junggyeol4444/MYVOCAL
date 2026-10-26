// Pure reference guards: deleting a linked original would corrupt saved projects.
// MV 장면, 수정 이력, 캐릭터 프로필에서 재사용하는 미디어 원본도 삭제로부터 보호합니다.
// 다른 곳에서 참조하는 파일은 목소리나 모델 삭제 시 함께 삭제하지 않습니다.
// Ignore incomplete imported records while preserving every valid reference.
const records = value => Array.isArray(value) ? value.filter(x=>x && typeof x==='object') : [];
function projectMediaIds(project){
 const ids=[];
 if(!project || typeof project!=='object')return ids;
 for(const track of records(project.tracks))for(const clip of records(track.clips))ids.push(clip.assetId);
 // STEP92 stores raw prior-scene snapshots, while STEP94 stores {scene: prior}.
 // The shared iterator must inspect both shapes without losing old originals.
 for(const scene of projectScenes(project)){
  ids.push(scene.imageAssetId,scene.videoClipAssetId,scene.personMv?.referenceAssetId,
   scene.characterMv?.referenceAssetId,scene.regeneration92?.sourceAssetId);
 }
 return ids.filter(Boolean);
}
function characterMediaIds(character){
 if(!character || typeof character!=='object')return [];
 const ids=[character.assetId,character.referenceId,character.videoAssetId,
  character.layerPlan?.sourceAssetId,character.animation2d?.sourceAssetId,
  character.rig3d?.assetId,character.stage3d?.assetId,
  character.personLipSync?.videoAssetId,character.personLipSync?.audioAssetId,
  character.dance88?.referenceAssetId,character.performance89?.referenceAssetId];
 for(const asset of records(character.assets))ids.push(asset.id);
 for(const look of records(character.looks))ids.push(look.referenceAssetId);
 return ids.filter(Boolean);
}
// Project character references include the current cast and undoable scene history.
// Iterate instead of recursing: long or cyclic histories must not lose references.
function* projectScenes(project){
 const pending=[...records(project?.scenes)],visited=new Set();
 while(pending.length){
  const scene=pending.pop();
  if(visited.has(scene))continue;
  visited.add(scene);
  yield scene;
  for(const key of ['regeneration92','characterReplace94']){
   for(const entry of records(scene[key]?.history)){
    // Direct history snapshots and wrappers can both carry live references.
    pending.push(entry);
    if(entry.scene && typeof entry.scene==='object')pending.push(entry.scene);
   }
  }
 }
}
function projectCharacterIds(project){
 const ids=[project?.characterId];
 for(const member of records(project?.band90?.members))ids.push(member.characterId);
 for(const scene of projectScenes(project)){
  ids.push(scene.characterId,scene.personMv?.personId,scene.characterMv?.characterId);
 }
 return ids.filter(Boolean);
}
export function characterDependents(data,character){
 const uses=[];
 if(!character?.id)return uses;
 for(const project of records(data?.projects)){
  if(projectCharacterIds(project).includes(character.id))uses.push('프로젝트 '+(project.title||project.id));
 }
 for(const singer of records(data?.virtualSingers)){
  if(singer.characterId===character.id)uses.push('가상 가수 '+(singer.name||singer.id));
 }
 return uses;
}
// Only character.assets were deleted by the original GUI. Never expand that
// deletion set to referenceId, looks, model/voice assets, or other linked files.
export function characterOwnedFileIds(data,character){
 if(!character?.id)throw Error('캐릭터 정보가 없습니다.');
 const dependents=characterDependents(data,character);
 if(dependents.length)throw Error('연결된 프로젝트가 있어 캐릭터를 삭제할 수 없습니다: '+dependents.join(', '));
 const owned=[...new Set(records(character.assets).map(asset=>asset.id).filter(Boolean))];
 for(const id of owned){
  if(records(data?.projects).some(project=>projectMediaIds(project).includes(id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
  if(records(data?.characters).some(other=>other.id!==character.id&&characterMediaIds(other).includes(id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
  if(records(data?.voices).some(voice=>voice.assetId===id||records(voice.assets).some(asset=>asset.id===id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
  if(records(data?.voiceModels).some(model=>model.assetId===id||model.dictionaryAssetId===id||model.checkpointAssetId===id||model.sourceSampleId===id))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
  if(records(data?.trainingPlans).some(plan=>(Array.isArray(plan.sampleIds)&&plan.sampleIds.includes(id))||records(plan.sampleSnapshot).some(sample=>sample.id===id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
 }
 return owned;
}
export function sampleDependents(data,voiceId,id){
 const uses=[];
 for(const p of records(data.trainingPlans))if((p.sampleIds||[]).includes(id)||(records(p.sampleSnapshot)).some(s=>s?.id===id))uses.push('학습 기록 '+(p.voiceName||p.id));
 for(const v of records(data.voices))if(v.id!==voiceId&&(v.assetId===id||(records(v.assets)).some(s=>s.id===id)))uses.push('목소리 '+(v.name||v.id));
 for(const m of records(data.voiceModels))if(m.sourceSampleId===id||m.assetId===id||m.dictionaryAssetId===id||m.checkpointAssetId===id)uses.push('모델 '+(m.name||m.id));
 for(const p of records(data.projects))if(projectMediaIds(p).includes(id))uses.push('곡 '+(p.title||p.id));
 for(const c of records(data.characters))if(characterMediaIds(c).includes(id))uses.push('캐릭터 '+(c.name||c.id));
 return uses;
}
export function voiceDependents(data,voice){
 const ids=new Set((records(data.voiceModels)).filter(m=>m.voiceId===voice.id).map(m=>m.id)),uses=[];
 for(const p of records(data.projects))if(p.voiceId===voice.id||ids.has(p.singingEngine?.modelId)||ids.has(p.singingModelId))uses.push('프로젝트 '+(p.title||p.id));
 for(const x of records(data.virtualSingers))if(x.voiceId===voice.id)uses.push('가상 가수 '+(x.name||x.id));
 for(const x of records(data.voicebanks))if(x.voiceId===voice.id)uses.push('보이스뱅크 '+(x.name||x.id));
 return uses;
}
export function modelDependents(data,model){
 const uses=[];
 for(const p of records(data.projects))if(p.singingEngine?.modelId===model.id||p.singingModelId===model.id)uses.push('프로젝트 '+(p.title||p.id));
 for(const singer of records(data.virtualSingers))if(singer.modelId===model.id)uses.push('가상 가수 '+(singer.name||singer.id));
 for(const other of records(data.voiceModels))if(other.id!==model.id&&model.assetId&&(other.assetId===model.assetId||other.sourceSampleId===model.assetId))uses.push('모델 '+(other.name||other.id));
 if(model.assetId){
  for(const v of records(data.voices))if(v.assetId===model.assetId||(records(v.assets)).some(s=>s.id===model.assetId))uses.push('목소리 '+(v.name||v.id));
  for(const p of records(data.trainingPlans))if((p.sampleIds||[]).includes(model.assetId)||(records(p.sampleSnapshot)).some(s=>s?.id===model.assetId))uses.push('학습 기록 '+(p.voiceName||p.id));
  for(const p of records(data.projects))if(projectMediaIds(p).includes(model.assetId))uses.push('곡 '+(p.title||p.id));
  for(const c of records(data.characters))if(characterMediaIds(c).includes(model.assetId))uses.push('캐릭터 '+(c.name||c.id));
 }
 return uses;
}
export function voiceOwnedFileIds(data,voice){
 const owned=[voice.assetId,...(records(voice.assets)).map(s=>s.id),...(records(data.voiceModels)).filter(m=>m.voiceId===voice.id).flatMap(m=>[m.assetId,m.dictionaryAssetId,m.checkpointAssetId])].filter(Boolean);
 const others=new Set((records(data.voices)).filter(v=>v.id!==voice.id).flatMap(v=>[v.assetId,...(records(v.assets)).map(s=>s.id)]).filter(Boolean));
 for(const m of records(data.voiceModels))if(m.voiceId!==voice.id){
  if(m.assetId)others.add(m.assetId);
  if(m.sourceSampleId)others.add(m.sourceSampleId);
  if(m.dictionaryAssetId)others.add(m.dictionaryAssetId);
  if(m.checkpointAssetId)others.add(m.checkpointAssetId);
 }
 for(const p of records(data.trainingPlans))if(p.voiceId!==voice.id){
  for(const id of p.sampleIds||[])if(id)others.add(id);
  for(const s of records(p.sampleSnapshot))if(s?.id)others.add(s.id);
 }
 for(const p of records(data.projects))for(const id of projectMediaIds(p))others.add(id);
 for(const character of records(data.characters))for(const id of characterMediaIds(character))others.add(id);
 if(owned.some(id=>others.has(id)))throw Error('공유하고 있는 원본 파일이 있으므로 삭제할 수 없습니다.');
 return [...new Set(owned)];
}
