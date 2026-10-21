// Extend only the tail of a user storyboard for a newly produced full-song
// WAV. Existing scenes, character/model assets and manual edits are untouched.
// Newly added scenes are then rendered by the EXISTING local ComfyUI SD/SVD flow.
export function extendMvToFullSong(project,duration,{newId,sceneLimit=20}={}){
 if(!project?.id||!Array.isArray(project.scenes)||typeof newId!=='function')
  throw Error('기존 뮤직비디오 프로젝트가 필요합니다.');
 if(!Number.isFinite(duration)||duration<2||duration>360)throw Error('완성 곡 길이는 2~360초여야 합니다.');
 const last=Math.max(0,...project.scenes.map(s=>Number(s.end)||0));
 if(last>=duration-.04)return {project,added:0};
 const room=sceneLimit-project.scenes.length;
 if(room<1)throw Error('현재 MV 장면 제한으로 노래 끝부분을 자동 추가할 수 없습니다.');
 const count=Math.min(room,Math.ceil((duration-last)/18));
 const segment=(duration-last)/count;
 const lastScene=[...project.scenes].sort((a,b)=>b.end-a.end)[0]||null;
 const ids=new Set(project.scenes.map(s=>s.id));
 const added=[];
 for(let i=0;i<count;i++){
  const id=newId('auto-mv');
  if(typeof id!=='string'||!id||ids.has(id))throw Error('자동 MV 장면 ID가 중복됐습니다.');
  ids.add(id);
  const start=Math.round((last+i*segment)*1000)/1000;
  const end=i===count-1?Math.round(duration*1000)/1000:Math.round((last+(i+1)*segment)*1000)/1000;
  if(end<=start)throw Error('자동 MV 장면 시간 생성에 실패했습니다.');
  added.push({id,start,end,title:'음악 연속 장면 '+(i+1),
   description:'기존 노래의 후렴·연주 흐름을 이어가는 공연/스토리 MV 영상. 앞 장면의 인물·의상·장소 연속성을 유지하는 구성',
   ...(lastScene?.characterId?{characterId:lastScene.characterId}:{}),
   ...(lastScene?.location?{location:lastScene.location}:{}),
   ...(lastScene?.outfit?{outfit:lastScene.outfit}:{})});
 }
 return {project:{...project,scenes:[...project.scenes,...added]},added:added.length};
}
