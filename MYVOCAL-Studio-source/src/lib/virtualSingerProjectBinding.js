// Original requirements #25/#26/#55: compose existing voice, authorized
// character and their genuinely registered model into a reusable virtual singer.
// No synthesized media is claimed merely because a profile is linked.
const permitted=new Set(['owned','self','licensed']);
function hasRights(entry){
 return !!entry&&permitted.has(entry.rights)&&
  (entry.rights!=='licensed'||!!String(entry.rightsNote||'').trim());
}
export function resolveVirtualSingerProfile(id,data){
 const singer=(data?.virtualSingers||[]).find(s=>s.id===id);
 if(!singer)throw Error('선택한 가상 가수 프로필이 라이브러리에 없습니다.');
 if(!singer.voiceId||!singer.characterId)
  throw Error('가상 가수에 실제 Voice와 Character를 모두 연결하세요.');
 const voice=(data.voices||[]).find(v=>v.id===singer.voiceId);
 const character=(data.characters||[]).find(c=>c.id===singer.characterId);
 if(!hasRights(voice)||!hasRights(character)||
   character.kind==='person'&&character.rights==='owned')
  throw Error('가상 가수의 목소리·캐릭터 권한이나 원본 연결을 확인하세요.');
 const model=singer.modelId?(data.voiceModels||[]).find(m=>m.id===singer.modelId):null;
 if(singer.modelId&&(!model||model.voiceId!==voice.id||model.engineId==='sampler'))
  throw Error('가상 가수에 다른 사람의 음색 모델 또는 샘플 미리보기를 연결할 수 없습니다.');
 const trained=model?.engineId==='diffsinger'&&
   model.modelKind==='local-installed-acoustic'&&
   model.status==='checkpoint-produced-in-unverified-environment'&&
   model.source==='official-diffsinger-acoustic-training'&&
   typeof model.dictionaryAssetId==='string'&&!!model.dictionaryAssetId&&
   /^[a-f0-9]{64}$/i.test(String(model.dictionarySha256||''));
 return {id:singer.id,name:singer.name,voice,character,model,
  preferredSingingModelId:trained?model.id:'',
  trainedSingingReady:trained,videoMode:character.kind==='person'?'person':'character'};
}
export function virtualSingerProjectSelection(id,data){
 const selected=resolveVirtualSingerProfile(id,data);
 return {virtualSingerId:selected.id,voiceId:selected.voice.id,
  characterId:selected.character.id,videoMode:selected.videoMode,
  singingModelId:selected.preferredSingingModelId,
  singingStyle:selected.style||'Natural'};
}
export function virtualSingerProjectStatus(project,data){
 if(!project?.virtualSingerId)return {linked:false,valid:false};
 try{
  const singer=resolveVirtualSingerProfile(project.virtualSingerId,data);
  if(singer.voice.id!==project.voiceId||singer.character.id!==project.characterId)
   throw Error('가상 가수 Voice/Character가 프로젝트 설정과 다릅니다.');
  return {linked:true,valid:true,singingModelId:singer.preferredSingingModelId,
   trainedSingingReady:singer.trainedSingingReady,name:singer.name};
 }catch(error){return {linked:true,valid:false,message:error.message};}
}
