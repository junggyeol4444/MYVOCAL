// 기존 MYVOCAL의 동일 AI 작곡 회차에서 생성한 6악기만 선택한다.
// 이전 회차의 MIDI와 섞거나 사용자 트랙을 수정하지 않는다.
export const NEURAL_SCORE_ROLES=Object.freeze(['melody','chords','bass','drums','guitar','pad']);
const ROLE_SET=new Set(NEURAL_SCORE_ROLES);
export function latestCompleteNeuralScore(project){
 const tracks=Array.isArray(project?.tracks)?project.tracks:[];
 let tail=[];
 for(let i=tracks.length-1;i>=0;i--){
  const track=tracks[i];
  if(track?.generatedBy!=='ollama-neural-score'){
   if(tail.length)break;
   continue;
  }
  if(!ROLE_SET.has(track.role)||!Array.isArray(track.midiNotes)||!track.midiNotes.length)return null;
  if(tail.some(t=>t.role===track.role))return null;
  tail.unshift(track);
  if(tail.length===6){
   if(NEURAL_SCORE_ROLES.some((role,j)=>tail[j].role!==role))return null;
   return new Map(tail.map(t=>[t.role,t]));
  }
 }
 return null;
}
