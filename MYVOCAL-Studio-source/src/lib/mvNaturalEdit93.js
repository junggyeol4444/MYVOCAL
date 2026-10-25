// STEP93: local, auditable command grammar. No remote LLM or pretend semantic parser.
export const STEP93_FIELDS=Object.freeze({배경:'location',장소:'location',의상:'outfit',옷:'outfit',카메라:'camera',표정:'expression',감정:'expression',동작:'action',행동:'action',조명:'lighting'});
const VALID=new Set(Object.values(STEP93_FIELDS));
const locked=(project,field)=>(field==='outfit'&&project.outfitLock===true)||(field==='location'&&project.backgroundLock===true)||(field==='camera'&&project.cameraLock===true);
const clean=s=>typeof s==='string'&&s.length<=500&&!/[\u0000-\u001f\u007f]/.test(s);
// 원본 51항의 문장 예시를 기존 명시적 STEP93 속성 문법으로 연결한다.
// 확신할 수 없는 자유 문장은 추측하지 않고 기존 검토 절차에서 거부한다.
export function normalizeNaturalMvPhrase93(phrase,{scene=null}={}){
 const t=String(phrase||'').trim().replace(/[.!]$/u,'');
 const preserve=t.match(/^(?:주인공|인물)(?:의)?\s*얼굴(?:은|을)?\s*그대로\s*두고\s*(?:옷|의상)(?:만|을|를)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?$/u);
 if(preserve){
  if(!scene?.personMv&&!scene?.characterMv)throw Error('얼굴을 유지하려면 이 장면에 사용 허가된 인물 원본 또는 캐릭터 원화를 먼저 연결하세요.');
  return '의상을 '+preserve[1].trim()+'으로 바꿔';
 }
 const clothes=t.match(/^(?:옷|의상)만\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?$/u);
 if(clothes)return '의상을 '+clothes[1].trim()+'으로 바꿔';
 const place=t.match(/^(?:이|현재|선택한?)\s*장면만\s*(비\s*오는\s*밤(?:거리)?|밤거리|낮거리|눈\s*오는\s*밤(?:거리)?)\s*(?:으로|로)\s*(?:바꿔|변경해)(?:줘|주세요)?$/u);
 if(place)return '배경을 '+place[1].trim()+'으로 바꿔';
 const camera=t.match(/^(?:여기서는|이\s*부분에서는?|이\s*장면에서는?)\s*카메라가\s*(캐릭터\s*주변을\s*돌|인물\s*주변을\s*돌)게\s*(?:해|해주세요)$/u);
 if(camera)return '카메라를 '+camera[1].trim()+'며 회전하는 촬영으로 바꿔';
 if(/^(?:이\s*부분에서|여기서는|이\s*장면에서)\s*(?:주인공|캐릭터)이\s*울지\s*말고\s*웃게\s*(?:해|해주세요)$/u.test(t))
  return '표정을 웃는 표정으로 바꿔';
 return phrase;
}
export function interpretMvInstruction93(project,sceneId,command){
 if(!project?.id||!Array.isArray(project.scenes))throw Error('프로젝트 장면 정보가 없습니다.');
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene)throw Error('대상 장면이 없습니다.');
 if(!clean(command)||!command.trim())throw Error('500자 이하의 지시를 입력하세요.');
 const text=normalizeNaturalMvPhrase93(command.trim(),{scene}).replace(/^(?:이|현재|선택한?)\s*장면(?:의|에서|은|을)?\s*/,'');
 // 기존 선택 장면 안에서 서로 다른 두 속성까지 한 번에 검토한다. 임의 문장은 추측하지 않는다.
 const parts=text.split(/\s+그리고\s+/u);
 if(parts.length>2||parts.some(x=>!x.trim()))throw Error('서로 다른 장면 속성은 최대 두 개까지 지정하세요.');
 const changes=parts.map(part=>{
  const match=part.match(/^(배경|장소|의상|옷|카메라|표정|감정|동작|행동|조명)\s*(?:을|를|은|는)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해|설정해)(?:줘|주세요)?[.!]?$/u);
  if(!match)throw Error('지원하는 형식: "배경을 비 오는 밤거리로 바꿔 그리고 조명을 네온 불빛으로 바꿔".');
  const field=STEP93_FIELDS[match[1]],after=match[2].trim();
  if(!VALID.has(field)||!after||after.length>180||!clean(after))throw Error('수정할 장면 설명이 올바르지 않습니다.');
  if(locked(project,field))throw Error('장면 속성이 잠겨 있습니다. 먼저 프로젝트 잠금 설정을 확인하세요.');
  return {field,before:scene[field]||'',after,label:match[1]};
 });
 if(new Set(changes.map(c=>c.field)).size!==changes.length)throw Error('같은 장면 속성을 두 번 수정할 수 없습니다.');
 const summary=changes.map(c=>c.label+': '+(c.before||'(없음)')+' → '+c.after).join(' / ');
 const common={projectId:project.id,sceneId,source:command.trim(),snapshot:JSON.stringify(project.scenes),summary};
 if(changes.length===1){const {field,before,after}=changes[0];return {version:1,...common,field,before,after};}
 return {version:2,...common,field:'multi',changes:changes.map(({field,before,after})=>({field,before,after}))};

}
export function applyMvInstruction93(project,plan){
 if(plan?.projectId!==project?.id||plan.snapshot!==JSON.stringify(project.scenes))throw Error('미리보기 이후 장면이 변경되었습니다. 다시 검토하세요.');
 const scene=project.scenes?.find(s=>s.id===plan.sceneId);if(!scene)throw Error('대상 장면이 없습니다.');
 const multi=plan.version===2&&plan.field==='multi';
 const changes=multi?plan.changes:[{field:plan.field,before:plan.before,after:plan.after}];
 if(!Array.isArray(changes)||changes.length!==(multi?2:1)||
  new Set(changes.map(c=>c.field)).size!==changes.length)throw Error('검토한 수정 속성 목록이 유효하지 않습니다.');
 for(const change of changes){
  if(!VALID.has(change.field)||!clean(change.after)||!change.after||change.after.length>180||
   (scene[change.field]||'')!==change.before)throw Error('수정할 장면 속성이 검토 후 변경됐습니다.');
  if(locked(project,change.field))throw Error('현재 잠금 상태에서는 변경할 수 없습니다.');
 }
 const historyEntry=multi?{sceneId:plan.sceneId,changes:changes.map(({field,before,after})=>({field,before,after}))}:
  {sceneId:plan.sceneId,field:plan.field,before:plan.before,after:plan.after};
 const history=[...(project.videoEdits93?.history||[]),historyEntry].slice(-20);
 const patch=Object.fromEntries(changes.map(c=>[c.field,c.after]));
 return {...project,scenes:project.scenes.map(s=>s.id===plan.sceneId?{...s,...patch}:s),
  videoEdits93:{version:1,history}};

}
export function undoMvInstruction93(project){
 const history=project?.videoEdits93?.history||[],last=history.at(-1);
 if(!last)throw Error('되돌릴 자연어 수정이 없습니다.');
 const target=project.scenes?.find(s=>s.id===last.sceneId);
 const changes=Array.isArray(last.changes)?last.changes:[{field:last.field,before:last.before,after:last.after}];
 if(!target||changes.length<1||changes.length>2||changes.some(c=>!VALID.has(c.field)||target[c.field]!==c.after))
  throw Error('이후 장면이 변경되어 안전하게 되돌릴 수 없습니다.');
 const patch=Object.fromEntries(changes.map(c=>[c.field,c.before]));
 return {...project,scenes:project.scenes.map(s=>s.id===last.sceneId?{...s,...patch}:s),
  videoEdits93:{version:1,history:history.slice(0,-1)}};
}
