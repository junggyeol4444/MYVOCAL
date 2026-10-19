// 캐릭터 삭제 전 작업 공간 메타데이터의 원본 문자열을 별도 키에 보존합니다.
// IndexedDB 원본 미디어는 읽거나 삭제하지 않습니다.
export function backupCharacterRemovalState(storage, storageKey, characterId, stamp = Date.now(), reservedSuffixes = []) {
 if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')
  throw Error('캐릭터 삭제 복구본을 저장할 저장소가 없습니다.');
 if (typeof storageKey !== 'string' || !storageKey || typeof characterId !== 'string' || !characterId)
  throw Error('캐릭터 삭제 복구본의 키가 올바르지 않습니다.');
 if (!Array.isArray(reservedSuffixes) || reservedSuffixes.some(suffix => typeof suffix !== 'string' || !suffix.startsWith('-')))
  throw Error('복구본과 함께 보존할 목록 키 설정이 올바르지 않습니다.');
 let original;
 try { original = storage.getItem(storageKey); }
 catch { throw Error('기존 작업 공간을 읽지 못해 캐릭터 삭제를 중단했습니다.'); }
 if (typeof original !== 'string' || !original)
  throw Error('기존 작업 공간 원문이 없어 캐릭터 삭제를 중단했습니다.');
 try {
  const parsed = JSON.parse(original);
  if (!parsed || !Array.isArray(parsed.characters) ||
      parsed.characters.filter(character => character?.id === characterId).length !== 1)
   throw Error('복구할 캐릭터를 저장된 작업 공간에서 확인할 수 없습니다.');
 } catch (error) {
  throw Error('기존 작업 공간의 복구본을 검증하지 못했습니다: ' + error.message);
 }
 const normalizedStamp = Number.isSafeInteger(stamp) && stamp >= 0 ? stamp : Date.now();
 const prefix = `${storageKey}-character-delete-backup-${normalizedStamp}`;
 let backupKey = null;
 for (let attempt = 0; attempt < 1000; attempt++) {
  const candidate = attempt ? `${prefix}-${attempt}` : prefix;
  let existing;
  try { existing = storage.getItem(candidate); }
  catch { throw Error('복구본 저장소 확인에 실패해 삭제를 중단했습니다.'); }
  if (existing === null) {
   let available = true;
   for (const suffix of reservedSuffixes) {
    try { if (storage.getItem(candidate + suffix) !== null) available = false; }
    catch { throw Error('연결된 복구 목록 키를 확인하지 못해 삭제를 중단했습니다.'); }
   }
   if (available) { backupKey = candidate; break; }
  }
 }
 if (!backupKey) throw Error('사용 가능한 복구본 키가 없어 삭제를 중단했습니다.');
 try {
  storage.setItem(backupKey, original);
  if (storage.getItem(backupKey) !== original)
   throw Error('복구본을 다시 읽었을 때 원문이 일치하지 않습니다.');
 } catch (error) {
  throw Error('복구본 저장·검증에 실패해 삭제를 중단했습니다: ' + error.message);
 }
 return backupKey;
}