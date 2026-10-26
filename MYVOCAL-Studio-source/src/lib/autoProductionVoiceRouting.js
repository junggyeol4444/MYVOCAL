// Original #6/#7/#25/#55: Choose an actually trained, authorized local
// Korean singing model for a new one-click Song+MV project. It does NOT
// bypass copyright confirmation or start an external service automatically.
import {listedDiffSingerModels} from './diffSingerVoiceRegistry.js';

const owned=new Set(['self','owned','licensed']);
function permitted(voice){
 return voice&&owned.has(voice.rights)&&
  (voice.rights!=='licensed'||String(voice.rightsNote||'').trim());
}
export function trainedKoreanVoiceRoute(project,data){
 if(!project||!data)return null;
 const voices=Array.isArray(data.voices)?data.voices:[];
 const models=Array.isArray(data.voiceModels)?data.voiceModels:[];
 const selected=voices.find(v=>v.id===project.voiceId);
 // A missing or prohibited voice must never silently use somebody else's model.
 if(!selected||!permitted(selected))return null;
 const matches=listedDiffSingerModels(selected,models).filter(m=>
  typeof m.dictionaryAssetId==='string'&&m.dictionaryAssetId.length>0&&
  typeof m.dictionarySha256==='string'&&/^[a-f0-9]{64}$/i.test(m.dictionarySha256)&&
  m.source==='official-diffsinger-acoustic-training');
 if(!matches.length)return null;
 matches.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 // Never override the deliberately selected Virtual Singer singing model.
 const model=project.singingModelId?
  matches.find(m=>m.id===project.singingModelId):matches[0];
 if(!model)return null;
 return {backend:'diffsinger',voiceId:selected.id,modelId:model.id,
  trainingJobId:model.trainingJobId,experiment:model.experiment};
}
export function identityReadyForMv(project,data){
 if(!project?.characterId)return project?.videoMode==='auto';
 const c=(data?.characters||[]).find(v=>v.id===project.characterId);
 return !!c&&['self','owned','licensed'].includes(c.rights)&&
  (c.rights!=='licensed'||String(c.rightsNote||'').trim())&&
  (c.kind==='person'?c.rights!=='owned':true)&&
  (c.assets||[]).some(a=>['image/png','image/jpeg'].includes(a.type));
}
