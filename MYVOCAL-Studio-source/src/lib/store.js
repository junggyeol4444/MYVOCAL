import { initialData, now } from './schema.js';

export const STORAGE_KEY = 'myvocal-studio-v01';
const RECOVERY_PREFIX = STORAGE_KEY + '-corrupt-backup-';
function clone(v) {return JSON.parse(JSON.stringify(v));}

// Never treat a malformed or unreadable saved project as a new empty project.
// The caller must explicitly choose recovery before any write can occur.
export function readDataState(storage) {
  let raw;
  try { storage = storage === undefined ? globalThis.localStorage : storage; raw = storage.getItem(STORAGE_KEY); }
  catch (error) { return {status:'unavailable', data:clone(initialData), error:String(error)}; }
  if (raw === null) return {status:'empty', data:clone(initialData)};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      !Array.isArray(parsed.projects) || !Array.isArray(parsed.voices) ||
      !Array.isArray(parsed.characters)) {
      throw new Error('프로젝트 데이터의 필수 구조가 올바르지 않습니다.');
    }
    return {status:'ok', data:{...clone(initialData),...parsed}};
  } catch (error) {
    return {status:'corrupt', data:clone(initialData), raw, error:String(error)};
  }
}

export function loadData() {return readDataState().data;}
export function saveData(data, storage) {
  try {
    const state = readDataState(storage);
    if (state.status === 'corrupt' || state.status === 'unavailable') return false;
    (storage === undefined ? globalThis.localStorage : storage).setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) { console.warn('MYVOCAL 저장 실패:',err); return false; }
}

// Recovery is opt-in. Preserve byte-for-byte original data in a separate key BEFORE resetting.
// If backup creation fails, the corrupted main key remains untouched.
export function resetCorruptData(storage, when = new Date()) {
  const state = readDataState(storage);
  if (state.status !== 'corrupt') throw new Error('복구 대상인 손상 데이터가 없습니다.');
  storage = storage === undefined ? globalThis.localStorage : storage;
  const timestamp = when.toISOString().replace(/[.:]/g,'-');
  let backupKey = RECOVERY_PREFIX + timestamp;
  for (let i = 1; storage.getItem(backupKey) !== null; i++) backupKey = RECOVERY_PREFIX + timestamp + '-' + i;
  storage.setItem(backupKey, state.raw); // Must succeed before touching the original key.
  storage.setItem(STORAGE_KEY, JSON.stringify(clone(initialData)));
  return {backupKey, data:clone(initialData)};
}

export function updateEntity(data,group,item) {return {...data,[group]:[item,...data[group].filter(x=>x.id!==item.id)]};}
export function deleteEntity(data,group,id) {return {...data,[group]:data[group].filter(x=>x.id!==id)};}
export function projectUpdate(data,project) {return updateEntity(data,'projects',{...project,updatedAt:now()});}
export function exportJson(data,filename='myvocal-backup.json') {const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function downloadText(text,filename,mime='text/plain') {const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
