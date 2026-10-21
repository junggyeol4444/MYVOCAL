// Portable per-project media integrity. No upload, model inference, or data mutation.
// SHA-256 fields are optional on legacy v2 project backups for compatibility.
const HEX64=/^[a-f0-9]{64}$/i;
export async function mediaSha256Hex(bytes){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
export function assertPortableAssetReferences(referencedIds,assets){
 if(!Array.isArray(referencedIds)||!assets||typeof assets!=='object'||Array.isArray(assets))
  throw Error('백업 원본 파일 참조 형식이 올바르지 않습니다.');
 const missing=referencedIds.filter(id=>typeof id!=='string'||!id||!Object.hasOwn(assets,id));
 if(missing.length)throw Error('백업에 필요한 오디오·모델·영상 원본 '+missing.length+'개가 누락됐습니다. 원본 보존을 위해 복원을 중단했습니다.');
 return referencedIds.length;
}
export async function verifyBackupMedia(meta,bytes){
 if(!meta||typeof meta!=='object'||!(bytes instanceof Uint8Array))throw Error('백업 미디어 검증 입력이 잘못됐습니다.');
 if(meta.bytes!==undefined&&(!Number.isSafeInteger(meta.bytes)||meta.bytes<0||meta.bytes!==bytes.byteLength))
  throw Error('백업 미디어 원본 크기가 기록과 다릅니다.');
 if(meta.sha256!==undefined){
  if(typeof meta.sha256!=='string'||!HEX64.test(meta.sha256))throw Error('백업 SHA-256 형식이 잘못됐습니다.');
  if((await mediaSha256Hex(bytes))!==meta.sha256.toLowerCase())throw Error('백업 미디어 원본 SHA-256이 일치하지 않습니다. 데이터 손상이 의심되어 복원을 중단했습니다.');
 }
 return true;
}
