// STEP93: local, auditable command grammar. No remote LLM or pretend semantic parser.
export const STEP93_FIELDS=Object.freeze({배경:'location',장소:'location',의상:'outfit',옷:'outfit',카메라:'camera',표정:'expression',감정:'expression',동작:'action',행동:'action',조명:'lighting'});
const VALID=new Set(Object.values(STEP93_FIELDS));
const clean=s=>typeof s==='string'&&s.length<=500&&!/[\u0000-\u001f\u007f]/.test(s);
export function interpretMvInstruction93(project,sceneId,command){
 if(!project?.id||!Array.isArray(project.scenes))throw Error('프로젝트 장면 정보가 없습니다.');
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene)throw Error('대상 장면이 없습니다.');
 if(!clean(command)||!command.trim())throw Error('500자 이하의 지시를 입력하세요.');
 const text=command.trim().replace(/^(?:이|현재|선택한?)\s*장면(?:의|에서|은|을)?\s*/,'');
 const match=text.match(/^(배경|장소|의상|옷|카메라|표정|감정|동작|행동|조명)\s*(?:을|를|은|는)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경해|설정해)(?:줘|주세요)?[.!]?$/u);
 if(!match)throw Error('지원하는 형식: "배경을 비 오는 밤거리로 바꿔". 한 번에 한 장면의 속성 하나만 변경합니다.');
 const field=STEP93_FIELDS[match[1]],value=match[2].trim();
 if(!VALID.has(field)||!value||value.length>180||!clean(value))throw Error('수정할 장면 설명이 올바르지 않습니다.');
 if((field==='outfit'&&project.outfitLock===true)||(field==='location'&&project.backgroundLock===true)||(field==='camera'&&project.cameraLock===true))throw Error('장면 속성이 잠겨 있습니다. 먼저 프로젝트 잠금 설정을 확인하세요.');
 return {version:1,projectId:project.id,sceneId,field,before:scene[field]||'',after:value,source:command.trim(),snapshot:JSON.stringify(project.scenes),summary:`${match[1]}: ${scene[field]||'(없음)'} → ${value}`};
}
export function applyMvInstruction93(project,plan){
 if(plan?.projectId!==project?.id||plan.snapshot!==JSON.stringify(project.scenes))throw Error('미리보기 이후 장면이 변경되었습니다. 다시 검토하세요.');
 if(!VALID.has(plan.field)||!clean(plan.after)||plan.after.length>180)throw Error('수정 내용이 유효하지 않습니다.');
 const exists=project.scenes.some(s=>s.id===plan.sceneId);if(!exists)throw Error('대상 장면이 없습니다.');
 if((plan.field==='outfit'&&project.outfitLock===true)||(plan.field==='location'&&project.backgroundLock===true)||(plan.field==='camera'&&project.cameraLock===true))throw Error('현재 잠금 상태에서는 변경할 수 없습니다.');
 const history=[...(project.videoEdits93?.history||[]),{sceneId:plan.sceneId,field:plan.field,before:plan.before,after:plan.after}].slice(-20);
 return {...project,scenes:project.scenes.map(s=>s.id===plan.sceneId?{...s,[plan.field]:plan.after}:s),videoEdits93:{version:1,history}};
}
export function undoMvInstruction93(project){
 const history=project?.videoEdits93?.history||[],last=history.at(-1);if(!last)throw Error('되돌릴 자연어 수정이 없습니다.');
 const target=project.scenes.find(s=>s.id===last.sceneId);if(!target||target[last.field]!==last.after)throw Error('이후 장면이 변경되어 안전하게 되돌릴 수 없습니다.');
 return {...project,scenes:project.scenes.map(s=>s.id===last.sceneId?{...s,[last.field]:last.before}:s),videoEdits93:{version:1,history:history.slice(0,-1)}};
}
