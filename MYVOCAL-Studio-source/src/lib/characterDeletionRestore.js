// 삭제 전 보존한 메타데이터에서 캐릭터 프로필만 선택적으로 복구합니다.
// 프로젝트·음원·사진·모델·IndexedDB 원본은 변경하지 않습니다.
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function readText(storage, key, label) {
 try {
  const value = storage.getItem(key);
  if (typeof value !== 'string' || !value) throw Error('내용이 없습니다.');
  return value;
 } catch (error) { throw Error(`${label}을 읽을 수 없습니다: ${error.message}`); }
}
export function assertCharacterIdentityIntegrity(characters) {
 if(!Array.isArray(characters))throw Error('캐릭터 목록 형식이 올바르지 않습니다.');
 const ids=new Set();
 for(const character of characters){
  if(!object(character)||typeof character.id!=='string'||!character.id.trim())
   throw Error('캐릭터 ID가 없거나 캐릭터 데이터가 손상되었습니다.');
  if(ids.has(character.id))throw Error('캐릭터 ID가 중복되어 유일하게 확인할 수 없습니다.');
  ids.add(character.id);
 }
}
function parseWorkspace(raw, label) {
 let data;
 try { data = JSON.parse(raw); }
 catch { throw Error(`${label}의 JSON이 손상되었습니다.`); }
 if (!object(data) || !Array.isArray(data.characters) || !Array.isArray(data.projects) || !Array.isArray(data.voices))
  throw Error(`${label}의 작업 공간 구조가 올바르지 않습니다.`);
 assertCharacterIdentityIntegrity(data.characters);
 return data;
}
function validBackupKey(storageKey, backupKey) {
 return typeof backupKey === 'string' &&
  backupKey.startsWith(`${storageKey}-character-delete-backup-`) &&
  /^\d+(?:-\d+)?$/.test(backupKey.slice(`${storageKey}-character-delete-backup-`.length));
}
function inspect(storage, storageKey, backupKey, characterId) {
 if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')
  throw Error('캐릭터 복구 저장소에 접근할 수 없습니다.');
 if (typeof storageKey !== 'string' || !storageKey || typeof characterId !== 'string' || !characterId ||
     !validBackupKey(storageKey, backupKey)) throw Error('캐릭터 복구본의 식별자가 올바르지 않습니다.');
 const raw = readText(storage, backupKey, '삭제 전 복구본');
 const data = parseWorkspace(raw, '삭제 전 복구본');
 const matches = data.characters.filter(c => object(c) && c.id === characterId);
 if (matches.length !== 1) throw Error('삭제 전 복구본에서 캐릭터 ID를 유일하게 확인하지 못했습니다.');
 return {raw, data, character: matches[0], originalIndex: data.characters.indexOf(matches[0])};
}

export function inspectCharacterDeletionBackup(storage, storageKey, backupKey, characterId) {
 const {character, originalIndex} = inspect(storage, storageKey, backupKey, characterId);
 return {backupKey, characterId, characterName: character.name || '', originalIndex};
}

// 목록 조회는 읽기 전용입니다. 손상된 복구본은 삭제하지 않고 목록에서 제외합니다.
export function listCharacterDeletionBackups(storage, storageKey, characterId) {
 if (!storage || typeof storage.key !== 'function' || !Number.isSafeInteger(storage.length) || storage.length < 0)
  throw Error('복구본 목록을 조회할 수 없는 저장소입니다.');
 const result = [];
 const keys = [];
 for (let i = 0; i < storage.length; i++) {
  let key;
  try { key = storage.key(i); }
  catch { throw Error('복구본 목록 조회가 중단되었습니다.'); }
  if (validBackupKey(storageKey, key)) keys.push(key);
 }
 for (const key of keys) {
  try { result.push(inspectCharacterDeletionBackup(storage, storageKey, key, characterId)); }
  catch { /* 손상된 원문을 임의로 수정하거나 삭제하지 않습니다. */ }
 }
 return result.sort((a,b) => a.backupKey.localeCompare(b.backupKey));
}

