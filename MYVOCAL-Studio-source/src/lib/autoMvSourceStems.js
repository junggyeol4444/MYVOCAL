// 기존 MYVOCAL Windows EXE의 Ollama MIDI 6악기를 실제 FluidSynth SoundFont PCM으로 생성한다.
// 사용자 녹음·모델·원본 MIDI는 읽기만 하며 신규 음소거 DAW 트랙만 추가한다.
// 신경망이 만들어낸 원천 오디오 stem이 아니라 MIDI 기반 샘플 합성임을 구별한다.
import {createMidiFile} from './midiFile.js';
import {renderMidiSoundFont} from './midiSoundFontClient.js';
import {latestCompleteNeuralScore,NEURAL_SCORE_ROLES} from './neuralScoreBatch.js';
const LABEL={melody:'멜로디',chords:'코드',bass:'베이스',drums:'드럼',guitar:'기타',pad:'패드'};
const cancelled=()=>Error('MIDI 악기 렌더링 취소 또는 프로젝트 변경: 기존 데이터 보존');
export async function renderAndStoreNeuralMidiStems(project,{
 python,library,soundfont,gain=.2,session,signal,current,onChange,newId,
 render=renderMidiSoundFont,encode=createMidiFile,readInfo,createTrack,save,remove,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!project.neuralAutoScore||
  [current,onChange,newId,render,encode,readInfo,createTrack,save,remove].some(x=>typeof x!=='function'))
  throw Error('기존 MYVOCAL의 신경망 MIDI와 편집 트랙 저장 기능이 필요합니다.');
 if(!python||!library||!soundfont||!Number.isFinite(gain)||gain<.01||gain>1||
  typeof session!=='string'||session.length<8)throw Error('로컬 SoundFont 경로·권한·세션을 확인하세요.');
 const guard=()=>{if(signal?.aborted||current()!==project)throw cancelled();};
 guard();
 const latest=latestCompleteNeuralScore(project);
 if(!latest)throw Error('동일 작곡 회차에서 실제 생성된 6악기 MIDI 트랙이 모두 필요합니다.');
 const entries=[],newTracks=[],ids=new Set(project.tracks.map(t=>t.id));
 for(const [i,role] of NEURAL_SCORE_ROLES.entries()){
  guard();onProgress('6악기 원천 MIDI→SoundFont PCM '+(i+1)+'/6');
  const source=latest.get(role);
  const midi=encode({bpm:project.bpm,tracks:[source]});
  if(!(midi instanceof Blob)||midi.size<26)throw Error('신경망 MIDI 파일 생성에 실패했습니다: '+LABEL[role]);
  const wav=await render(midi,{python,library,soundfont,gain},{session,signal});
  guard();
  if(!(wav instanceof Blob)||wav.size<44||wav.size>80*1024*1024)
   throw Error('실제 SoundFont PCM WAV가 없거나 용량이 초과됐습니다: '+LABEL[role]);
  const decoded=await readInfo(wav),duration=Number(decoded?.duration??decoded?.durationSec);
  if(!Number.isFinite(duration)||duration<=0||duration>360)throw Error('SoundFont WAV 길이가 잘못됐습니다: '+LABEL[role]);
  const assetId=newId('neural-midi-pcm'),trackId=newId('trk');
  if(!assetId||!trackId||ids.has(assetId)||ids.has(trackId)||assetId===trackId||
     entries.some(e=>e[0]===assetId)||newTracks.some(t=>t.id===trackId))
   throw Error('새 SoundFont 자산·트랙 ID 충돌');
  ids.add(assetId);ids.add(trackId);
  const track=createTrack(project,wav,assetId,duration);
  if(!track||!Array.isArray(track.clips)||!track.clips.some(c=>c.assetId===assetId))
   throw Error('PCM WAV를 편집 트랙으로 연결하지 못했습니다: '+LABEL[role]);
  newTracks.push({...track,id:trackId,name:'원천 MIDI 악기 PCM · '+LABEL[role],
   type:'instrument',mute:true,solo:false,volume:75,sourceMidiTrackId:source.id,
   generatedBy:'ollama-midi-soundfont-pcm'});
  entries.push([assetId,wav]);
 }
 guard();let stored=false;
 try{
  await save(entries);stored=true;guard();
  const next={...project,tracks:[...project.tracks,...newTracks]};
  await Promise.resolve(onChange(next));stored=false;
  return {project:next,tracks:6,assets:6};
 }catch(error){
  // 저장 실패 중 이미 프로젝트가 교체되었다면 파일 삭제로 참조 무결성을 해칠 수 있다.
  if(stored && current()===project){
   try{await remove(entries.map(([id])=>id));}
   catch(clean){throw Error('신규 악기 WAV 롤백 실패: '+clean.message+' / 원인: '+error.message);}
  }
  throw error;
 }
}
