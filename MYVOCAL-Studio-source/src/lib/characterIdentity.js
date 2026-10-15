// Step61: offline character reference sheet metadata. No face recognition or AI synthesis.
export const characterKinds=['character','person','3d'];
export const characterRights=['owned','self','licensed'];
export const characterAssetRoles=['portrait','front','side','back','full-body','expression','outfit','motion-reference','model','other'];
export const characterAppearanceFields=['hair','eyes','outfit','palette','accessories','body','personality'];
export const MAX_CHARACTER_FILE_BYTES=40*1024*1024;
export const MAX_CHARACTER_ASSETS=64;
const text=(v,max=160)=>{if(typeof v!=='string')throw new Error('텍스트 자료 형식이 잘못되었습니다.'); const s=v.trim();if(s.length>max)throw new Error(`텍스트는 ${max}자를 넘을 수 없습니다.`);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw new Error('제어 문자는 허용하지 않습니다.');return s;};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const allowed=(value,choices,label)=>{if(!choices.includes(value))throw new Error(`${label} 값이 허용되지 않습니다.`);return value;};
export function inferCharacterAssetKind(file){
 const name=typeof file?.name==='string'?file.name.toLowerCase():'';
 const type=typeof file?.type==='string'?file.type.toLowerCase():'';
 if(/\.(vrm|glb|gltf)$/.test(name))return 'model';
 if(type.startsWith('image/')&&/\.(png|jpe?g|webp|gif|bmp|avif)$/.test(name))return 'image';
 if(type.startsWith('video/')&&/\.(mp4|webm|mov|m4v)$/.test(name))return 'video';
 return 'unknown';
}
export function validateCharacterFile(file){
 if(!file||typeof file.name!=='string'||!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_CHARACTER_FILE_BYTES)throw new Error('자료는 1바이트~40MB 파일이어야 합니다.');
 if(!text(file.name,220)||/[\\/]/.test(file.name))throw new Error('파일 이름에 경로를 넣을 수 없습니다.');
 const kind=inferCharacterAssetKind(file);
 if(kind==='unknown')throw new Error('지원하지 않는 이미지·영상·3D 모델 파일입니다.');
 return kind;
}
export function validateCharacterAssetRole(role,kind){
 allowed(role,characterAssetRoles,'자료 역할');
 if(kind==='model'&&role!=='model'&&role!=='other')throw new Error('3D 모델 자료에는 모델 또는 기타 역할만 선택할 수 있습니다.');
 if(kind==='video'&&!['motion-reference','other'].includes(role))throw new Error('영상 자료에는 동작 참고 또는 기타 역할만 선택할 수 있습니다.');
 if(kind==='image'&&['model','motion-reference'].includes(role))throw new Error('이미지 자료에 모델·영상 전용 역할을 지정할 수 없습니다.');
 return role;
}
export function normalizeCharacterIdentity(input,existing=null){
 if(!plain(input))throw new Error('캐릭터 프로필이 올바르지 않습니다.');
 const id=text(input.id||'',120);
 if(!id)throw new Error('캐릭터 ID가 필요합니다.');
 if(existing&&existing.id!==id)throw new Error('기존 프로필 ID를 변경할 수 없습니다.');
 const name=text(input.name||'',120);
 if(!name)throw new Error('캐릭터 이름을 입력하세요.');
 const kind=allowed(input.kind,characterKinds,'캐릭터 유형');
 const rights=allowed(input.rights,characterRights,'사용 권한');
 const rightsNote=text(input.rightsNote||'',500);
 if(rights==='licensed'&&!rightsNote)throw new Error('사용 허가 출처와 범위를 작성하세요.');
 const description=text(input.description||'',1500);
 const rawAppearance=input.appearance||{};
 if(!plain(rawAppearance))throw new Error('외형 설정은 객체여야 합니다.');
 if(Object.keys(rawAppearance).some(k=>!characterAppearanceFields.includes(k)))throw new Error('정의되지 않은 외형 속성입니다.');
 const appearance=Object.fromEntries(characterAppearanceFields.map(k=>[k,text(rawAppearance[k]||'',250)]));
 const assets=input.assets||[];
 if(!Array.isArray(assets)||assets.length>MAX_CHARACTER_ASSETS)throw new Error('자료는 최대 64개까지 보관할 수 있습니다.');
 const ids=new Set();
 const normalizedAssets=assets.map(a=>{
  if(!plain(a))throw new Error('첨부 자료 형식이 잘못되었습니다.');
  const aid=text(a.id||'',120),aname=text(a.name||'',220);
  if(!aid||!aname||ids.has(aid))throw new Error('첨부 자료 ID 또는 이름이 중복되거나 비어 있습니다.');
  ids.add(aid);
  const type=text(a.type||'',120);
  const kind=inferCharacterAssetKind({name:aname,type});
  // Existing legacy assets may have formats not supported by newly uploaded files;
  // do not destroy data when editing old profiles.
  const role=a.role||'other';
  if(kind==='unknown'){
   if(role!=='other')throw new Error('알 수 없는 기존 자료는 기타 역할만 허용합니다.');
  }else validateCharacterAssetRole(role,kind);
  if(a.size!==undefined&&(!Number.isSafeInteger(a.size)||a.size<0||a.size>MAX_CHARACTER_FILE_BYTES))throw new Error('첨부 자료 크기가 잘못되었습니다.');
  return {...a,id:aid,name:aname,type,role,...(a.size===undefined?{}:{size:a.size})};
 });
 if(existing){
  const originalIds=new Set((existing.assets||[]).map(a=>a.id));
  if([...originalIds].some(aid=>!ids.has(aid)))throw new Error('편집 중 기존 자료를 임의로 삭제할 수 없습니다.');
 }
 return {...(existing||{}),...input,id,name,kind,rights,rightsNote,description,appearance,assets:normalizedAssets,
  identityLock:input.identityLock!==false, identityProfileVersion:1,
  createdAt:existing?.createdAt||input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function getCharacterReferenceSummary(profile){
 const assets=Array.isArray(profile?.assets)?profile.assets:[];
 const roles=Object.fromEntries(characterAssetRoles.map(role=>[role,assets.filter(a=>(a.role||'other')===role).length]));
 const appearance=plain(profile?.appearance)?profile.appearance:{};
 return {total:assets.length,roles,described:characterAppearanceFields.filter(field=>typeof appearance[field]==='string'&&appearance[field].trim()).length,
  canTrain:profile?.rights==='owned'||profile?.rights==='self'||(profile?.rights==='licensed'&&!!profile?.rightsNote?.trim()),
  automatedIdentityLock:false};
}
