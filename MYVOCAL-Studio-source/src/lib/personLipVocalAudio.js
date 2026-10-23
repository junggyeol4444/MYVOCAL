// 원본 #20·#21·#34·#55: 실제 얼굴 립싱크는 반주가 아닌 그 사람의 보컬로 구동한다.
// 기존 사용자 프로젝트·악기·트랙·음색 파일을 수정하지 않는 임시 믹스 뷰만 생성한다.
export function isolatedPersonSingingMix(project,personId){
 if(!project?.id||!Array.isArray(project.tracks)||!personId)
  throw Error('실제 사람의 원본 곡과 등록 인물 ID가 필요합니다.');
 const vocals=project.tracks.filter(t=>t?.type==='vocal'&&!t.mute&&
   Array.isArray(t.clips)&&t.clips.some(c=>typeof c.assetId==='string'&&c.assetId));
 if(!vocals.length)throw Error('등록된 실제 가창 WAV 보컬 트랙이 없습니다.');
 const singers=project.duetSingers?.version===1?
   [project.duetSingers.lead,project.duetSingers.harmony]:[];
 const explicit=vocals.filter(t=>t.singerCharacterId===personId||
   singers.some(s=>s?.characterId===personId&&s.trackId===t.id));
 let selected=null;
 if(explicit.length===1)selected=explicit[0];
 else if(!explicit.length&&vocals.length===1&&
   (!vocals[0].singerCharacterId||vocals[0].singerCharacterId===personId)&&
   !singers.some(s=>s?.characterId&&s.characterId!==personId&&s.trackId===vocals[0].id))
  selected=vocals[0];
 if(!selected||explicit.length>1)
  throw Error('실제 인물과 연결된 독립 가창 보컬 트랙을 하나로 확정할 수 없습니다. 듀엣 가수별 트랙을 확인하세요.');
 const tracks=project.tracks.map(t=>({...t,mute:t.id!==selected.id,solo:false}));
 return {project:{...project,tracks},trackId:selected.id};
}
