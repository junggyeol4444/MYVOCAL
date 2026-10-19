// File fingerprints are computed locally; no audio or model bytes leave the PC.
export async function sha256Bytes(bytes){
 if(!globalThis.crypto?.subtle?.digest)throw Error('이 환경에서 SHA-256을 계산할 수 없습니다.');
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
