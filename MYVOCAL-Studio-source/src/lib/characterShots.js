// Step64: user-authored local MV shot plan. Metadata only; no image/video rendering or face matching.
import {reviewCharacterLook} from './characterLooks.js';

export const SHOT_LIMIT=48;
export const CAMERA_CHOICES=Object.freeze(['wide','medium','close-up','profile','overhead','tracking','other']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const readText=(value,max=250)=>{
 if(typeof value!=='string')throw Error('컷 텍스트 형식이 잘못되었습니다.');
 const result=value.trim();
 if(result.length>max||/[\u0000-\u001f\u007f]/.test(result))throw Error(`컷 텍스트는 ${max}자 이내이며 제어 문자를 포함할 수 없습니다.`);
 return result;
};
const timeValue=(value)=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3600||Math.abs(Math.round(value*1000)-value*1000)>1e-7)throw Error('컷 시간은 0~3600초 사이의 밀리초 단위여야 합니다.');
 return value;
};
function requireCharacter(character){
 if(!plain(character)||typeof character.id!=='string'||!character.id.trim())throw Error('캐릭터가 필요합니다.');
 if(!Array.isArray(character.looks||[])||!Array.isArray(character.shots||[]))throw Error('캐릭터 컷 목록이 잘못되었습니다.');
 if((character.shots||[]).length>SHOT_LIMIT)throw Error('컷은 최대 48개입니다.');
}
function buildShot(character,draft,old=null){
 if(!plain(draft))throw Error('컷 입력 형식이 잘못되었습니다.');
 const allowed=['id','title','lookId','startSec','endSec','camera','direction','createdAt','updatedAt','version'];
 if(Object.keys(draft).some(key=>!allowed.includes(key)))throw Error('정의되지 않은 컷 속성입니다.');
 const id=readText(draft.id||'',120),title=readText(draft.title||'',120);
 if(!id||!title)throw Error('컷 ID와 제목을 입력하세요.');
 const lookId=readText(draft.lookId||'',120);
 if(!lookId||(character.looks||[]).every(look=>look.id!==lookId))throw Error('현재 캐릭터에 등록된 룩을 선택하세요.');
 const startSec=timeValue(draft.startSec),endSec=timeValue(draft.endSec);
 if(endSec<=startSec)throw Error('컷 종료 시간은 시작 시간보다 커야 합니다.');
 const camera=readText(draft.camera||'',50);
 if(!CAMERA_CHOICES.includes(camera))throw Error('허용되지 않은 카메라 구도입니다.');
 return {id,title,lookId,startSec,endSec,camera,direction:readText(draft.direction||'',800),version:1,
  createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
function validateAgainstPlan(shots,shot,skipId=null){
 if(shots.some(existing=>existing.id!==skipId&&existing.id===shot.id))throw Error('컷 ID가 중복됩니다.');
 if(shots.some(existing=>existing.id!==skipId&&existing.title?.trim().toLocaleLowerCase()===shot.title.toLocaleLowerCase()))throw Error('컷 제목이 중복됩니다.');
 if(shots.some(existing=>existing.id!==skipId&&shot.startSec<existing.endSec&&existing.startSec<shot.endSec))throw Error('같은 캐릭터의 컷 시간이 겹칩니다.');
}
export function addCharacterShot(character,draft){
 requireCharacter(character);
 const shots=character.shots||[];
 if(shots.length>=SHOT_LIMIT)throw Error('컷은 최대 48개입니다.');
 const shot=buildShot(character,draft);
 validateAgainstPlan(shots,shot);
 return {...character,shots:[...shots,shot].sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}
export function updateCharacterShot(character,shotId,changes){
 requireCharacter(character);
 const id=readText(shotId,120),shots=character.shots||[],old=shots.find(shot=>shot.id===id);
 if(!old)throw Error('컷을 찾을 수 없습니다.');
 if(!plain(changes)||Object.keys(changes).some(k=>!['title','lookId','startSec','endSec','camera','direction'].includes(k)))throw Error('수정 가능한 컷 항목만 입력하세요.');
 const shot=buildShot(character,{...old,...changes},old);
 validateAgainstPlan(shots,shot,id);
 return {...character,shots:shots.map(item=>item.id===id?shot:item).sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}
export function deleteCharacterShot(character,shotId){
 requireCharacter(character);
 const id=readText(shotId,120),shots=character.shots||[];
 if(!shots.some(shot=>shot.id===id))throw Error('컷을 찾을 수 없습니다.');
 return {...character,shots:shots.filter(shot=>shot.id!==id),updatedAt:new Date().toISOString()};
}
export function reviewCharacterShot(character,shot){
 requireCharacter(character);
 const look=(character.looks||[]).find(item=>item.id===shot?.lookId);
 if(!look)return {reviewRequired:true,missingLook:true,identityDrift:false,missingReference:false};
 const review=reviewCharacterLook(character,look);
 return {reviewRequired:review.reviewRequired,missingLook:false,identityDrift:review.changedFields.length>0,missingReference:review.missingReference};
}
export function summarizeCharacterShots(character){
 requireCharacter(character);
 const shots=character.shots||[];
 return {total:shots.length,durationSeconds:shots.reduce((sum,shot)=>sum+(shot.endSec-shot.startSec),0),
  reviewRequired:shots.filter(shot=>reviewCharacterShot(character,shot).reviewRequired).length,
  automatedFaceMatching:false,renderedVideo:false};
}
export function exportCharacterShotPlan(character){
 requireCharacter(character);
 return {format:'myvocal-character-shot-plan',version:1,characterId:character.id,characterName:character.name||'',
  exportedAt:new Date().toISOString(),shots:(character.shots||[]).map(shot=>({...shot})),summary:summarizeCharacterShots(character),
  note:'수동 컷 계획 메타데이터만 포함합니다. 캐릭터 이미지·음원·영상 파일은 포함하지 않습니다.'};
}


// Step65: strict, atomic restore of metadata-only shot plans.
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&!Number.isNaN(Date.parse(value));
export const SHOT_IMPORT_MAX_BYTES=512*1024;
export function importCharacterShotPlan(character,json){
 requireCharacter(character);
 if(typeof json!=='string'||!json.length||new TextEncoder().encode(json).length>SHOT_IMPORT_MAX_BYTES)throw Error('컷 계획 JSON은 최대 512KB여야 합니다.');
 let pack;
 try{pack=JSON.parse(json);}catch{throw Error('컷 계획 JSON을 읽을 수 없습니다.');}
 if(!plain(pack)||pack.format!=='myvocal-character-shot-plan'||pack.version!==1)throw Error('지원하지 않는 컷 계획 형식 또는 버전입니다.');
 const allowed=['format','version','characterId','characterName','exportedAt','shots','summary','note'];
 if(Object.keys(pack).some(k=>!allowed.includes(k)))throw Error('컷 계획 JSON에 허용되지 않은 속성이 있습니다.');
 if(pack.characterId!==character.id)throw Error('다른 캐릭터의 컷 계획은 가져올 수 없습니다.');
 if(typeof pack.characterName!=='string'||!isoDate(pack.exportedAt)||typeof pack.note!=='string'||pack.note.length>500)throw Error('컷 계획 내보내기 정보가 잘못되었습니다.');
 if(!plain(pack.summary)||Object.keys(pack.summary).some(k=>!['total','durationSeconds','reviewRequired','automatedFaceMatching','renderedVideo'].includes(k))||!Number.isFinite(pack.summary.total)||!Number.isFinite(pack.summary.durationSeconds)||!Number.isFinite(pack.summary.reviewRequired)||pack.summary.automatedFaceMatching!==false||pack.summary.renderedVideo!==false)throw Error('컷 계획 요약 형식이 잘못되었습니다.');
 if(!Array.isArray(pack.shots)||pack.shots.length+(character.shots||[]).length>SHOT_LIMIT)throw Error('컷 계획은 최대 48개입니다.');
 const originals=character.shots||[], pending=[];
 for(const raw of pack.shots){
  if(!plain(raw)||raw.version!==1||!isoDate(raw.createdAt)||!isoDate(raw.updatedAt))throw Error('컷 기록 시간 또는 버전이 잘못되었습니다.');
  const normalized=buildShot(character,raw);
  validateAgainstPlan([...originals,...pending],normalized);
  pending.push({...normalized,createdAt:raw.createdAt,updatedAt:raw.updatedAt});
 }
 // Nothing is written until every incoming item passes all validations.
 return {...character,shots:[...originals,...pending].sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}

// Step65: timeline geometry is derived from existing plans; never modifies media.
export function getCharacterShotTimeline(character){
 requireCharacter(character);
 const shots=[...(character.shots||[])].sort((a,b)=>a.startSec-b.startSec);
 const endSec=shots.length?Math.max(...shots.map(shot=>shot.endSec)):0;
 const segments=shots.map(shot=>({id:shot.id,title:shot.title,lookId:shot.lookId,startSec:shot.startSec,endSec:shot.endSec,
  leftPercent:endSec?100*shot.startSec/endSec:0,widthPercent:endSec?100*(shot.endSec-shot.startSec)/endSec:0,
  reviewRequired:reviewCharacterShot(character,shot).reviewRequired}));
 let cursor=0;
 const gaps=[];
 for(const shot of shots){if(shot.startSec>cursor)gaps.push({startSec:cursor,endSec:shot.startSec});cursor=Math.max(cursor,shot.endSec);}
 return {endSec,segments,gaps,automatedVideo:false};
}
