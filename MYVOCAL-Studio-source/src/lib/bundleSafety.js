// Import limits are checked before any IndexedDB writes.
export const MAX_BUNDLE_BYTES = 220 * 1024 * 1024;
export const MAX_ASSETS = 500;
export function validateBundleEnvelope(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('프로젝트 백업 형식이 잘못되었습니다.');
 if (Object.hasOwn(input, 'format') && input.format !== 'MYVOCAL_PROJECT_BACKUP') throw new Error('알 수 없는 프로젝트 백업 형식입니다.');
 if (input.format === 'MYVOCAL_PROJECT_BACKUP' && input.formatVersion !== 2) throw new Error('지원하지 않는 프로젝트 백업 버전입니다.');
 if (input.format === 'MYVOCAL_PROJECT_BACKUP' && input.formatVersion === 2) {
  const assets = input.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('백업 원본 파일 목록이 잘못되었습니다.');
  const entries = Object.entries(assets);
  if (entries.length > MAX_ASSETS) throw new Error('백업 원본 파일 수가 제한을 초과했습니다.');
  for (const [id, meta] of entries) {
   if (!id || ['__proto__','prototype','constructor'].includes(id) || !meta || typeof meta !== 'object' || typeof meta.dataUrl !== 'string' || !meta.dataUrl.startsWith('data:') || !meta.dataUrl.includes(';base64,')) throw new Error('백업 원본 파일 데이터가 잘못되었습니다.');
   if (meta.dataUrl.length > 130 * 1024 * 1024) throw new Error('백업 원본 파일 크기가 제한을 초과했습니다.');
  }
 }
 return input;
}
