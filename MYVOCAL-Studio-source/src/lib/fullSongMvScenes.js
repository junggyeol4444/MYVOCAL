// 3~6분 원곡 MV의 빈 구간만 기존 SD/SVD 모델의 새 자동 장면으로 연결한다.
// 사용자 작성 장면·기존 미디어·인물/의상 원본은 수정하지 않는다.
const CLOCK=1000;
const FRAME_SECONDS=3; // 실제 SVD 25프레임·8fps 출력 3.125초 이내
const at=seconds=>Math.round(seconds*CLOCK)/CLOCK;
export function extendMvToFullSong(project,duration,{newId,sceneLimit=120}={}){
 if(!project?.id||!Array.isArray(project.scenes)||typeof newId!=='function')
  throw Error('기존 MYVOCAL 뮤직비디오 프로젝트가 필요합니다.');
 if(!Number.isFinite(duration)||duration<2||duration>360)
  throw Error('완성 음악은 2~360초여야 합니다.');
 if(!Number.isInteger(sceneLimit)||sceneLimit<1||sceneLimit>120)
  throw Error('SVD 전체 장면 수는 최대 120개입니다.');
 if(project.scenes.length>sceneLimit)
  throw Error('기존 MV 장면이 허용된 최대 장면 수를 초과합니다. 원본은 보존됩니다.');
 const ordered=project.scenes.slice().sort((a,b)=>Number(a.start)-Number(b.start));
 const used=new Set(project.scenes.map(s=>s.id)),added=[];
 let cursor=0,previous=null;
 function fillGap(from,to,reference){
  const a=at(Math.max(0,from)),b=at(Math.min(duration,to));
  if(b-a<.04)return;
  let start=a;
  while(b-start>=.04){
   const end=at(Math.min(b,start+FRAME_SECONDS));
   if(end-start<.04)break;
   if(project.scenes.length+added.length>=sceneLimit)
    throw Error('원본 3~6분 음악의 공백을 채울 MV 장면 수가 120개를 초과합니다. 기존 장면을 보존합니다.');
   const id=newId('auto-mv');
   if(typeof id!=='string'||!id||used.has(id))
    throw Error('자동 MV 장면 ID가 중복되거나 누락됐습니다.');
   used.add(id);
   added.push({id,start,end,title:'음악 연속 장면 '+(added.length+1),
    generatedBy:'full-song-auto-scene',
    description:'기존 음악의 후렴·연주·장면 흐름을 이어가는 자동 공연/스토리 영상',
    ...(reference?.characterId?{characterId:reference.characterId}:{}),
    ...(reference?.location?{location:reference.location}:{}),
    ...(reference?.outfit?{outfit:reference.outfit}:{}),
    ...(reference?.personMv?{personMv:{...reference.personMv}}:{}),
    ...(reference?.characterMv?{characterMv:{...reference.characterMv}}:{})});
   start=end;
  }
 }
 for(const scene of ordered){
  const start=Number(scene.start),end=Number(scene.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.01)
   throw Error('기존 MV 장면 시간이 음악 구간과 맞지 않습니다. 장면은 변경하지 않습니다.');
  if(start>cursor+.04)fillGap(cursor,start,previous||scene);
  if(end>=cursor){cursor=end;previous=scene;}
 }
 if(cursor<duration-.04)fillGap(cursor,duration,previous);
 if(!added.length)return {project,added:0};
 const scenes=[...project.scenes,...added].sort((a,b)=>a.start-b.start||a.end-b.end);
 return {project:{...project,scenes},added:added.length};
}
