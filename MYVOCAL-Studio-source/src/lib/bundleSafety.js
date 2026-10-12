// Import limits are checked before any IndexedDB writes.
export const MAX_BUNDLE_BYTES = 220 * 1024 * 1024;
export const MAX_ASSETS = 500;
export const MAX_TOTAL_MEDIA_BYTES = 150 * 1024 * 1024;
export function validateBundleEnvelope(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('프로젝트 백업 형식이 잘못되었습니다.');
 if (Object.hasOwn(input, 'format') && input.format !== 'MYVOCAL_PROJECT_BACKUP') throw new Error('알 수 없는 프로젝트 백업 형식입니다.');
 if (input.format === 'MYVOCAL_PROJECT_BACKUP' && input.formatVersion !== 2) throw new Error('지원하지 않는 프로젝트 백업 버전입니다.');
 if (input.format === 'MYVOCAL_PROJECT_BACKUP' && input.formatVersion === 2) {
  const assets = input.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('백업 원본 파일 목록이 잘못되었습니다.');
  const entries = Object.entries(assets);
  if (entries.length > MAX_ASSETS) throw new Error('백업 원본 파일 수가 제한을 초과했습니다.');
  let totalDecodedBytes = 0;
  for (const [id, meta] of entries) {
   if (!id || ['__proto__','prototype','constructor'].includes(id) || !meta || typeof meta !== 'object' || typeof meta.dataUrl !== 'string' || !meta.dataUrl.startsWith('data:') || !meta.dataUrl.includes(';base64,')) throw new Error('백업 원본 파일 데이터가 잘못되었습니다.');
   if (meta.dataUrl.length > 130 * 1024 * 1024) throw new Error('백업 원본 파일 크기가 제한을 초과했습니다.');
   const payload = meta.dataUrl.slice(meta.dataUrl.indexOf(';base64,') + 8);
   // Reject malformed encodings before trusting the decoded-byte estimate.
   // Padding is only valid at the end of a complete four-character group.
   const padCount = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
   if (!payload || payload.length % 4 !== 0 || (padCount && payload.length < 4)) {
    throw new Error('백업 원본 파일 Base64 형식이 잘못되었습니다.');
   }
   // Small fixed-size chunks avoid regex recursion/stack exhaustion on huge media.
   const unpaddedLength = payload.length - padCount;
   for (let offset = 0; offset < unpaddedLength; offset += 16384) {
    if (!/^[A-Za-z0-9+/]+$/.test(payload.slice(offset, Math.min(offset + 16384, unpaddedLength)))) {
     throw new Error('백업 원본 파일 Base64 형식이 잘못되었습니다.');
    }
   }
   const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
   const estimatedBytes = payload.length / 4 * 3 - padding;
   totalDecodedBytes += estimatedBytes;
   if (totalDecodedBytes > MAX_TOTAL_MEDIA_BYTES) throw new Error('백업 원본 파일 합계가 150MB를 초과했습니다.');
  }
 }
 return input;
}
