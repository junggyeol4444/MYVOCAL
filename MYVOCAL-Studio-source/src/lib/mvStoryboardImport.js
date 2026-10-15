// Step72 — local, metadata-only storyboard import with all-or-nothing validation.
// Never reads, writes, uploads, resolves or replaces source media assets.
import {auditMvStoryboard, MV_STORYBOARD_FORMAT, MV_SCENE_LIMIT} from './mvStoryboard.js';

export const MV_STORYBOARD_IMPORT_MAX_BYTES = 512 * 1024;
const PACKAGE_KEYS = ['format','version','kind','projectId','bpm','scenes','summary','capabilities'];
const SCENE_KEYS = ['id','start','end','title','description','characterId','location','outfit','expression','action','camera','lighting'];
const SUMMARY_KEYS = ['sceneCount','durationSec','gapSeconds','warnings'];
const CAPABILITY_KEYS = ['renderedVideo','aiVideoGeneration','automaticLipSync'];
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const record = obj => !!obj && typeof obj === 'object' && !Array.isArray(obj);
const exactKeys = (obj, keys) => record(obj) && Object.keys(obj).length === keys.length && Object.keys(obj).every(k=>keys.includes(k)) && keys.every(k=>own(obj,k));
const safeId = value => typeof value === 'string' && value.trim() && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
const roundMs = value => Math.round(value*1000)/1000;

export function inspectMvStoryboardImport(project, source, characters=[]) {
 if(!record(project) || !safeId(project.id) || !Array.isArray(project.scenes)) throw Error('현재 프로젝트의 장면 정보를 확인할 수 없습니다.');
 if(!Array.isArray(characters)) throw Error('캐릭터 목록이 올바르지 않습니다.');
 if(typeof source !== 'string') throw Error('스토리보드는 JSON 텍스트로 가져와야 합니다.');
 if(new TextEncoder().encode(source).byteLength > MV_STORYBOARD_IMPORT_MAX_BYTES) throw Error('스토리보드 파일은 512 KiB 이하여야 합니다.');
 let parsed;
 try {parsed=JSON.parse(source);} catch {throw Error('JSON 형식이 손상됐습니다.');}
 if(!exactKeys(parsed, PACKAGE_KEYS)) throw Error('지원하지 않는 스토리보드 필드나 누락된 항목이 있습니다.');
 if(parsed.format!==MV_STORYBOARD_FORMAT || parsed.version!==1 || parsed.kind!=='manual-storyboard-metadata-only') throw Error('지원하지 않는 스토리보드 형식 또는 버전입니다.');
 if(!safeId(parsed.projectId) || parsed.projectId!==project.id) throw Error('다른 프로젝트의 스토리보드는 가져올 수 없습니다.');
 if(parsed.bpm!==null && (typeof parsed.bpm!=='number' || !Number.isFinite(parsed.bpm) || parsed.bpm<=0 || parsed.bpm>400)) throw Error('스토리보드 BPM이 올바르지 않습니다.');
 if(parsed.bpm!==null && Number.isFinite(project.bpm) && parsed.bpm!==project.bpm) throw Error('프로젝트 BPM이 달라 장면 위치를 확인해야 합니다.');
 if(!exactKeys(parsed.capabilities, CAPABILITY_KEYS) || CAPABILITY_KEYS.some(k=>parsed.capabilities[k]!==false)) throw Error('이 파일은 영상 생성·립싱크 결과물로 인증할 수 없습니다.');
 if(!Array.isArray(parsed.scenes) || !parsed.scenes.length || parsed.scenes.length>MV_SCENE_LIMIT) throw Error(`장면은 1~${MV_SCENE_LIMIT}개여야 합니다.`);
 if(!exactKeys(parsed.summary,SUMMARY_KEYS) || !SUMMARY_KEYS.every(k=>Number.isFinite(parsed.summary[k])&&parsed.summary[k]>=0) || !Number.isInteger(parsed.summary.sceneCount) || !Number.isInteger(parsed.summary.warnings)) throw Error('스토리보드 요약 형식이 올바르지 않습니다.');
 for(const s of parsed.scenes) {
  if(!exactKeys(s,SCENE_KEYS)) throw Error('장면에 허용되지 않은 필드 또는 누락된 필드가 있습니다.');
  if(!safeId(s.id)) throw Error('장면 ID가 올바르지 않습니다.');
 }
 const known = new Set(characters.filter(c=>record(c) && typeof c.id==='string').map(c=>c.id));
 for(const s of parsed.scenes) if(s.characterId && !known.has(s.characterId)) throw Error(`존재하지 않는 캐릭터가 연결됐습니다: ${s.id}`);
 // Strict, complete preflight: no overlap, duplicated IDs, invalid times/text, or embedded media.
 const audit = auditMvStoryboard({scenes:parsed.scenes}, characters);
 if(audit.errors) throw Error(`스토리보드 장면 검증 오류 ${audit.errors}개: ${audit.issues.filter(i=>i.severity==='error').map(i=>i.code).join(', ')}`);
 if(parsed.summary.sceneCount!==parsed.scenes.length || parsed.summary.durationSec!==audit.durationSec || parsed.summary.gapSeconds!==audit.gapSeconds) throw Error('파일의 장면 요약값이 실제 장면과 일치하지 않습니다.');
 // Create fresh, known-field objects. Metadata is not merged with asset collections.
 const scenes=parsed.scenes.map(s=>Object.fromEntries(SCENE_KEYS.map(k=>[k,s[k]])));
 return {projectId:parsed.projectId,sourceBpm:parsed.bpm,currentSceneCount:project.scenes.length,
  importedSceneCount:scenes.length,durationSec:audit.durationSec,gapSeconds:audit.gapSeconds,warnings:audit.warnings,
  scenes,issues:audit.issues.filter(i=>i.severity==='warning')};
}

export function restoreMvStoryboard(project, source, characters=[]) {
 const review=inspectMvStoryboardImport(project,source,characters);
 // Only update scenes. All original tracks, media references, characters and projects stay intact.
 return {...project,scenes:review.scenes};
}
