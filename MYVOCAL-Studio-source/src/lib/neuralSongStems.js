// MYVOCAL native Windows flow: local neural symbolic arrangement -> six
// real SoundFont PCM stems -> single append-only IndexedDB/project transaction.
// Do not confuse sample-rendered WAV stems with neural MusicGen audio or vocals.
export const NEURAL_SONG_STEM_ROLES=Object.freeze(['melody','chords','bass','drums','guitar','pad']);
const cancelled=()=>Error('작곡 중 취소 또는 프로젝트 변경: 기존 녹음·모델·트랙을 그대로 보존했습니다.');
export async function produceNeuralSongStems(project,generated,settings,{
  current,onChange,signal,newId,makeMidi,renderStem,readInfo,
  createTrack,saveAssets,removeAssets,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||generated?.neuralSymbolic!==true||
 !Array.isArray(generated.tracks)||generated.tracks.length!==6||
 [current,onChange,newId,makeMidi,renderStem,readInfo,createTrack,saveAssets,removeAssets].some(x=>typeof x!=='function'))
  throw Error('기존 프로젝트와 신경망 악기 렌더링 연결이 필요합니다.');
 const roles=new Set(generated.tracks.map(t=>t.role));
 if(roles.size!==6||NEURAL_SONG_STEM_ROLES.some(r=>!roles.has(r))||
 generated.tracks.some(t=>!Array.isArray(t.midiNotes)||!t.midiNotes.length))throw Error('신경망 MIDI 악기 6개가 준비되지 않았습니다.');
 const verify=()=>{if(signal?.aborted||current()!==project)throw cancelled();};
 verify();
 const midi=[],pcm=[],assets=[],seen=new Set(project.tracks.map(t=>t.id));
 const allocate=prefix=>{const id=newId(prefix);if(typeof id!=='string'||!id||seen.has(id))throw Error('악기 신규 자산/트랙 ID가 중복됐습니다.');seen.add(id);return id;};
 const bpm=generated.bpm;
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('곡 BPM이 올바르지 않습니다.');
 for(let i=0;i<generated.tracks.length;i++){
  verify();
  const original=generated.tracks[i],source={...original,id:allocate('neural-midi')};
  // Generate actual sampled instrument audio, not oscillator placeholders.
  const score=makeMidi({bpm,tracks:[source]});
  if(!(score instanceof Blob)||score.size<26)throw Error('실제 악기 MIDI 파일 생성에 실패했습니다.');
  onProgress('신경망 작곡 악기 '+(i+1)+'/6 PCM 렌더링');
  const wav=await renderStem(score,settings,{signal});
  verify();
  if(!(wav instanceof Blob)||wav.size<44||wav.size>90*1024*1024)throw Error('실제 악기 PCM WAV가 생성되지 않았습니다.');
  const info=await readInfo(wav);verify();
  const duration=Number(info?.duration??info?.durationSec);
  if(!Number.isFinite(duration)||duration<.05||duration>360)throw Error('악기 WAV 타임라인이 올바르지 않습니다.');
  const assetId=allocate('neural-stem-asset'),trackId=allocate('neural-pcm-track');
  const track=createTrack(project,wav,assetId,duration);
  if(!track||!Array.isArray(track.clips)||!track.clips.some(c=>c.assetId===assetId))
   throw Error('악기 음성 파일을 프로젝트 클립으로 만들지 못했습니다.');
  midi.push({...source,mute:true,solo:false});
  pcm.push({...track,id:trackId,name:'신경망 원천 MIDI · '+original.name+' / 실제 SoundFont 악기 WAV',
   type:'instrument',volume:75,mute:false,solo:false,sourceRole:original.role});
  assets.push([assetId,wav]);
 }
 verify();
 let saved=false;
 try{
  await saveAssets(assets);
  saved=true;verify();
  const next={...project,bpm,tracks:[...project.tracks,...midi,...pcm]};
  await Promise.resolve(onChange(next));
  saved=false;
  return {project:next,midiTracks:midi.length,pcmTracks:pcm.length,storedAssets:assets.length,durationSec:generated.durationSec};
 }catch(e){
  if(saved){try{await removeAssets(assets.map(([id])=>id))}catch(clean){throw Error('신규 악기 자산 롤백 실패: '+clean.message+' / 원인: '+e.message)}}
  throw e;
 }
}
