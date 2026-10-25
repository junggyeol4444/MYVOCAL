// Reject a completed export if its audio, storyboard or included character
// mouth schedule changed during the real-time WebM/MP4 recording process.
export function mvExportRevision(project,characters=[],{includeLipSync=false}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!Array.isArray(project.tracks))throw Error('MV 프로젝트 정보를 확인할 수 없습니다.');
 const value={id:project.id,scenes:project.scenes,tracks:project.tracks,lyrics:project.lyrics,vocalAlignment:project.vocalAlignment,
  bpm:project.bpm,sections:project.sections,chords:project.chords,mvStyleGrade91:project.mvStyleGrade91};
 if(includeLipSync){
  value.duetSingers=project.duetSingers;
  value.phonemePlan=project.phonemePlan;
  value.lipSync=characters.map(c=>[c?.id,c?.lipSync,c?.layerPlan]);
 }
 return JSON.stringify(value);
}
export function verifyMvExportRevision(original,project,characters=[],options={}){
 if(typeof original!=='string'||original!==mvExportRevision(project,characters,options))throw Error('영상 녹화 중 음악·장면 또는 립싱크가 수정됐습니다. 다시 내보내세요.');
 return true;
}