// 화면에서 사용자가 명시적으로 선택한 복구본만 사용해야 합니다.
// expectedCurrentRaw가 다르면 다른 창의 변경을 덮어쓰지 않고 중단합니다.
export function restoreCharacterProfileFromBackup(storage, storageKey, backupKey, characterId, expectedCurrentRaw, stamp = Date.now(), preCommitCheck, finalPreCommitCheck) {
 if(preCommitCheck!==undefined&&typeof preCommitCheck!=='function')
  throw Error('복원 직전 검사 처리기가 올바르지 않습니다.');
 if(finalPreCommitCheck!==undefined&&typeof finalPreCommitCheck!=='function')
  throw Error('복원 최종 검사 처리기가 올바르지 않습니다.');
 const snapshot = inspect(storage, storageKey, backupKey, characterId);
 if (typeof expectedCurrentRaw !== 'string' || !expectedCurrentRaw)
  throw Error('복구 전 현재 작업 공간 원문을 확인해야 합니다.');
 const currentRaw = readText(storage, storageKey, '현재 작업 공간');
 if (currentRaw !== expectedCurrentRaw) throw Error('다른 창에서 작업 공간이 변경되어 복구를 중단했습니다.');
 const current = parseWorkspace(currentRaw, '현재 작업 공간');
 if (current.characters.some(c => object(c) && c.id === characterId))
  throw Error('현재 작업 공간에 동일한 캐릭터 ID가 있어 복구를 중단했습니다.');
 const next = {...current, characters: [...current.characters]};
 next.characters.splice(Math.min(snapshot.originalIndex, next.characters.length), 0, snapshot.character);
 const nextRaw = JSON.stringify(next);
 const timestamp = Number.isSafeInteger(stamp) && stamp >= 0 ? stamp : Date.now();
 const prefix = `${storageKey}-character-restore-before-${timestamp}`;
 let beforeRestoreKey = null;
 for (let i = 0; i < 1000; i++) {
  const key = i ? `${prefix}-${i}` : prefix;
  let existing;
  try { existing = storage.getItem(key); }
  catch { throw Error('복구 직전 작업 공간 보존 키를 확인하지 못했습니다.'); }
  if (existing === null) { beforeRestoreKey = key; break; }
 }
 if (!beforeRestoreKey) throw Error('복구 직전 작업 공간을 보존할 키가 없습니다.');
 try {
  storage.setItem(beforeRestoreKey, currentRaw);
  if (storage.getItem(beforeRestoreKey) !== currentRaw) throw Error('복구 직전 원문 재읽기가 일치하지 않습니다.');
 } catch (error) { throw Error('복구 직전 작업 공간을 보존하지 못해 복구를 중단했습니다: ' + error.message); }
 // 복구본과 현재 데이터가 백업 생성 중 변경됐는지 마지막으로 확인합니다.
 if (readText(storage, backupKey, '삭제 전 복구본') !== snapshot.raw ||
     readText(storage, storageKey, '현재 작업 공간') !== currentRaw)
  throw Error('복구 중 원본 데이터가 변경되어 복구를 중단했습니다.');
 if(preCommitCheck)preCommitCheck();
 // 외부 검사 콜백에서도 다른 창/테스트 후크가 저장소를 바꿀 수 있으므로 다시 검사합니다.
 if (readText(storage, backupKey, '삭제 전 복구본') !== snapshot.raw ||
     readText(storage, storageKey, '현재 작업 공간') !== currentRaw)
  throw Error('복원 직전 원본 데이터가 변경되어 복구를 중단했습니다.');
 // 목록 검사 이후 마지막 원문 재읽기에서 발생한 변경도 쓰기 직전 확인합니다.
 if(finalPreCommitCheck)finalPreCommitCheck();
 try {
  storage.setItem(storageKey, nextRaw);
  if (storage.getItem(storageKey) !== nextRaw) throw Error('복구 후 재읽기가 일치하지 않습니다.');
 } catch (error) {
  throw Error(`캐릭터 복구 결과를 확인하지 못했습니다. 이전 작업 공간 보존 키: ${beforeRestoreKey}. ${error.message}`);
 }
 return {data:next, characterId, backupKey, beforeRestoreKey};
}