// Step62: locally authored character look presets. No AI vision or identity recognition.
export const LOOK_LIMIT=24;
export const LOOK_FIELDS=['outfit','expression','pose','scene','accessories','notes'];
export const IDENTITY_FIELDS=['hair','eyes','body','palette'];
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const text=(v,n=250)=>{if(typeof v!=='string')throw Error('룩 프리셋 문자열 형식이 잘못되었습니다.');const x=v.trim();if(x.length>n)throw Error(`룩 프리셋 입력은 ${n}자를 넘을 수 없습니다.`);if(/[\u0000-\u001f\u007f]/.test(x))throw Error('룩 프리셋에 제어 문자를 넣을 수 없습니다.');return x;};
export function identityBasis(profile){
 if(!object(profile?.appearance))return Object.fromEntries(IDENTITY_FIELDS.map(k=>[k,'']));
 return Object.fromEntries(IDENTITY_FIELDS.map(k=>[k,text(profile.appearance[k]||'',250)]));
}
function requireProfile(profile){
 if(!object(profile)||typeof profile.id!=='string'||!profile.id.trim())throw Error('캐릭터 프로필이 필요합니다.');
 if(!Array.isArray(profile.assets||[]))throw Error('캐릭터 자료 목록이 잘못되었습니다.');
 if(!Array.isArray(profile.looks||[]))throw Error('기존 룩 목록이 잘못되었습니다.');
 if((profile.looks||[]).length>LOOK_LIMIT)throw Error('룩 프리셋은 최대 24개입니다.');
}
function normalizeLook(profile,raw,existing=null){
 if(!object(raw))throw Error('룩 프리셋 형식이 잘못되었습니다.');
 const validKeys=['id','name',...LOOK_FIELDS,'referenceAssetId','identityBasis','createdAt','reviewedAt','version'];
 if(Object.keys(raw).some(k=>!validKeys.includes(k)))throw Error('정의되지 않은 룩 프리셋 속성입니다.');
 const id=text(raw.id||'',120),name=text(raw.name||'',120);
 if(!id||!name)throw Error('룩 ID와 이름을 입력하세요.');
 const vals=Object.fromEntries(LOOK_FIELDS.map(k=>[k,text(raw[k]||'',k==='notes'?800:250)]));
 const referenceAssetId=text(raw.referenceAssetId||'',120);
 if(referenceAssetId){
  const file=(profile.assets||[]).find(a=>a.id===referenceAssetId);
  if(!file&&!existing)throw Error('캐릭터에 등록되지 않은 참고 자료 ID입니다.');
  if(file&&!(/\.(png|jpe?g|webp|gif|bmp|avif|vrm|glb|gltf)$/i).test(file.name||''))throw Error('룩 참고 자료는 이미지 또는 3D 모델이어야 합니다.');
 }
 const basis=existing?.identityBasis||identityBasis(profile);
 if(!object(basis)||Object.keys(basis).some(k=>!IDENTITY_FIELDS.includes(k)))throw Error('고정 외형 기준이 잘못되었습니다.');
 const normalizedBasis=Object.fromEntries(IDENTITY_FIELDS.map(k=>[k,text(basis[k]||'',250)]));
 return {id,name,...vals,referenceAssetId,identityBasis:normalizedBasis,version:1,
  createdAt:existing?.createdAt||new Date().toISOString(),reviewedAt:existing?.reviewedAt||new Date().toISOString()};
}
export function reviewCharacterLook(profile,look){
 requireProfile(profile);
 if(!object(look)||!object(look.identityBasis))return {reviewRequired:true,changedFields:[...IDENTITY_FIELDS],missingReference:true};
 const basis=identityBasis(profile),changedFields=IDENTITY_FIELDS.filter(k=>basis[k]!==look.identityBasis[k]);
 const missingReference=!!look.referenceAssetId&&!(profile.assets||[]).some(a=>a.id===look.referenceAssetId);
 return {reviewRequired:changedFields.length>0||missingReference,changedFields,missingReference};
}
export function addCharacterLook(profile,draft){
 requireProfile(profile);
 const looks=profile.looks||[];
 if(looks.length>=LOOK_LIMIT)throw Error('룩 프리셋은 최대 24개입니다.');
 const look=normalizeLook(profile,draft);
 if(looks.some(item=>item.id===look.id))throw Error('룩 ID가 중복됩니다.');
 if(looks.some(item=>item.name?.trim().toLocaleLowerCase()===look.name.toLocaleLowerCase()))throw Error('룩 이름이 중복됩니다.');
 return {...profile,looks:[...looks,look],updatedAt:new Date().toISOString()};
}
export function approveCharacterLook(profile,lookId){
 requireProfile(profile);const id=text(lookId,120);let found=false;
 const looks=(profile.looks||[]).map(look=>{
  if(look.id!==id)return look;
  found=true;const normalized=normalizeLook(profile,look,look);
  return {...normalized,identityBasis:identityBasis(profile),reviewedAt:new Date().toISOString()};
 });
 if(!found)throw Error('룩 프리셋을 찾지 못했습니다.');
 return {...profile,looks,updatedAt:new Date().toISOString()};
}
export function deleteCharacterLook(profile,lookId){
 requireProfile(profile);const id=text(lookId,120),looks=profile.looks||[];
 if(!looks.some(look=>look.id===id))throw Error('룩 프리셋을 찾지 못했습니다.');
 // No files are deleted: references to the same asset may exist elsewhere.
 return {...profile,looks:looks.filter(look=>look.id!==id),updatedAt:new Date().toISOString()};
}
export function summarizeCharacterLooks(profile){
 requireProfile(profile);const looks=profile.looks||[];
 return {total:looks.length,reviewRequired:looks.filter(look=>reviewCharacterLook(profile,look).reviewRequired).length,
  references:looks.filter(look=>!!look.referenceAssetId).length,automatedFaceMatching:false};
}

