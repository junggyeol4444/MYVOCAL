// Portable single-project backup, including local media. No cloud upload is used.
import {getFile,putFilesAtomic} from './assetDb.js';
import {genId,now} from './schema.js';
import {isAlignmentStale,alignmentSource} from './lyricAlignment.js';
import {isPhonemePlanStale,phonemeSourceKey} from './phonemePlan.js';
import {downloadText} from './store.js';
import {MAX_BUNDLE_BYTES,validateBundleEnvelope} from './bundleSafety.js';
import {validateMediaDataUrl,validateMediaMetadata} from './base64Safety.js';
const MIME='application/json';
const fileBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('파일 읽기 실패'));reader.readAsDataURL(file);});
function blobFromDataUrl(data){
 const {mime,payload}=validateMediaDataUrl(data);
 const binary=atob(payload),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type:mime});
}

export function linkedProfiles(project,data){
 const voice=(data.voices||[]).filter(v=>v.id===project.voiceId);
 const charIds=new Set([project.characterId,...(project.scenes||[]).flatMap(s=>[s.characterId,s.personMv?.personId,s.characterMv?.characterId]),...(project.band90?.members||[]).map(m=>m.characterId),...(project.scenes||[]).flatMap(s=>(s.characterReplace94?.history||[]).flatMap(h=>[h.scene?.characterId,h.scene?.personMv?.personId,h.scene?.characterMv?.characterId]))].filter(Boolean));
 const characters=(data.characters||[]).filter(c=>charIds.has(c.id));
 return {voices:voice,characters};
}
export function assetsOf(project,profiles){
 const ids=new Set();for(const t of project.tracks||[])for(const clip of t.clips||[])if(clip.assetId)ids.add(clip.assetId);
 for(const scene of project.scenes||[]){for(const id of [scene.personMv?.referenceAssetId,scene.characterMv?.referenceAssetId,scene.regeneration92?.sourceAssetId])if(id)ids.add(id);for(const old of scene.characterReplace94?.history||[]){const prior=old.scene||{};for(const id of [prior.imageAssetId,prior.videoClipAssetId,prior.personMv?.referenceAssetId,prior.characterMv?.referenceAssetId,prior.regeneration92?.sourceAssetId])if(id)ids.add(id);for(const h of prior.regeneration92?.history||[])for(const id of [h.imageAssetId,h.videoClipAssetId])if(id)ids.add(id);}if(scene.imageAssetId)ids.add(scene.imageAssetId);if(scene.videoClipAssetId)ids.add(scene.videoClipAssetId);for(const prior of scene.regeneration92?.history||[]){if(prior.imageAssetId)ids.add(prior.imageAssetId);if(prior.videoClipAssetId)ids.add(prior.videoClipAssetId);}}
 for(const group of ['voices','characters'])for(const p of profiles[group]){for(const key of ['assetId','referenceId','videoAssetId'])if(p[key])ids.add(p[key]);for(const a of p.assets||[])if(a.id)ids.add(a.id);for(const look of p.looks||[])if(look.referenceAssetId)ids.add(look.referenceAssetId);for(const id of [p.layerPlan?.sourceAssetId,p.animation2d?.sourceAssetId,p.rig3d?.assetId,p.stage3d?.assetId,p.personLipSync?.videoAssetId,p.personLipSync?.audioAssetId,p.dance88?.referenceAssetId,p.performance89?.referenceAssetId])if(id)ids.add(id);}
 return [...ids];
}
export async function downloadProjectBundle(project,data){
 const profiles=linkedProfiles(project,data),assets={};let size=0,missing=[];
 for(const id of assetsOf(project,profiles)){
  const file=await getFile(id);if(!file){missing.push(id);continue;}
  size+=file.size;if(size>150*1024*1024)throw new Error('오디오 등 원본 파일 합계가 150MB를 초과하여 통합 백업을 만들 수 없습니다.');
  assets[id]={name:file.name||id,type:file.type||'application/octet-stream',dataUrl:await fileBase64(file)};
 }
 if(missing.length)throw new Error('원본 파일 '+missing.length+'개를 찾지 못했습니다. 누락 파일을 다시 등록한 뒤 백업해 주세요.');
 const json={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,exportedAt:now(),project,profiles,assets};
 downloadText(JSON.stringify(json),`${String(project.title||'MYVOCAL').replace(/[\\/:*?"<>|]/g,'_')}.myvocal.json`,MIME);
 return assetsOf(project,profiles).length;
}
export async function importProjectBundle(file){
 if(file.size>MAX_BUNDLE_BYTES)throw new Error('백업 파일이 허용된 크기를 초과했습니다.');
 const input=validateBundleEnvelope(JSON.parse(await file.text()));let project,profiles={voices:[],characters:[]},assets={};
 if(input?.format==='MYVOCAL_PROJECT_BACKUP'&&input.formatVersion===2){project=input.project;profiles=input.profiles||profiles;assets=input.assets||{};}
 else if(input?.title&&Array.isArray(input.tracks)){project=input;}
 else throw new Error('MYVOCAL 프로젝트 형식이 아닙니다.');
 if(!project||typeof project.title!=='string'||!Array.isArray(project.tracks)||!Array.isArray(project.sections))throw new Error('프로젝트의 기본 구조가 잘못되었습니다.');
 // Use prototype-free maps even when importing legacy projects.
 const mapping=Object.create(null),assetMap=Object.create(null),pendingAssets=[];
 for(const [oldId,meta] of Object.entries(assets)){
  const id=genId('asset');if(!meta?.dataUrl)throw new Error('백업 원본 파일이 누락되었습니다.');
  validateMediaMetadata(meta,validateMediaDataUrl(meta.dataUrl).mime);const blob=blobFromDataUrl(meta.dataUrl);pendingAssets.push([id,new File([blob],meta.name||id,{type:meta.type||blob.type})]);assetMap[oldId]=id;
 }
 const patchAssets=x=>{
  const result={...x};if(result.assets)result.assets=result.assets.map(a=>({...a,id:assetMap[a.id]||a.id}));if(result.looks)result.looks=result.looks.map(look=>({...look,referenceAssetId:assetMap[look.referenceAssetId]||look.referenceAssetId}));if(result.layerPlan)result.layerPlan={...result.layerPlan,sourceAssetId:assetMap[result.layerPlan.sourceAssetId]||result.layerPlan.sourceAssetId};if(result.animation2d)result.animation2d={...result.animation2d,sourceAssetId:assetMap[result.animation2d.sourceAssetId]||result.animation2d.sourceAssetId};if(result.rig3d)result.rig3d={...result.rig3d,assetId:assetMap[result.rig3d.assetId]||result.rig3d.assetId};if(result.stage3d)result.stage3d={...result.stage3d,assetId:assetMap[result.stage3d.assetId]||result.stage3d.assetId};if(result.personLipSync)result.personLipSync={...result.personLipSync,videoAssetId:assetMap[result.personLipSync.videoAssetId]||result.personLipSync.videoAssetId,audioAssetId:assetMap[result.personLipSync.audioAssetId]||result.personLipSync.audioAssetId};if(result.dance88)result.dance88={...result.dance88,referenceAssetId:assetMap[result.dance88.referenceAssetId]||result.dance88.referenceAssetId};if(result.performance89)result.performance89={...result.performance89,referenceAssetId:assetMap[result.performance89.referenceAssetId]||result.performance89.referenceAssetId};for(const name of ['assetId','referenceId','videoAssetId'])if(result[name])result[name]=assetMap[result[name]]||result[name];return result;
 };
 const makeProfile=(group,p)=>{const newid=genId(group==='voices'?'voice':'chr');mapping[p.id]=newid;return {...patchAssets(p),id:newid,name:p.name+' (복원)',createdAt:now()};};
 const voices=(profiles.voices||[]).map(p=>makeProfile('voices',p)),characters=(profiles.characters||[]).map(p=>makeProfile('characters',p));
 const patchHistoricalScene=prior=>({...prior,
  characterId:mapping[prior.characterId]||prior.characterId,
  ...(prior.personMv?{personMv:{...prior.personMv,personId:mapping[prior.personMv.personId]||prior.personMv.personId,referenceAssetId:assetMap[prior.personMv.referenceAssetId]||prior.personMv.referenceAssetId}}:{}),
  ...(prior.characterMv?{characterMv:{...prior.characterMv,characterId:mapping[prior.characterMv.characterId]||prior.characterMv.characterId,referenceAssetId:assetMap[prior.characterMv.referenceAssetId]||prior.characterMv.referenceAssetId}}:{}),
  ...(prior.imageAssetId?{imageAssetId:assetMap[prior.imageAssetId]||prior.imageAssetId}:{}),
  ...(prior.videoClipAssetId?{videoClipAssetId:assetMap[prior.videoClipAssetId]||prior.videoClipAssetId}:{}),
  ...(prior.regeneration92?{regeneration92:{...prior.regeneration92,sourceAssetId:assetMap[prior.regeneration92.sourceAssetId]||prior.regeneration92.sourceAssetId,history:(prior.regeneration92.history||[]).map(h=>({...h,imageAssetId:assetMap[h.imageAssetId]||h.imageAssetId,videoClipAssetId:assetMap[h.videoClipAssetId]||h.videoClipAssetId}))}}:{}),
 });
 const original=project;
 const oldTrackIds=original.tracks.map(t=>t.id);
 const wasAligned=!!original.vocalAlignment&&!isAlignmentStale(original,original.vocalAlignment);
 const hadValidPhonemes=wasAligned&&!!original.phonemePlan&&!isPhonemePlanStale(original.vocalAlignment,original.phonemePlan);
 project={...project,id:genId('prj'),title:project.title+' (복원)',createdAt:now(),updatedAt:now(),voiceId:mapping[project.voiceId]||project.voiceId||'',characterId:mapping[project.characterId]||project.characterId||'',tracks:project.tracks.map(t=>({...t,id:genId('trk'),clips:(t.clips||[]).map(c=>({...c,id:genId('clip'),assetId:assetMap[c.assetId]||c.assetId}))})),scenes:(project.scenes||[]).map(s=>({...s,id:genId('scn'),characterId:mapping[s.characterId]||s.characterId||'',...(s.personMv?{personMv:{...s.personMv,personId:mapping[s.personMv.personId]||s.personMv.personId,referenceAssetId:assetMap[s.personMv.referenceAssetId]||s.personMv.referenceAssetId}}:{}),...(s.characterMv?{characterMv:{...s.characterMv,characterId:mapping[s.characterMv.characterId]||s.characterMv.characterId,referenceAssetId:assetMap[s.characterMv.referenceAssetId]||s.characterMv.referenceAssetId}}:{}),...(s.imageAssetId?{imageAssetId:assetMap[s.imageAssetId]||s.imageAssetId}:{}),...(s.videoClipAssetId?{videoClipAssetId:assetMap[s.videoClipAssetId]||s.videoClipAssetId}:{}),...(s.videoGeneration?{videoGeneration:{...s.videoGeneration,sourceKey:""}}:{}),...(s.characterReplace94?{characterReplace94:{...s.characterReplace94,history:(s.characterReplace94.history||[]).map(h=>({...h,scene:patchHistoricalScene(h.scene||{})}))}}:{}),...(s.regeneration92?{regeneration92:{...s.regeneration92,sourceAssetId:assetMap[s.regeneration92.sourceAssetId]||s.regeneration92.sourceAssetId,history:(s.regeneration92.history||[]).map(h=>({...h,imageAssetId:assetMap[h.imageAssetId]||h.imageAssetId,videoClipAssetId:assetMap[h.videoClipAssetId]||h.videoClipAssetId}))}}:{}),...(s.imageGeneration?{imageGeneration:{...s.imageGeneration,key:''}}:{})}))};
 if(project.videoEdits93?.history){const sceneIdMap=Object.fromEntries(original.scenes.map((scene,i)=>[scene.id,project.scenes[i]?.id]));project.videoEdits93={...project.videoEdits93,history:project.videoEdits93.history.map(entry=>({...entry,sceneId:sceneIdMap[entry.sceneId]||entry.sceneId}))};}
 if(project.band90)project.band90={...project.band90,members:(project.band90.members||[]).map(m=>({...m,characterId:mapping[m.characterId]||m.characterId}))};
 if(wasAligned){
  const index=oldTrackIds.indexOf(original.vocalAlignment.trackId);
  if(index>=0){const migrated={...original.vocalAlignment,projectId:project.id,trackId:project.tracks[index].id};
   migrated.sourceKey=alignmentSource(project,migrated.trackId).sourceKey;project.vocalAlignment=migrated;
   if(hadValidPhonemes)project.phonemePlan={...original.phonemePlan,projectId:project.id,trackId:migrated.trackId,sourceKey:phonemeSourceKey(migrated)};}
 }
 // STEP88: keep the source project reference portable when restoring its linked character.
 for(const c of characters){if(c.dance88?.projectId===original.id)c.dance88={...c.dance88,projectId:project.id};if(c.performance89?.projectId===original.id){const idMap=Object.fromEntries(oldTrackIds.map((id,i)=>[id,project.tracks[i]?.id]));c.performance89={...c.performance89,projectId:project.id,instruments:(c.performance89.instruments||[]).map(e=>({...e,trackId:idMap[e.trackId]||e.trackId}))};}}
 await putFilesAtomic(pendingAssets);
 return {project,voices,characters,hasAudio:Object.keys(assets).length>0,portable:!!input.format};
}
