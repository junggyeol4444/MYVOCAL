// Strict, bounded base64 validation before allocating decoded media bytes.
export function validateMediaDataUrl(value, maxBase64Length=130*1024*1024){
 if(typeof value!=='string')throw new Error('파일 데이터 형식이 잘못되었습니다.');
 const match=/^data:([a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*);base64,/.exec(value);
 if(!match)throw new Error('유효하지 않은 미디어 데이터 URL입니다.');
 const payload=value.slice(match[0].length);
 if(payload.length>maxBase64Length)throw new Error('복원 파일이 너무 큽니다.');
 if(payload.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload))throw new Error('손상된 Base64 미디어 데이터입니다.');
 return {mime:match[1],payload};
}

// Backup metadata must not silently contradict the bytes' declared media type.
export function validateMediaMetadata(meta, dataMime){
 if(!meta || typeof meta!=='object' || typeof dataMime!=='string')throw new Error('미디어 메타데이터가 잘못되었습니다.');
 if(meta.type !== undefined && (typeof meta.type!=='string' || meta.type.toLowerCase()!==dataMime.toLowerCase()))throw new Error('백업 미디어 MIME 형식이 일치하지 않습니다.');
 if(meta.name !== undefined && (typeof meta.name!=='string' || !meta.name || meta.name.length>255 || /[\\/\x00-\x1f]/.test(meta.name)))throw new Error('백업 미디어 파일 이름이 잘못되었습니다.');
 return true;
}
