// A fully generated local Singing + optional RVC voice result becomes
// persistent EDITABLE project clips in one append-only IndexedDB transaction.
// Source vocals are retained as muted references; trained output is audible.
export async function persistNeuralVocalTake(project,files,{
 current,onChange,newId,readInfo,createTrack,store,rollback,signal,
 engineInfo=null,job=null
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(files)||files.length<1||files.length>2||
 [current,onChange,newId,readInfo,createTrack,store,rollback].some(x=>typeof x!=='function'))
  throw Error('기존 프로젝트 및 실제 보컬 파일 저장 연결이 필요합니다.');
 const guard=()=>{if(signal?.aborted||current()!==project)throw Error('가창 제작 중 취소·프로젝트 전환: 기존 파일을 보존했습니다.');};
 guard();
 const ids=new Set(project.tracks.map(t=>t.id)),entries=[],tracks=[];
 const names=files.length===2?['실제 Singing 원본 가창 WAV (참고·음소거)','실제 Singing + RVC 본인 음색 보컬 WAV']:['실제 로컬 신경망 Singing 가창 WAV'];
 for(const [i,file] of files.entries()){
  guard();
  if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)throw Error('실제 가창 WAV 파일 크기를 확인하세요.');
  const info=await readInfo(file);guard();
  const duration=Number(info?.duration??info?.durationSec);
  if(!Number.isFinite(duration)||duration<=0||duration>360)throw Error('6분을 초과하거나 손상된 가창 WAV입니다.');
  const assetId=newId('singing-source'),trackId=newId('singing-track');
  if(!assetId||!trackId||assetId===trackId||ids.has(assetId)||ids.has(trackId))throw Error('신규 보컬 파일/트랙 ID가 중복됐습니다.');
  ids.add(assetId);ids.add(trackId);
  const track=createTrack(project,file,assetId,duration);
  if(!track?.clips?.some(c=>c.assetId===assetId))throw Error('실제 보컬 파일을 편집 트랙으로 연결하지 못했습니다.');
  entries.push([assetId,file]);
  tracks.push({...track,id:trackId,name:names[i],type:'vocal',mute:files.length===2&&i===0,solo:false});
 }
 guard();
 let saved=false;
 try{
  await store(entries);saved=true;guard();
  const changed={...project,tracks:[...project.tracks,...tracks],
   ...(engineInfo?{singingEngine:engineInfo}:{}),
   ...(job?{singingJobs:[...(project.singingJobs||[]).slice(-19),job]}:{})};
  await Promise.resolve(onChange(changed));
  saved=false;
  return {assets:entries.length,tracks:tracks.length,project:changed};
 }catch(error){
  if(saved&&current()===project)try{await rollback(entries.map(([id])=>id));}catch(e){throw Error('신규 가창 자산 정리 오류: '+e.message+' / '+error.message)}
  throw error;
 }
}
