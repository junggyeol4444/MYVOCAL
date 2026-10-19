// 캐릭터 삭제 시 프로젝트 참조 및 로컬 저장 실패로 인한 원본 손실을 막습니다.
// 프로필만 영구 저장에서 제거하고 IndexedDB 원본은 절대로 삭제하지 않습니다.
import {characterDependents} from './voiceDeletionSafety.js';

export function commitCharacterProfileRemoval(data, characterId, persist, readCurrent, backupBeforeCommit){
 if(!data || !Array.isArray(data.characters) || typeof persist!=='function' || typeof readCurrent!=='function')
  throw Error('캐릭터 삭제를 위한 저장 상태를 확인할 수 없습니다.');
 if(typeof characterId!=='string'||!characterId)throw Error('캐릭터 ID가 없습니다.');
 const matching=data.characters.filter(c=>c && c.id===characterId);
 if(matching.length!==1)throw Error('캐릭터를 찾을 수 없거나 ID가 중복됩니다.');
 const character=matching[0];
 const dependents=characterDependents(data,character);
 if(dependents.length)throw Error('연결된 프로젝트가 있어 캐릭터를 삭제할 수 없습니다: '+dependents.join(', '));
 // 저장소의 최신 상태와 화면 상태가 다르면 다른 창의 변경을 덮어쓰지 않습니다.
 const before=readCurrent();
 if(!before || before.status!=='ok' || JSON.stringify(before.data)!==JSON.stringify(data))
  throw Error('저장된 작업 공간이 화면과 다릅니다. 백업 후 다시 열어 확인하세요.');
 let backupKey=null,manifestKey=null;
 if(backupBeforeCommit!==undefined){
  if(typeof backupBeforeCommit!=='function')throw Error('캐릭터 삭제 복구본 처리기가 올바르지 않습니다.');
  const backup=backupBeforeCommit();
  if(typeof backup==='string')backupKey=backup;
  else if(backup && typeof backup==='object' && typeof backup.backupKey==='string' &&
          typeof backup.manifestKey==='string' && backup.manifestKey===backup.backupKey+'-manifest'){
   backupKey=backup.backupKey;manifestKey=backup.manifestKey;
  }
  if(typeof backupKey!=='string'||!backupKey)throw Error('캐릭터 삭제 복구본을 확인하지 못했습니다.');
  // 복구본 저장 중 다른 창에서 변경됐다면 기존 데이터를 덮어쓰지 않습니다.
  const current=readCurrent();
  if(!current || current.status!=='ok' || JSON.stringify(current.data)!==JSON.stringify(data))
   throw Error('복구본 저장 중 작업 공간이 변경되어 삭제를 중단했습니다.');
 }
 const next={...data,characters:data.characters.filter(c=>c?.id!==characterId)};
 // 영구 저장이 실패하면 화면의 캐릭터도 제거하지 않습니다.
 // persist가 저장한 직후 실패를 반환/예외를 던질 수도 있으므로 '삭제하지 않았다'고 단정하지 않습니다.
 let writeResult;
 try {writeResult=persist(next);}
 catch(error){throw Error(`프로필 저장에 실패했습니다. 삭제 결과 확인 필요 · 복구 키: ${backupKey||'없음'} · ${error.message}`);}
 if(writeResult!==true)throw Error(`프로필 저장에 실패했거나 결과를 확인하지 못했습니다. 삭제 결과 확인 필요 · 복구 키: ${backupKey||'없음'}`);
 let after;
 try {after=readCurrent();}catch(error){throw Error(`저장 결과를 확인하지 못했습니다. 삭제 결과 확인 필요 · 복구 키: ${backupKey||'없음'} · ${error.message}`);}
 if(!after || after.status!=='ok' || JSON.stringify(after.data)!==JSON.stringify(next))
  throw Error(`저장 결과를 확인하지 못했습니다. 삭제 결과 확인 필요 · 복구 키: ${backupKey||'없음'}. 원본 미디어는 삭제하지 않았습니다.`);
 return {data:next,backupKey,manifestKey,preservedFileIds:[...new Set((Array.isArray(character.assets)?character.assets:[]).map(a=>a?.id).filter(Boolean))]};
}