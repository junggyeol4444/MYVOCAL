// Step70: deterministic, privacy-minimized character-production handoff manifest.
// A SHA-256 checksum detects accidental or deliberate modification, NOT authenticity.
// Never include original photos, videos, audio, 3D bytes, lyrics or direction notes.
import {auditCharacterProduction} from './characterProductionAudit.js';

export const CHARACTER_HANDOFF_FORMAT='myvocal-character-production-handoff';
export const CHARACTER_HANDOFF_MAX_BYTES=512*1024;
const keys=(value,allowed)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).length===allowed.length&&allowed.every(k=>Object.hasOwn(value,k));
const encoder=new TextEncoder();
const HANDOFF_NOTE='캐릭터/컷/보컬 큐 수동 계획의 최소 메타데이터입니다. 원본 미디어와 가사·연출 원문은 포함하지 않습니다. 통과는 영상·가창 제작 완료를 의미하지 않습니다.';
async function hash(value){
 if(!globalThis.crypto?.subtle?.digest)throw Error('로컬 WebCrypto SHA-256 기능이 필요합니다.');
 const bytes=encoder.encode(value);
 return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function buildCharacterHandoffPayload(characters){
 const audit=auditCharacterProduction(characters);
 const characterIds=characters.map(c=>c.id).sort();
 const shots=audit.shotRows.map(s=>({characterId:s.characterId,shotId:s.shotId,startSec:s.startSec,endSec:s.endSec,cueCount:s.cueCount}));
 const issues=audit.issues.map(i=>({level:i.level,code:i.code,characterId:i.characterId,shotId:i.shotId,cueId:i.cueId}));
 // A clean but empty plan is not 'ready' for handoff.
 return {scope:'manually-authored-metadata-only',characterIds,shots,issues,
  summary:{characters:audit.characters,shots:audit.shots,cues:audit.cues,duetCuePairs:audit.duetCuePairs,errors:audit.errors,warnings:audit.warnings,information:audit.information,
   reviewPassed:audit.errors===0&&audit.warnings===0&&audit.characters>0&&audit.shots>0},
  capabilities:{autoFaceMatching:false,autoLipSync:false,generatedSinging:false,renderedVideo:false}};
}
export async function createCharacterHandoff(characters){
 const payload=buildCharacterHandoffPayload(characters);
 const sha256=await hash(JSON.stringify(payload));
 const result={format:CHARACTER_HANDOFF_FORMAT,version:1,integrity:'SHA-256 checksum (not proof of source authenticity)',payload,sha256,note:HANDOFF_NOTE};
 if(encoder.encode(JSON.stringify(result)).length>CHARACTER_HANDOFF_MAX_BYTES)throw Error('검증 패키지가 최대 512KB를 초과했습니다.');
 return result;
}
export async function verifyCharacterHandoff(raw,characters){
 if(typeof raw!=='string'||encoder.encode(raw).length>CHARACTER_HANDOFF_MAX_BYTES)throw Error('JSON 형식 또는 크기가 올바르지 않습니다 (최대 512KB).');
 let parsed;
 try{parsed=JSON.parse(raw);}catch{throw Error('손상된 JSON 파일입니다.');}
 if(!keys(parsed,['format','version','integrity','payload','sha256','note'])||parsed.format!==CHARACTER_HANDOFF_FORMAT||parsed.version!==1||
  parsed.integrity!=='SHA-256 checksum (not proof of source authenticity)'||parsed.note!==HANDOFF_NOTE||
  typeof parsed.sha256!=='string'||!/^[a-f0-9]{64}$/.test(parsed.sha256))throw Error('Step70 패키지의 형식·버전·필드가 올바르지 않습니다.');
 const expected=buildCharacterHandoffPayload(characters);
 // Equality against the canonical, locally rederived payload also rejects unknown
 // nested properties and attempts to smuggle original media into this manifest.
 if(JSON.stringify(parsed.payload)!==JSON.stringify(expected)){
  const ownHash=await hash(JSON.stringify(parsed.payload));
  if(ownHash!==parsed.sha256)throw Error('SHA-256 무결성 검사 실패: 파일이 변경되었습니다.');
  throw Error('현재 캐릭터·룩·컷·보컬 큐 계획과 패키지 내용이 다릅니다.');
 }
 if(await hash(JSON.stringify(parsed.payload))!==parsed.sha256)throw Error('SHA-256 무결성 검사 실패: 파일이 변경되었습니다.');
 return {verified:true,matchingCurrentPlan:true,reviewPassed:expected.summary.reviewPassed,
  summary:expected.summary,warning:'SHA-256은 무결성 검사이며 작성자·권한의 진위나 실제 AI/영상 제작을 증명하지 않습니다.'};
}