// Step63: edit and restore the metadata-only look sheet without touching asset bytes.
export function updateCharacterLook(profile, lookId, changes){
 requireProfile(profile);
 const id=text(lookId,120);
 if(!object(changes)||Object.keys(changes).some(k=>!['name',...LOOK_FIELDS,'referenceAssetId'].includes(k)))throw Error('수정 가능한 룩 필드만 입력하세요.');
 const looks=profile.looks||[],old=looks.find(item=>item.id===id);
 if(!old)throw Error('룩 프리셋을 찾지 못했습니다.');
 if(own(changes,'referenceAssetId')&&changes.referenceAssetId!==old.referenceAssetId&&changes.referenceAssetId&&!(profile.assets||[]).some(a=>a.id===changes.referenceAssetId))throw Error('캐릭터에 등록되지 않은 참고 자료 ID입니다.');
 const edited=normalizeLook(profile,{...old,...changes},old);
 if(looks.some(item=>item.id!==id&&item.name?.trim().toLocaleLowerCase()===edited.name.toLocaleLowerCase()))throw Error('룩 이름이 중복됩니다.');
 return {...profile,looks:looks.map(item=>item.id===id?edited:item),updatedAt:new Date().toISOString()};
}
export function exportCharacterLookPack(profile){
 requireProfile(profile);
 return {format:'myvocal-character-looks',version:1,characterId:profile.id,characterName:profile.name,
  exportedAt:new Date().toISOString(),appearance:profile.appearance||{},looks:profile.looks||[],reviewSummary:summarizeCharacterLooks(profile),
  note:'메타데이터만 포함하며 원본 이미지·영상·3D 모델 파일은 포함하지 않습니다.'};
}
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&!Number.isNaN(Date.parse(value));
export function importCharacterLookPack(profile,json){
 requireProfile(profile);
 if(typeof json!=='string'||!json.length||json.length>512*1024)throw Error('룩 JSON은 최대 512KB의 문자열이어야 합니다.');
 let pack;try{pack=JSON.parse(json);}catch{throw Error('룩 JSON을 파싱할 수 없습니다.');}
 if(!object(pack)||pack.format!=='myvocal-character-looks'||pack.version!==1)throw Error('지원하지 않는 룩 JSON 형식 또는 버전입니다.');
 const allowed=['format','version','characterId','characterName','exportedAt','appearance','looks','reviewSummary','note'];
 if(Object.keys(pack).some(k=>!allowed.includes(k)))throw Error('룩 JSON에 정의되지 않은 속성이 있습니다.');
 if(pack.characterId!==profile.id)throw Error('다른 캐릭터의 룩 JSON은 가져올 수 없습니다.');
 if(!Array.isArray(pack.looks)||pack.looks.length>LOOK_LIMIT)throw Error('룩 JSON 목록이 잘못되었습니다.');
 const existing=profile.looks||[];
 if(existing.length+pack.looks.length>LOOK_LIMIT)throw Error('룩 프리셋은 최대 24개입니다.');
 const ids=new Set(existing.map(l=>l.id)),names=new Set(existing.map(l=>l.name?.trim().toLocaleLowerCase()));
 const imported=[];
 for(const raw of pack.looks){
  if(!object(raw)||raw.version!==1||!isoDate(raw.createdAt)||!isoDate(raw.reviewedAt))throw Error('룩 버전 또는 기록 시간이 잘못되었습니다.');
  const ref=raw.referenceAssetId||'';
  if(ref&&!(profile.assets||[]).some(a=>a.id===ref))throw Error('연결된 참고 자료가 없습니다. 먼저 원본 자료를 등록하세요.');
  const look=normalizeLook(profile,raw,raw); // Keep the original identity snapshot to surface drift.
  if(ids.has(look.id)||names.has(look.name.toLocaleLowerCase()))throw Error('가져올 룩의 ID 또는 이름이 중복됩니다.');
  ids.add(look.id);names.add(look.name.toLocaleLowerCase());imported.push(look);
 }
 // Atomic: no project, asset, or existing look is mutated on failed import.
 return {...profile,looks:[...existing,...imported],updatedAt:new Date().toISOString()};
}
