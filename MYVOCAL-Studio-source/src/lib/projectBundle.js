// Portable single-project backup, including local media. No cloud upload is used.
import {getFile,putFilesAtomic} from './assetDb.js';
import {genId,now} from './schema.js';
import {isAlignmentStale,alignmentSource} from './lyricAlignment.js';
import {isPhonemePlanStale,phonemeSourceKey} from './phonemePlan.js';
import {downloadText} from './store.js';
import {MAX_BUNDLE_BYTES,validateBundleEnvelope} from './bundleSafety.js';
import {validateMediaDataUrl,validateMediaMetadata} from './base64Safety.js';
import {mediaSha256Hex,assertPortableAssetReferences,verifyBackupMedia} from './projectBackupIntegrity.js';
const MIME='application/json';
const fileBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('파일 읽기 실패'));reader.readAsDataURL(file);});
function blobFromDataUrl(data){
 const {mime,payload}=validateMediaDataUrl(data);
 const binary=atob(payload),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type:mime});
}

export function linkedProfiles(project,data){
 const selectedVirtualSinger=(data.virtualSingers||[]).find(v=>v.id===project.virtualSingerId);
 const linkedVoiceIds=new Set([project.voiceId,selectedVirtualSinger?.voiceId,
  project.duetSingers?.lead?.voiceId,project.duetSingers?.harmony?.voiceId,
  ...(project.tracks||[]).map(t=>t.singerVoiceId),
  ...(project.voiceReplace54?.history||[]).flatMap(h=>[h.fromVoiceId,h.toVoiceId])].filter(Boolean));
 const voice=(data.voices||[]).filter(v=>linkedVoiceIds.has(v.id));
 const charIds=new Set([project.characterId,selectedVirtualSinger?.characterId,project.duetSingers?.lead?.characterId,project.duetSingers?.harmony?.characterId,...(project.tracks||[]).map(t=>t.singerCharacterId),...(project.scenes||[]).flatMap(s=>[s.characterId,s.personMv?.personId,s.characterMv?.characterId]),...(project.band90?.members||[]).map(m=>m.characterId),...(project.scenes||[]).flatMap(s=>(s.characterReplace94?.history||[]).flatMap(h=>[h.scene?.characterId,h.scene?.personMv?.personId,h.scene?.characterMv?.characterId]))].filter(Boolean));
 const characters=(data.characters||[]).filter(c=>charIds.has(c.id));
 const voiceIds=new Set(voice.map(v=>v.id));
 // Preserve training history and imported checkpoint files for this project's voice.
 const voiceModels=(data.voiceModels||[]).filter(m=>voiceIds.has(m.voiceId));
 const trainingPlans=(data.trainingPlans||[]).filter(p=>voiceIds.has(p.voiceId));
 return {voices:voice,characters,voiceModels,trainingPlans,virtualSingers:selectedVirtualSinger?[selectedVirtualSinger]:[]};
}
export function assetsOf(project,profiles){
 const ids=new Set();for(const t of project.tracks||[])for(const clip of t.clips||[])if(clip.assetId)ids.add(clip.assetId);
 // 완성 WAV/WebM/MP4 신규 산출물도 다운로드만이 아닌 복원 가능한 원본 자산이다.
 for(const output of project.deliverables||[])if(output?.assetId)ids.add(output.assetId);
 for(const scene of project.scenes||[]){for(const id of [scene.personMv?.referenceAssetId,scene.characterMv?.referenceAssetId,scene.regeneration92?.sourceAssetId])if(id)ids.add(id);for(const old of scene.characterReplace94?.history||[]){const prior=old.scene||{};for(const id of [prior.imageAssetId,prior.videoClipAssetId,prior.personMv?.referenceAssetId,prior.characterMv?.referenceAssetId,prior.regeneration92?.sourceAssetId])if(id)ids.add(id);for(const h of prior.regeneration92?.history||[])for(const id of [h.imageAssetId,h.videoClipAssetId])if(id)ids.add(id);}if(scene.imageAssetId)ids.add(scene.imageAssetId);if(scene.videoClipAssetId)ids.add(scene.videoClipAssetId);for(const prior of scene.regeneration92?.history||[]){if(prior.imageAssetId)ids.add(prior.imageAssetId);if(prior.videoClipAssetId)ids.add(prior.videoClipAssetId);}}
 for(const group of ['voices','characters','voiceModels'])for(const p of profiles[group]||[]){for(const key of ['assetId','indexAssetId','dictionaryAssetId','referenceId','videoAssetId','sourceSampleId'])if(p[key])ids.add(p[key]);for(const a of p.assets||[])if(a.id)ids.add(a.id);for(const look of p.looks||[])if(look.referenceAssetId)ids.add(look.referenceAssetId);for(const id of [p.layerPlan?.sourceAssetId,p.animation2d?.sourceAssetId,p.rig3d?.assetId,p.stage3d?.assetId,p.personLipSync?.videoAssetId,p.personLipSync?.audioAssetId,p.dance88?.referenceAssetId,p.dance88?.audioReactive30?.sourceAssetId,p.motionCaptured31?.referenceAssetId,p.performance89?.referenceAssetId])if(id)ids.add(id);}
 for(const plan of profiles.trainingPlans||[]){
  for(const id of plan.sampleIds||[])if(id)ids.add(id);
  for(const sample of plan.sampleSnapshot||[])if(sample.id)ids.add(sample.id);
 }
 return [...ids];
}
export async function downloadProjectBundle(project,data){
 const profiles=linkedProfiles(project,data),assets={};let size=0,missing=[];
 for(const id of assetsOf(project,profiles)){
  const file=await getFile(id);if(!file){missing.push(id);continue;}
  size+=file.size;if(size>150*1024*1024)throw new Error('오디오 등 원본 파일 합계가 150MB를 초과하여 통합 백업을 만들 수 없습니다.');
  assets[id]={name:file.name||id,type:file.type||'application/octet-stream',bytes:file.size,sha256:await mediaSha256Hex(await file.arrayBuffer()),dataUrl:await fileBase64(file)};
 }
 if(missing.length)throw new Error('원본 파일 '+missing.length+'개를 찾지 못했습니다. 누락 파일을 다시 등록한 뒤 백업해 주세요.');
 const json={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,integrityVersion:1,exportedAt:now(),project,profiles,assets};
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
 // Complete v2 backups must include every linked original, including RVC checkpoints and FAISS indexes.
 // Legacy metadata-only JSON exports deliberately remain compatible and do not claim to include media.
 if(input.format==='MYVOCAL_PROJECT_BACKUP'&&input.integrityVersion===1)assertPortableAssetReferences(assetsOf(project,profiles),assets);
 // Use prototype-free maps even when importing legacy projects.
 const mapping=Object.create(null),assetMap=Object.create(null),pendingAssets=[];
 for(const [oldId,meta] of Object.entries(assets)){
  const id=genId('asset');if(!meta?.dataUrl)throw new Error('백업 원본 파일이 누락되었습니다.');
  validateMediaMetadata(meta,validateMediaDataUrl(meta.dataUrl).mime);const blob=blobFromDataUrl(meta.dataUrl);
  await verifyBackupMedia(meta,new Uint8Array(await blob.arrayBuffer()));
  pendingAssets.push([id,new File([blob],meta.name||id,{type:meta.type||blob.type})]);assetMap[oldId]=id;
 }
 const patchAssets=x=>{
  const result={...x};if(result.assets)result.assets=result.assets.map(a=>({...a,id:assetMap[a.id]||a.id}));if(result.looks)result.looks=result.looks.map(look=>({...look,referenceAssetId:assetMap[look.referenceAssetId]||look.referenceAssetId}));if(result.layerPlan)result.layerPlan={...result.layerPlan,sourceAssetId:assetMap[result.layerPlan.sourceAssetId]||result.layerPlan.sourceAssetId};if(result.animation2d)result.animation2d={...result.animation2d,sourceAssetId:assetMap[result.animation2d.sourceAssetId]||result.animation2d.sourceAssetId};if(result.rig3d)result.rig3d={...result.rig3d,assetId:assetMap[result.rig3d.assetId]||result.rig3d.assetId};if(result.stage3d)result.stage3d={...result.stage3d,assetId:assetMap[result.stage3d.assetId]||result.stage3d.assetId};if(result.personLipSync)result.personLipSync={...result.personLipSync,videoAssetId:assetMap[result.personLipSync.videoAssetId]||result.personLipSync.videoAssetId,audioAssetId:assetMap[result.personLipSync.audioAssetId]||result.personLipSync.audioAssetId};if(result.dance88)result.dance88={...result.dance88,referenceAssetId:assetMap[result.dance88.referenceAssetId]||result.dance88.referenceAssetId,...(result.dance88.audioReactive30?{audioReactive30:{...result.dance88.audioReactive30,sourceAssetId:assetMap[result.dance88.audioReactive30.sourceAssetId]||result.dance88.audioReactive30.sourceAssetId}}:{})};if(result.motionCaptured31)result.motionCaptured31={...result.motionCaptured31,referenceAssetId:assetMap[result.motionCaptured31.referenceAssetId]||result.motionCaptured31.referenceAssetId};if(result.performance89)result.performance89={...result.performance89,referenceAssetId:assetMap[result.performance89.referenceAssetId]||result.performance89.referenceAssetId};for(const name of ['assetId','indexAssetId','dictionaryAssetId','referenceId','videoAssetId','sourceSampleId'])if(result[name])result[name]=assetMap[result[name]]||result[name];return result;
 };
 const makeProfile=(group,p)=>{const newid=genId(group==='voices'?'voice':'chr');mapping[p.id]=newid;return {...patchAssets(p),id:newid,name:p.name+' (복원)',createdAt:now()};};
 const voices=(profiles.voices||[]).map(p=>makeProfile('voices',p)),characters=(profiles.characters||[]).map(p=>makeProfile('characters',p));
 // Additional profile groups are optional, keeping existing v2 project backups valid.
 const modelIdMap=Object.create(null);
 const voiceModels=(profiles.voiceModels||[]).map(p=>{
  const id=genId('model');modelIdMap[p.id]=id;
  return {...patchAssets(p),id,voiceId:mapping[p.voiceId]||p.voiceId,createdAt:now()};
 });
 const virtualSingerIdMap=Object.create(null);
 const virtualSingers=(profiles.virtualSingers||[]).map(p=>{
  if(!mapping[p.voiceId]||!mapping[p.characterId]||
     p.modelId&&!modelIdMap[p.modelId])
   throw Error('가상 가수 백업의 Voice·Character·모델 연결이 누락되어 복원을 중단합니다.');
  const id=genId('profile');virtualSingerIdMap[p.id]=id;
  return {...p,id,voiceId:mapping[p.voiceId],characterId:mapping[p.characterId],
   modelId:p.modelId?modelIdMap[p.modelId]:'',
   name:p.name+' (복원)',createdAt:now(),updatedAt:now()};
 });
 const trainingPlans=(profiles.trainingPlans||[]).map(p=>({
  ...p,id:genId('train'),voiceId:mapping[p.voiceId]||p.voiceId,
  sampleIds:(p.sampleIds||[]).map(id=>assetMap[id]||id),
  sampleSnapshot:(p.sampleSnapshot||[]).map(s=>({...s,id:assetMap[s.id]||s.id})),
  createdAt:now(),updatedAt:now()
 }));
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
 project={...project,id:genId('prj'),title:project.title+' (복원)',createdAt:now(),updatedAt:now(),voiceId:mapping[project.voiceId]||project.voiceId||'',characterId:mapping[project.characterId]||project.characterId||'',...(project.singingEngine?.modelId&&modelIdMap[project.singingEngine.modelId]?{singingEngine:{...project.singingEngine,modelId:modelIdMap[project.singingEngine.modelId]}}:{}),
 ...(project.singingModelId?{singingModelId:modelIdMap[project.singingModelId]||project.singingModelId}:{}),
 ...(project.virtualSingerId?{virtualSingerId:virtualSingerIdMap[project.virtualSingerId]||project.virtualSingerId}:{}),tracks:project.tracks.map(t=>({...t,id:genId('trk'),clips:(t.clips||[]).map(c=>({...c,id:genId('clip'),assetId:assetMap[c.assetId]||c.assetId}))})),scenes:(project.scenes||[]).map(s=>({...s,id:genId('scn'),characterId:mapping[s.characterId]||s.characterId||'',...(s.personMv?{personMv:{...s.personMv,personId:mapping[s.personMv.personId]||s.personMv.personId,referenceAssetId:assetMap[s.personMv.referenceAssetId]||s.personMv.referenceAssetId}}:{}),...(s.characterMv?{characterMv:{...s.characterMv,characterId:mapping[s.characterMv.characterId]||s.characterMv.characterId,referenceAssetId:assetMap[s.characterMv.referenceAssetId]||s.characterMv.referenceAssetId}}:{}),...(s.imageAssetId?{imageAssetId:assetMap[s.imageAssetId]||s.imageAssetId}:{}),...(s.videoClipAssetId?{videoClipAssetId:assetMap[s.videoClipAssetId]||s.videoClipAssetId}:{}),...(s.videoGeneration?{videoGeneration:{...s.videoGeneration,sourceKey:""}}:{}),...(s.characterReplace94?{characterReplace94:{...s.characterReplace94,history:(s.characterReplace94.history||[]).map(h=>({...h,scene:patchHistoricalScene(h.scene||{})}))}}:{}),...(s.regeneration92?{regeneration92:{...s.regeneration92,sourceAssetId:assetMap[s.regeneration92.sourceAssetId]||s.regeneration92.sourceAssetId,history:(s.regeneration92.history||[]).map(h=>({...h,imageAssetId:assetMap[h.imageAssetId]||h.imageAssetId,videoClipAssetId:assetMap[h.videoClipAssetId]||h.videoClipAssetId}))}}:{}),...(s.imageGeneration?{imageGeneration:{...s.imageGeneration,key:''}}:{})}))};
 // Original #36: scene-level directions derived from the real user's drum
  // PCM must reference the regenerated project track and restored WAV asset.
  project.scenes=project.scenes.map(scene=>{
   const rhythm=scene.rhythmDirection36;
   if(!rhythm)return scene;
   const index=oldTrackIds.indexOf(rhythm.sourceTrackId);
   const newAsset=assetMap[rhythm.sourceAssetId];
   if(index<0||!project.tracks[index]?.id||!newAsset)
    throw Error('백업의 실제 드럼 기반 MV 장면에 음원 원본이나 트랙이 누락됐습니다.');
   return {...scene,rhythmDirection36:{...rhythm,
    sourceTrackId:project.tracks[index].id,sourceAssetId:newAsset}};
  });
  if(Array.isArray(original.deliverables))project.deliverables=original.deliverables.map(o=>({...o,assetId:assetMap[o.assetId]||o.assetId}));
 // 실제 두 Voice·캐릭터와 기존 독립 WAV 트랙 연결을 복원 후 신규 ID로 갱신.
 // 다른 사람의 백업 원본·기존 라이브러리 파일을 덮어쓰거나 교체하지 않는다.
 if(original.duetSingers?.version===1){
  const translateSinger=part=>{
   const previous=original.duetSingers[part]||{},index=oldTrackIds.indexOf(previous.trackId);
   if(index<0||!mapping[previous.voiceId]||!mapping[previous.characterId]||
      !project.tracks[index]?.id)
    throw Error('듀엣 백업에 가수 둘의 Voice·캐릭터·원곡 WAV 연결 자료가 누락됐습니다.');
   return {...previous,voiceId:mapping[previous.voiceId],
    characterId:mapping[previous.characterId],trackId:project.tracks[index].id};
  };
  project.duetSingers={...original.duetSingers,
   lead:translateSinger('lead'),harmony:translateSinger('harmony')};
 }
 // Original #54: backup of replaced vocals includes muted original WAV
 // and restores model, singer, and clip references without modifying sources.
 if(original.voiceReplace54?.version===1){
  const history=original.voiceReplace54.history;
  if(!Array.isArray(history)||history.length>20)
   throw Error('보컬 교체 이력이 누락됐거나 허용 개수를 초과했습니다.');
  const mappedTrack=oldId=>{
   const index=oldTrackIds.indexOf(oldId);
   if(index<0||!project.tracks[index]?.id)
    throw Error('보컬 교체 이력의 원곡 WAV 트랙이 백업에 없습니다.');
   return project.tracks[index].id;
  };
  project.voiceReplace54={...original.voiceReplace54,
   activeVoiceId:mapping[original.voiceReplace54.activeVoiceId]||
    original.voiceReplace54.activeVoiceId,
   history:history.map(row=>{
    if(!Array.isArray(row.newTrackIds)||!row.newTrackIds.length||
      row.newTrackIds.length>2||typeof row.mutedTrackId!=='string'||
      !mapping[row.fromVoiceId]||!mapping[row.toVoiceId])
     throw Error('보컬 교체 기록에 목소리·원곡·신규 WAV 연결이 누락됐습니다.');
    if(row.engine==='diffsinger'&&row.modelId&&!modelIdMap[row.modelId])
     throw Error('보컬 교체용 DiffSinger 학습 모델 기록이 백업에 없습니다.');
    return {...row,fromVoiceId:mapping[row.fromVoiceId],
     toVoiceId:mapping[row.toVoiceId],
     mutedTrackId:mappedTrack(row.mutedTrackId),
     newTrackIds:row.newTrackIds.map(mappedTrack),
     ...(row.modelId&&modelIdMap[row.modelId]?{modelId:modelIdMap[row.modelId]}:{})};
   })};
 }
 if(project.tracks.some(t=>t.singerVoiceId||t.singerCharacterId)){
  project.tracks=project.tracks.map(t=>({
   ...t,...(t.singerVoiceId?{singerVoiceId:mapping[t.singerVoiceId]||t.singerVoiceId}:{}),
   ...(t.singerCharacterId?{singerCharacterId:mapping[t.singerCharacterId]||t.singerCharacterId}:{})
  }));
 }
 // Original #55: restore native Song+MV stage checkpoints only when the
 // matching REAL generated WAV/MIDI track and asset references were included.
 // The resume signature can intentionally cease matching when a different
 // model/voice is selected on the new PC. This never changes original media.
 if(original.productionResume55?.version===1){
  const ledger=original.productionResume55.history;
  if(!Array.isArray(ledger)||ledger.length>16)
   throw Error('전체 음악+MV 이어하기 기록이 누락되거나 허용 개수를 초과했습니다.');
  const remapTrack=oldId=>{
   const index=oldTrackIds.indexOf(oldId);
   if(index<0||!project.tracks[index]?.id)
    throw Error('자동 MV 제작 단계의 기존 음원 트랙이 프로젝트 백업에 없습니다.');
   return project.tracks[index].id;
  };
  project.productionResume55={version:1,history:ledger.map(entry=>{
   if(entry?.version!==1||entry.projectId!==original.id||
      !Array.isArray(entry.output)||entry.output.length>48||
      !Array.isArray(entry.startedWithTrackIds)||entry.startedWithTrackIds.length>512)
    throw Error('자동 제작 단계의 MIDI·WAV 출처가 올바르지 않습니다.');
   return {...entry,projectId:project.id,
    startedWithTrackIds:entry.startedWithTrackIds.map(remapTrack),
    output:entry.output.map(row=>{
     if(!Array.isArray(row.assets)||row.assets.length>24)
      throw Error('자동 제작 단계의 원곡 WAV 참조가 손상됐습니다.');
     const assets=row.assets.map(id=>{
      if(!assetMap[id])
       throw Error('이어하기용 실제 원본 WAV가 백업에 포함되지 않았습니다.');
      return assetMap[id];
     });
     return {...row,id:remapTrack(row.id),assets};
    })
   };
  })};
 }
 // Original #8: own-song energy MIDI edits must remain fully undoable
 // after portable restore. All original notes stay in metadata; source
 // audio is not included or converted into hidden training material.
 if(original.ownedMusicMidiUndo8?.version===1){
  const undo=original.ownedMusicMidiUndo8;
  if(!Array.isArray(undo.saved)||undo.saved.length>48||
   undo.source!=='actual-owned-local-pcm')
   throw Error('백업의 내 음악 스타일 MIDI 복원 자료가 올바르지 않습니다.');
  const used=new Set();
  const saved=undo.saved.map(row=>{
   const index=oldTrackIds.indexOf(row.trackId);
   if(index<0||used.has(row.trackId)||!project.tracks[index]?.id||
      !Array.isArray(row.before)||!Array.isArray(row.after)||
      row.before.length!==row.after.length||row.before.length>12000)
    throw Error('백업의 내 음악 스타일 MIDI 원본·변경 음표 연결이 누락됐습니다.');
   used.add(row.trackId);
   return {...row,trackId:project.tracks[index].id,
    before:row.before.map(n=>({...n})),after:row.after.map(n=>({...n}))};
  });
  project.ownedMusicMidiUndo8={...undo,saved};
 }
 // 원본 #11·#62: 구간별 MIDI 쉼표 편집의 원본 음표 복원 자료도
 // 백업에서 새 트랙 ID로 연결한다. 이전 트랙 ID는 복원 프로젝트에 남기지 않는다.
 if(Array.isArray(original.producerSectionRests)){
  if(original.producerSectionRests.length>256)
   throw Error('MIDI 구간 복원 자료가 허용 범위를 초과했습니다.');
  project.producerSectionRests=original.producerSectionRests.map(entry=>{
   const index=oldTrackIds.indexOf(entry.trackId);
   if(index<0||!project.tracks[index]?.id||!Array.isArray(entry.removed)||
      !Array.isArray(entry.windows)||entry.removed.length>4096)
    throw Error('백업의 MIDI 구간 복원 자료에 연결되지 않은 악기 트랙이 있습니다.');
   return {...entry,trackId:project.tracks[index].id,
    removed:entry.removed.map(note=>({...note})),
    windows:entry.windows.map(w=>({...w}))};
  });
 }
 if(project.videoEdits93?.history){const sceneIdMap=Object.fromEntries(original.scenes.map((scene,i)=>[scene.id,project.scenes[i]?.id]));project.videoEdits93={...project.videoEdits93,history:project.videoEdits93.history.map(entry=>({...entry,sceneId:sceneIdMap[entry.sceneId]||entry.sceneId}))};}
 if(project.band90){
   const pcmDances={};
   for(const [oldCharId,dance] of Object.entries(project.band90.pcmDances||{})){
    const newCharacterId=mapping[oldCharId],oldSourceId=dance?.audioReactive30?.sourceTrackId;
    const oldAssetId=dance?.audioReactive30?.sourceAssetId;
    const index=oldTrackIds.indexOf(oldSourceId);
    if(!newCharacterId||index<0||!project.tracks[index]?.id||!assetMap[oldAssetId])
     throw Error('가상 밴드의 원본 PCM 춤·캐릭터·드럼 WAV 자산이 백업에 누락됐습니다.');
    pcmDances[newCharacterId]={...dance,projectId:project.id,
     audioReactive30:{...dance.audioReactive30,
      sourceTrackId:project.tracks[index].id,sourceAssetId:assetMap[oldAssetId]}};
   }
   project.band90={...project.band90,
    members:(project.band90.members||[]).map(m=>({...m,characterId:mapping[m.characterId]||m.characterId})),
    ...(project.band90.pcmDances?{pcmDances}:{})};
  }
 if(wasAligned){
  const index=oldTrackIds.indexOf(original.vocalAlignment.trackId);
  if(index>=0){const migrated={...original.vocalAlignment,projectId:project.id,trackId:project.tracks[index].id};
   migrated.sourceKey=alignmentSource(project,migrated.trackId).sourceKey;project.vocalAlignment=migrated;
   if(hadValidPhonemes)project.phonemePlan={...original.phonemePlan,projectId:project.id,trackId:migrated.trackId,sourceKey:phonemeSourceKey(migrated)};}
 }
 // STEP88: keep the source project reference portable when restoring its linked character.
 for(const c of characters){if(c.dance88?.projectId===original.id){
   const oldTrackId=c.dance88.audioReactive30?.sourceTrackId;
   const index=oldTrackIds.indexOf(oldTrackId);
   if(oldTrackId&&(index<0||!project.tracks[index]?.id))
    throw Error('실제 PCM 기반 춤의 드럼 WAV 트랙이 복원된 프로젝트에 없습니다.');
   c.dance88={...c.dance88,projectId:project.id,
    ...(oldTrackId?{audioReactive30:{...c.dance88.audioReactive30,
      sourceTrackId:project.tracks[index].id}}:{})};
  }if(c.performance89?.projectId===original.id){const idMap=Object.fromEntries(oldTrackIds.map((id,i)=>[id,project.tracks[i]?.id]));c.performance89={...c.performance89,projectId:project.id,instruments:(c.performance89.instruments||[]).map(e=>({...e,trackId:idMap[e.trackId]||e.trackId}))};}}
 await putFilesAtomic(pendingAssets);
 return {project,voices,characters,voiceModels,trainingPlans,virtualSingers,hasAudio:Object.keys(assets).length>0,portable:!!input.format};
}
