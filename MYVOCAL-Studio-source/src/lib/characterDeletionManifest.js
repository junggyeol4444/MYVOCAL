// 기존 캐릭터 삭제 전 원문 복구본을 사용자가 찾을 수 있도록 식별 메타데이터를 보관합니다.
// 복구본과 IndexedDB 원본 미디어는 자동으로 삭제하거나 덮어쓰지 않습니다.
import {backupCharacterRemovalState} from './characterDeletionRecovery.js';
import {inspectCharacterDeletionBackup,restoreCharacterProfileFromBackup,assertCharacterIdentityIntegrity} from './characterDeletionRestore.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const manifestSuffix = '-manifest';
function validStorage(storage) {
 if(!storage || typeof storage.getItem!=='function' || typeof storage.setItem!=='function')
  throw Error('복구 목록 저장소에 접근할 수 없습니다.');
}
function parseManifest(storage, storageKey, manifestKey) {
 const prefix = `${storageKey}-character-delete-backup-`;
 if(typeof manifestKey!=='string' || !manifestKey.startsWith(prefix) || !manifestKey.endsWith(manifestSuffix))
  throw Error('캐릭터 복구 목록 키가 올바르지 않습니다.');
 const backupKey=manifestKey.slice(0,-manifestSuffix.length);
 if(!/^\d+(?:-\d+)?$/.test(backupKey.slice(prefix.length)))throw Error('복구본 번호가 올바르지 않습니다.');
 let raw,info;
 try {raw=storage.getItem(manifestKey);info=JSON.parse(raw);}catch{throw Error('복구 목록 메타데이터가 손상되었습니다.');}
 if(!object(info)||info.version!==1||info.backupKey!==backupKey||
    typeof info.characterId!=='string'||!info.characterId||
    typeof info.characterName!=='string'||typeof info.createdAt!=='number'||
    !Number.isSafeInteger(info.createdAt)||info.createdAt<0)
  throw Error('복구 목록 메타데이터 형식이 올바르지 않습니다.');
 const timestamp=Number(backupKey.slice(prefix.length).split('-')[0]);
 if(info.createdAt!==timestamp)throw Error('복구 목록 생성 시각이 원본 키와 일치하지 않습니다.');
 const snapshot=inspectCharacterDeletionBackup(storage,storageKey,backupKey,info.characterId);
 if(snapshot.characterName!==info.characterName)throw Error('복구 목록의 캐릭터 이름이 원본과 일치하지 않습니다.');
 return {manifestKey,backupKey,characterId:info.characterId,characterName:info.characterName,
  originalIndex:snapshot.originalIndex,createdAt:info.createdAt,manifestRaw:raw};
}

// 삭제 전에 원문 백업과 식별용 메타데이터를 모두 저장하고 재읽기 검증합니다.
// 어느 단계에서든 실패하면 삭제 호출자는 진행하지 않아야 합니다.
export function backupCharacterRemovalWithManifest(storage,storageKey,characterId,stamp=Date.now()) {
 validStorage(storage);
 // 백업 준비 도중 다른 창이 작업 공간을 바꾸면 삭제를 진행하지 않습니다.
 const beforeRaw=storage.getItem(storageKey);
 // 대상 외 캐릭터가 손상된 상태에서도 삭제 복구본을 만들지 않습니다.
 let beforeData;
 try {beforeData=JSON.parse(beforeRaw);}catch{throw Error('삭제 전 작업 공간 원문이 손상되었습니다.');}
 if(!object(beforeData)||!Array.isArray(beforeData.characters))throw Error('삭제 전 캐릭터 목록이 손상되었습니다.');
 assertCharacterIdentityIntegrity(beforeData.characters);
 const backupKey=backupCharacterRemovalState(storage,storageKey,characterId,stamp,['-manifest']);
 const backedUpRaw=storage.getItem(backupKey);
 if(typeof beforeRaw!=='string'||backedUpRaw!==beforeRaw)
  throw Error('복구본 원문이 변경되어 캐릭터 삭제를 중단했습니다.');
 const manifestKey=backupKey+manifestSuffix;
 const snapshot=inspectCharacterDeletionBackup(storage,storageKey,backupKey,characterId);
 const createdAt=Number(backupKey.slice(`${storageKey}-character-delete-backup-`.length).split('-')[0]);
 const manifestRaw=JSON.stringify({version:1,backupKey,characterId,characterName:snapshot.characterName,createdAt});
 try {
  if(storage.getItem(manifestKey)!==null)throw Error('이미 사용 중인 복구 목록 키입니다.');
  storage.setItem(manifestKey,manifestRaw);
  if(storage.getItem(manifestKey)!==manifestRaw)throw Error('복구 목록 재읽기 값이 다릅니다.');
  if(storage.getItem(backupKey)!==backedUpRaw)throw Error('삭제 전 원문 복구본이 변경되었습니다.');
  if(storage.getItem(storageKey)!==beforeRaw)throw Error('백업 중 작업 공간이 변경되었습니다.');
 }catch(error){throw Error('복구 목록을 안전하게 저장하지 못해 삭제를 중단했습니다: '+error.message);}
 return {backupKey,manifestKey,characterId};
}

