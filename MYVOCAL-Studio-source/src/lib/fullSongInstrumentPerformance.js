// 원본 46항: 기존 MYVOCAL MIDI 악기 트랙을 3~6분 VRM 연주 동작 시간표로 전달한다.
// STEP89의 사용자 녹화/수동 동작 및 원본 MIDI는 수정하지 않는다.
import {PERFORMANCE_ROLES,usablePerformance89} from './characterPerformance89.js';
const ALIASES={melody:'synth',chords:'piano',pad:'strings',keys:'piano',keyboard:'piano',percussion:'drums'};
const normalize=role=>{const value=String(role||'').trim().toLowerCase();return ALIASES[value]||value;};
export function makeFullSongInstrumentPerformance(project,{durationSec,role='all'}={}){
 if(!project?.id||!Array.isArray(project.tracks)||project.tracks.length>512)
  throw Error('전곡 연주에는 기존 MYVOCAL 음악 프로젝트가 필요합니다.');
 const bpm=Number(project.bpm),durationMs=Math.round(Number(durationSec)*1000);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240||!Number.isInteger(durationMs)||durationMs<150000||durationMs>360000)
  throw Error('실제 3~6분 MIDI 연주와 40~240 BPM 정보가 필요합니다.');
 if(role!=='all'&&!PERFORMANCE_ROLES.includes(role))throw Error('지원하지 않는 MIDI 연주 악기입니다.');
 const instruments=[];
 for(const track of project.tracks){
  if(track?.mute||!Array.isArray(track?.midiNotes))continue;
  const sourceRole=[track.sourceRole,track.role,track.instrument].map(normalize)
   .find(name=>PERFORMANCE_ROLES.includes(name));
  if(!sourceRole||role!=='all'&&sourceRole!==role)continue;
  if(track.midiNotes.length>10000)throw Error('악기 MIDI 음표가 10,000개를 초과했습니다.');
  for(const note of track.midiNotes){
   if(!Number.isFinite(note?.startBeat)||!Number.isFinite(note?.length)||note.startBeat<0||note.length<=0)
    continue;
   const pitch=Number(note.pitch),velocity=Number(note.velocity??96);
   if(!Number.isInteger(pitch)||pitch<0||pitch>127||!Number.isInteger(velocity)||velocity<1||velocity>127)continue;
   const startMs=Math.round(note.startBeat*60000/bpm);
   const endMs=Math.min(durationMs,Math.round((note.startBeat+note.length)*60000/bpm));
   if(startMs>=durationMs||endMs<=startMs)continue;
   instruments.push({trackId:String(track.id||'').slice(0,120),role:sourceRole,startMs,endMs,pitch,velocity});
   if(instruments.length>8192)throw Error('전곡 MIDI 연주 음표가 8,192개를 초과했습니다.');
  }
 }
 if(!instruments.length)throw Error('현재 선택한 악기에 실제 MIDI 연주 음표가 없습니다.');
 instruments.sort((a,b)=>a.startMs-b.startMs||a.pitch-b.pitch);
 return {version:1,projectId:project.id,durationMs,source:'manual',referenceAssetId:'',frames:[],instruments};
}

/**
 * 원본 #31·#32·#46: 이미 사용자가 허가하고 STEP89에서 기록한
 * 로컬 참고 영상/웹캠의 움직임 강약을 전곡 공연에 연결한다.
 * 프레임·원본 영상은 보존하고 MIDI 악기 큐는 원곡 절대 시간축을 유지한다.
 * 이는 실제 관절 포즈 추정이나 새 모션캡처 AI가 아니라 반복 공연 연출이다.
 */
export function makeFullSongReferencePerformance(character,project,{durationSec,midiPlan=null}={}){
 const durationMs=Math.round(Number(durationSec)*1000),bpm=Number(project?.bpm);
 if(!project?.id||!Number.isInteger(durationMs)||durationMs<150000||durationMs>360000||
    !Number.isFinite(bpm)||bpm<40||bpm>240)
  throw Error('참고 동작의 전곡 연결에는 기존 3~6분 음악과 BPM이 필요합니다.');
 if(midiPlan&&(midiPlan.projectId!==project.id||midiPlan.durationMs!==durationMs||
    !Array.isArray(midiPlan.instruments)))
  throw Error('참고 동작과 MIDI 연주 원곡 시간표가 일치하지 않습니다.');
 const saved=usablePerformance89(character);
 if(!saved||!['reference','webcam'].includes(saved.source)||!saved.frames.length)
  return midiPlan;
 // 4박자 마디 단위로 영상 에너지 구간을 반복하되 원본 1~30초 프레임은
 // 수정하지 않는다. 무대에서 선택한 각 악기의 실제 MIDI 큐는 그대로 합친다.
 const barMs=4*60000/bpm;
 const bars=Math.max(1,Math.round(saved.durationMs/barMs));
 const loopMs=Math.round(bars*barMs);
 if(loopMs<1000||loopMs>60000)throw Error('참고 동작의 MIDI 마디 반복 길이가 올바르지 않습니다.');
 return {
  version:1,projectId:project.id,durationMs,
  source:saved.source,referenceAssetId:saved.referenceAssetId,
  frames:saved.frames.map(frame=>({...frame})),
  instruments:midiPlan?.instruments?.map(event=>({...event}))||[],
  referenceLoopMs:loopMs,referenceSourceDurationMs:saved.durationMs,
  sourceType:'consented-motion-energy-loop',originalReferencePreserved:true
 };
}
