// STEP94: replace *links*, not pixels. Old person/character images remain archived.
export const REPLACE94_MAX_HISTORY=8;
function consent(c){return c&&['self','owned','licensed'].includes(c.rights)&&(c.rights!=='licensed'||!!c.rightsNote?.trim());}
export function prepareCharacterReplace94(project,sceneIds,characterId,characters){
 if(!project?.id||!Array.isArray(project.scenes)||!Array.isArray(sceneIds)||!sceneIds.length)throw Error('교체할 장면을 선택하세요.');
 const character=characters.find(c=>c.id===characterId);if(!consent(character))throw Error('등록된 권한 있는 캐릭터나 사람만 선택할 수 있습니다.');
 if(project.identityLock===true)throw Error('정체성 잠금 상태에서는 캐릭터를 교체할 수 없습니다.');
 if(new Set(sceneIds).size!==sceneIds.length||sceneIds.some(id=>!project.scenes.some(s=>s.id===id)))throw Error('장면 선택이 올바르지 않습니다.');
 if(sceneIds.some(id=>(project.scenes.find(s=>s.id===id).characterId||project.characterId)===characterId))throw Error('이미 지정된 캐릭터가 포함되었습니다.');
 return {version:1,projectId:project.id,sceneIds:[...sceneIds],characterId,sourceSnapshot:JSON.stringify(project.scenes),rightsSnapshot:JSON.stringify([character.rights,character.rightsNote||'',character.assets||[]]),preview:`${sceneIds.length}개 장면의 등장 캐릭터를 ${character.name}로 교체합니다. 이전 이미지·영상은 되돌리기 이력에 보관되며 새 캐릭터 이미지로 표시되지 않습니다.`};
}
export function applyCharacterReplace94(project,plan,characters){
 if(plan?.projectId!==project?.id||plan.sourceSnapshot!==JSON.stringify(project.scenes))throw Error('교체 검토 후 장면이 변경되었습니다.');
 const fresh=characters.find(c=>c.id===plan.characterId);if(!consent(fresh)||JSON.stringify([fresh.rights,fresh.rightsNote||'',fresh.assets||[]])!==plan.rightsSnapshot)throw Error('캐릭터 권한 또는 자료가 변경되었습니다.');
 if(project.identityLock===true)throw Error('캐릭터 정체성이 잠겨 있습니다.');
 const target=new Set(plan.sceneIds);
 return {...project,scenes:project.scenes.map(s=>{
  if(!target.has(s.id))return s;
  const {characterReplace94,...previous}=s;
  const history=[...(characterReplace94?.history||[]),{scene:previous}].slice(-REPLACE94_MAX_HISTORY);
  const next={...s,characterId:plan.characterId,characterReplace94:{version:1,history}};
  // Old media and 92 history belong to a different identity. Keep their bytes in history, not on screen.
  delete next.personMv;delete next.characterMv;delete next.imageAssetId;delete next.videoClipAssetId;delete next.imageGeneration;delete next.videoGeneration;delete next.regeneration92;
  return next;
 })};
}
export function undoCharacterReplace94(project,sceneId){
 const scene=project?.scenes?.find(s=>s.id===sceneId),history=scene?.characterReplace94?.history||[];
 if(!history.length)throw Error('복구할 이전 캐릭터 연결이 없습니다.');
 const prior=history.at(-1).scene,remaining=history.slice(0,-1);
 return {...project,scenes:project.scenes.map(s=>s.id!==sceneId?s:{...prior,...(remaining.length?{characterReplace94:{version:1,history:remaining}}:{})})};
}