// 삭제된 캐릭터만 표시합니다. 손상된 항목은 건너뛰지만 변경·삭제하지 않습니다.
export function listRestorableDeletedCharacters(storage,storageKey){
 validStorage(storage);
 if(typeof storageKey!=='string'||!storageKey||!Number.isSafeInteger(storage.length)||typeof storage.key!=='function')
  throw Error('복구 목록을 읽을 수 없습니다.');
 let current,currentRaw;
 try {currentRaw=storage.getItem(storageKey);current=JSON.parse(currentRaw);}catch{throw Error('현재 작업 공간이 손상되어 복구 목록을 확인할 수 없습니다.');}
 if(!object(current)||!Array.isArray(current.characters))throw Error('현재 캐릭터 목록을 확인할 수 없습니다.');
 assertCharacterIdentityIntegrity(current.characters);
 const initialLength=storage.length;
 const keys=[];
 for(let i=0;i<initialLength;i++){
  let key;
  try{key=storage.key(i);}catch{throw Error('복구 목록 조회에 실패했습니다.');}
  if(typeof key==='string'&&key.endsWith(manifestSuffix)&&key.startsWith(`${storageKey}-character-delete-backup-`))keys.push(key);
 }
 // 조회 도중 항목이 수정되거나 새 키가 생기면 불완전한 결과를 반환하지 않습니다.
 const snapshots=keys.map(key=>({key,manifestRaw:storage.getItem(key),
  backupKey:key.slice(0,-manifestSuffix.length),
  backupRaw:storage.getItem(key.slice(0,-manifestSuffix.length))}));
 const results=[];
 for(const key of keys){
  try{
   const item=parseManifest(storage,storageKey,key);
   if(!current.characters.some(c=>object(c)&&c.id===item.characterId))results.push(item);
  }catch{/* 손상된 항목은 사용자 데이터 보존을 위해 수정하지 않습니다. */}
 }
 // 조회 중 저장소가 변경되면 오래된 목록을 정상 목록처럼 표시하지 않습니다.
 for(const snapshot of snapshots){
  if(storage.getItem(snapshot.key)!==snapshot.manifestRaw || storage.getItem(snapshot.backupKey)!==snapshot.backupRaw)
   throw Error('복구 목록 조회 중 원본 복구본 또는 목록이 변경되어 중단했습니다.');
 }
 if(storage.length!==initialLength)throw Error('복구 목록 조회 중 저장소 키 개수가 변경되어 중단했습니다.');
 const finalKeys=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);
  if(typeof key==='string'&&key.endsWith(manifestSuffix)&&key.startsWith(`${storageKey}-character-delete-backup-`))finalKeys.push(key);
 }
 if(finalKeys.length!==keys.length || finalKeys.some(key=>!keys.includes(key)))
  throw Error('복구 목록 조회 중 복구 목록 키가 변경되어 중단했습니다.');
 if(storage.getItem(storageKey)!==currentRaw)throw Error('복구 목록 조회 중 작업 공간이 변경되어 중단했습니다.');
 return results.sort((a,b)=>b.createdAt-a.createdAt||a.manifestKey.localeCompare(b.manifestKey));
}

// 사용자가 복구본을 명시적으로 선택했을 때만 프로필을 복원합니다.
export function restoreDeletedCharacterFromManifest(storage,storageKey,manifestKey,expectedCurrentRaw,stamp=Date.now()){
 validStorage(storage);
 const item=parseManifest(storage,storageKey,manifestKey);
 if(typeof expectedCurrentRaw!=='string'||!expectedCurrentRaw)throw Error('복구 전 확인한 작업 공간 원문이 필요합니다.');
 if(storage.getItem(manifestKey)!==item.manifestRaw)throw Error('선택한 복구 목록이 변경됐습니다.');
 const verifyManifest=()=>{
  if(storage.getItem(manifestKey)!==item.manifestRaw)
   throw Error('복원 직전 복구 목록이 변경되어 복원을 중단했습니다.');
 };
 const result=restoreCharacterProfileFromBackup(storage,storageKey,item.backupKey,item.characterId,expectedCurrentRaw,stamp,verifyManifest,verifyManifest);
 return {...result,manifestKey,characterName:item.characterName};
}