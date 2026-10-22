// 원본 46항: 기존 MYVOCAL MIDI 악기 트랙을 3~6분 VRM 연주 동작 시간표로 전달한다.
// STEP89의 사용자 녹화/수동 동작 및 원본 MIDI는 수정하지 않는다.
import {PERFORMANCE_ROLES} from './characterPerformance89.js';
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
