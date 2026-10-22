// 기존 MYVOCAL 프로젝트에 추가 저장된 완성 Music+MV WAV/WebM/MP4 읽기.
// 로컬 IndexedDB 원본은 읽기 전용이며 이름·종류를 임의 변경하지 않는다.
import {PRODUCTION_OUTPUT_TYPES} from './productionOutputPersist.js';
export async function readSavedProductionOutput(project,entry,{load}={}){
 if(!project?.id||!Array.isArray(project.deliverables)||
    !entry||!project.deliverables.some(item=>item.assetId===entry.assetId&&
     item.kind===entry.kind&&item.createdAt===entry.createdAt))
  throw Error('현재 프로젝트에 등록된 완성 산출물이 아닙니다.');
 if(typeof load!=='function'||typeof entry.assetId!=='string'||
    !/^delivery_[A-Za-z0-9_-]{1,90}$/.test(entry.assetId)||
    !Object.hasOwn(PRODUCTION_OUTPUT_TYPES,entry.kind)||
    entry.mime!==PRODUCTION_OUTPUT_TYPES[entry.kind]||
    !Number.isSafeInteger(entry.size)||entry.size<44)
  throw Error('완성 산출물 원본 정보가 올바르지 않습니다.');
 const file=await load(entry.assetId);
 if(!(file instanceof Blob)||file.size!==entry.size||file.type!==entry.mime)
  throw Error('완성 WAV/영상 원본이 누락되었거나 변경되었습니다. 기존 파일은 보존됩니다.');
 const safe=String(entry.name||'');
 if(/[\\/:*?"<>|\u0000-\u001f]/.test(safe)||!safe||safe.length>200||!safe.endsWith('.'+entry.kind))
  throw Error('완성 산출물 파일명이 올바르지 않습니다.');
 return {file,name:safe,kind:entry.kind};
}
