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

function linkedProfiles(project,data){
 const voice=(data.voices||[]).filter(v=>v.id===project.voiceId);
 const charIds=new Set([project.characterId,...(project.scenes||[]).map(s=>s.characterId)].filter(Boolean));
 const characters=(data.characters||[]).filter(c=>charIds.has(c.id));
 return {voices:voice,characters};
}
function assetsOf(project,profiles){
 const ids=new Set();for(const t of project.tracks||[])for(const clip of t.clips||[])if(clip.assetId)ids.add(clip.assetId);
 for(const group of ['voices','characters'])for(const p of profiles[group]){for(const key of ['assetId','referenceId','videoAssetId'])if(p[key])ids.add(p[key]);for(const a of p.assets||[])if(a.id)ids.add(a.id);}
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
  const result={...x};if(result.assets)result.assets=result.assets.map(a=>({...a,id:assetMap[a.id]||a.id}));for(const name of ['assetId','referenceId','videoAssetId'])if(result[name])result[name]=assetMap[result[name]]||result[name];return result;
 };
 const makeProfile=(group,p)=>{const newid=genId(group==='voices'?'voice':'chr');mapping[p.id]=newid;return {...patchAssets(p),id:newid,name:p.name+' (복원)',createdAt:now()};};
 const voices=(profiles.voices||[]).map(p=>makeProfile('voices',p)),characters=(profiles.characters||[]).map(p=>makeProfile('characters',p));
 const original=project;
 const oldTrackIds=original.tracks.map(t=>t.id);
 const wasAligned=!!original.vocalAlignment&&!isAlignmentStale(original,original.vocalAlignment);
 const hadValidPhonemes=wasAligned&&!!original.phonemePlan&&!isPhonemePlanStale(original.vocalAlignment,original.phonemePlan);
 project={...project,id:genId('prj'),title:project.title+' (복원)',createdAt:now(),updatedAt:now(),voiceId:mapping[project.voiceId]||project.voiceId||'',characterId:mapping[project.characterId]||project.characterId||'',tracks:project.tracks.map(t=>({...t,id:genId('trk'),clips:(t.clips||[]).map(c=>({...c,id:genId('clip'),assetId:assetMap[c.assetId]||c.assetId}))})),scenes:(project.scenes||[]).map(s=>({...s,id:genId('scn'),characterId:mapping[s.characterId]||s.characterId||''}))};
 if(wasAligned){
  const index=oldTrackIds.indexOf(original.vocalAlignment.trackId);
  if(index>=0){const migrated={...original.vocalAlignment,projectId:project.id,trackId:project.tracks[index].id};
   migrated.sourceKey=alignmentSource(project,migrated.trackId).sourceKey;project.vocalAlignment=migrated;
   if(hadValidPhonemes)project.phonemePlan={...original.phonemePlan,projectId:project.id,trackId:migrated.trackId,sourceKey:phonemeSourceKey(migrated)};}
 }
 await putFilesAtomic(pendingAssets);
 return {project,voices,characters,hasAudio:Object.keys(assets).length>0,portable:!!input.format};
}
