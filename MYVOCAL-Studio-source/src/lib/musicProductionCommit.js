// Commit actual MusicGen -> Demucs -> PCM master outputs into the existing DAW.
// Every stem is separately editable; the mastered preview starts muted to avoid
// doubling loudness. No generated file replaces an old clip, voice or project.

const LABEL={drums:'드럼',bass:'베이스',other:'기타 악기',vocals:'보컬',guitar:'기타',piano:'피아노'};
const cancelled=()=>Error('음악 제작을 취소했거나 작업 중 프로젝트가 변경됐습니다. 원본은 그대로입니다.');
export async function persistNeuralMusicTracks(project,production,{
 current,onChange,signal,
 info,createTrack,newId,save,remove
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||[current,onChange,info,createTrack,newId,save,remove].some(fn=>typeof fn!=='function'))
  throw Error('기존 MYVOCAL 프로젝트 저장 연결을 확인하세요.');
 const stems=production?.stems?.stems;
 if(!Array.isArray(stems)||![4,6].includes(stems.length)||!(production?.master instanceof Blob))
  throw Error('실제 MusicGen·Demucs·마스터 WAV가 모두 필요합니다.');
 const required=stems.length===4?['drums','bass','other','vocals']:['drums','bass','other','vocals','guitar','piano'];
 if(new Set(stems.map(s=>s.name)).size!==stems.length||stems.some(s=>!required.includes(s.name))||
  required.some(n=>!stems.some(s=>s.name===n)))
  throw Error('분리된 악기 이름이 중복되거나 누락됐습니다.');
 if(signal?.aborted||current()!==project)throw cancelled();
 const entries=[],newTracks=[],existing=new Set(project.tracks.map(t=>t.id));
 let baseline=0;
 for(const stem of [...stems,{name:'master',file:production.master}]){
  if(signal?.aborted||current()!==project)throw cancelled();
  if(!(stem.file instanceof Blob)||stem.file.size<44||stem.file.size>90*1024*1024)
   throw Error('악기·마스터 WAV 파일이 없거나 90MiB를 초과했습니다.');
  const decoded=await info(stem.file);
  const duration=Number(decoded?.duration??decoded?.durationSec);
  if(!Number.isFinite(duration)||duration<=0||duration>360)throw Error('악기·마스터 WAV 길이가 유효하지 않습니다.');
  if(baseline&&Math.abs(duration-baseline)>.1)throw Error('악기·마스터 WAV의 시간축이 일치하지 않습니다.');
  baseline||=duration;
  const assetId=newId('musicstem'),trackId=newId('trk');
  if(!assetId||!trackId||existing.has(trackId)||entries.some(x=>x[0]===assetId)||newTracks.some(t=>t.id===trackId))
   throw Error('새 악기/트랙 ID가 충돌합니다.');
  existing.add(trackId);
  const track=createTrack(project,stem.file,assetId,duration);
  if(!track||!Array.isArray(track.clips)||!track.clips.some(c=>c.assetId===assetId))
   throw Error('악기 WAV를 실제 편집 트랙으로 변환하지 못했습니다.');
  newTracks.push({...track,id:trackId,type:stem.name==='vocals'?'vocal':'instrument',
   name:stem.name==='master'?'MusicGen·Demucs PCM 마스터 (참고용)':'MusicGen 분리 '+LABEL[stem.name],
   volume:75,mute:stem.name==='master',solo:false});
  entries.push([assetId,stem.file]);
 }
 if(signal?.aborted||current()!==project)throw cancelled();
 let stored=false;
 try{
  await save(entries);
  stored=true;
  if(signal?.aborted||current()!==project)throw cancelled();
  await Promise.resolve(onChange({...project,tracks:[...project.tracks,...newTracks]}));
  stored=false;
  return {tracks:newTracks,assets:entries.length,masterMuted:true};
 }catch(error){
  if(stored){try{await remove(entries.map(([id])=>id));}catch(clean){throw Error('생성된 악기 자산 정리 실패: '+clean.message+' / 원인: '+error.message);}}
  throw error;
 }
}
