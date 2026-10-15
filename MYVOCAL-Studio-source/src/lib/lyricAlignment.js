// v0.9: Transparent, editable lyric-to-MIDI *text cue* alignment.
// Not phoneme recognition, forced audio alignment, or AI singing inference.
import {normalizeSingingNotes} from './localVocalSampler.js';
import {makeZip} from './zipStore.js';
import {createMidiFile} from './midiFile.js';
const enc=new TextEncoder();
const round=x=>Math.round(x*1000)/1000;
export const VOCAL_REQUEST_FORMAT='MYVOCAL_VOICE_INFERENCE_REQUEST';

export function lyricUnits(text){
 if(typeof text!=='string')return [];
 const lines=text.replace(/\r/g,'').split('\n').filter(line=>!/^\s*\[[^\]]{1,60}\]\s*$/.test(line));
 // Korean Hangul as written syllable blocks, Latin as words. NOT phonemes.
 return lines.flatMap(line=>line.match(/[가-힣]|[A-Za-z]+(?:['’][A-Za-z]+)?|[0-9]+|[ぁ-ゟァ-ヿ一-龯]+/gu)||[]).slice(0,4096);
}
export function midiVocalTracks(project){return (project?.tracks||[]).filter(t=>Array.isArray(t.midiNotes)&&t.midiNotes.length>0&&t.instrument!=='drums');}
export function alignmentSource(project,trackId){
 const tracks=midiVocalTracks(project);
 const track=tracks.find(t=>t.id===trackId)||tracks.find(t=>t.type==='vocal'||/vocal|보컬/i.test(t.name||''))||tracks[0];
 if(!track)throw Error('먼저 MIDI 피아노 롤에 보컬 멜로디 음표를 입력해 주세요.');
 const notes=normalizeSingingNotes(track.midiNotes).sort((a,b)=>a.startBeat-b.startBeat||a.pitch-b.pitch);
 if(!notes.length)throw Error('해당 트랙에 유효한 MIDI 음표가 없습니다.');
 const bpm=Number(project.bpm);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('가사 싱크 BPM은 40~240만 지원합니다.');
 const end=Math.max(...notes.map(n=>(n.startBeat+n.length)*60/bpm));
 if(end>90)throw Error('최대 90초의 보컬 MIDI만 내보낼 수 있습니다.');
 // Snapshot token for stale detection; no personal recordings included.
 const sourceKey=JSON.stringify({projectId:project.id,trackId:track.id,bpm,lyrics:project.lyrics||'',notes});
 return {track,notes,bpm,sourceKey};
}
export function alignLyricNotes(project,trackId){
 const {track,notes,bpm,sourceKey}=alignmentSource(project,trackId);
 const syllables=lyricUnits(project.lyrics||'');
 const cues=notes.map((n,i)=>({index:i+1,lyric:syllables[i]||'—',pitch:n.pitch,startBeat:n.startBeat,length:n.length,velocity:n.velocity,startSec:round(n.startBeat*60/bpm),endSec:round((n.startBeat+n.length)*60/bpm)}));
 return {format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,projectId:project.id,trackId:track.id,trackName:track.name,bpm,sourceKey,createdAt:new Date().toISOString(),syllablesTotal:syllables.length,overflow:Math.max(0,syllables.length-notes.length),unfilled:Math.max(0,notes.length-syllables.length),cues};
}
export function isAlignmentStale(project,alignment){
 if(!alignment||alignment.projectId!==project?.id)return true;
 try{return alignment.sourceKey!==alignmentSource(project,alignment.trackId).sourceKey;}catch{return true;}
}
export function validateAlignment(alignment){
 if(alignment?.format!=='MYVOCAL_LYRIC_ALIGNMENT'||alignment?.version!==1||!Array.isArray(alignment.cues)||!alignment.cues.length||alignment.cues.length>128)throw Error('올바른 가사·MIDI 싱크 데이터가 아닙니다.');
 for(const cue of alignment.cues){
  if(typeof cue.lyric!=='string'||cue.lyric.length>80||!Number.isFinite(cue.startSec)||!Number.isFinite(cue.endSec)||cue.startSec<0||cue.endSec<=cue.startSec||cue.endSec>90.01)throw Error('가사 싱크의 시간 또는 텍스트가 잘못되었습니다.');
  if(!Number.isFinite(cue.pitch)||cue.pitch<36||cue.pitch>96)throw Error('MIDI 음높이가 잘못되었습니다.');
 }
 return true;
}
function srtStamp(sec){const ms=Math.round(sec*1000);const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
 return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');}
export function cuesToSrt(cues){let i=0;return cues.filter(c=>c.lyric.trim()&&c.lyric!=='—').map(c=>`${++i}\n${srtStamp(c.startSec)} --> ${srtStamp(c.endSec)}\n${c.lyric.replace(/[\r\n]+/g,' ')}\n`).join('\n');}
export async function createVocalExchangePackage(project,alignment,voice=null,model=null){
 validateAlignment(alignment);
 if(isAlignmentStale(project,alignment))throw Error('가사, BPM 또는 MIDI가 수정되었습니다. 싱크를 다시 생성한 뒤 내보내세요.');
 if(voice&& !['self','owned','licensed'].includes(voice.rights))throw Error('사용 권한이 없는 목소리로 추론 요청을 만들 수 없습니다.');
 if(model&&model.voiceId!==voice?.id)throw Error('선택한 목소리와 모델이 서로 다릅니다.');
 const notes=alignment.cues.map(c=>({pitch:c.pitch,startBeat:c.startBeat,length:c.length,velocity:c.velocity}));
 const midiProject={bpm:alignment.bpm,tracks:[{name:'Lead Vocal',type:'vocal',instrument:'synth',midiNotes:notes}]};
 const manifest={format:VOCAL_REQUEST_FORMAT,version:1,app:'MYVOCAL Studio v0.9',project:{id:project.id,title:project.title,bpm:alignment.bpm},voice:voice?{id:voice.id,name:voice.name,rights:voice.rights}:null,
  checkpoint:model?{id:model.id,name:model.name,engineId:model.engineId,note:'모델 바이너리는 ZIP에 포함되지 않습니다. 호환성과 실행을 보장하지 않습니다.'}:null,
  audioOutput:'vocal-output.wav',engineStatus:'NOT_CONNECTED',alignmentKind:'manual-text-to-midi-not-phonemes',
  cues:alignment.cues.map(c=>({index:c.index,text:c.lyric,pitch:c.pitch,startBeat:c.startBeat,durationBeats:c.length,startSec:c.startSec,endSec:c.endSec}))};
 const entries=[{name:'manifest.json',data:enc.encode(JSON.stringify(manifest,null,2))},{name:'melody.mid',data:new Uint8Array(await createMidiFile(midiProject).arrayBuffer())},{name:'lyrics.srt',data:enc.encode(cuesToSrt(alignment.cues))},{name:'README.txt',data:enc.encode('MYVOCAL v0.9 inference exchange. No AI engine was run. Text cues are not phoneme timestamps. Use an external model/runtime with appropriate consent; import a rendered WAV into MYVOCAL Studio afterwards.\n')}];
 const bytes=makeZip(entries);
 return {bytes,manifest,fileName:`MYVOCAL-v0.9-${String(project.title||'project').replace(/[^\w가-힣-]/g,'_')}-vocal-exchange.zip`};
}
// startSec is the original musical-timeline offset for a cropped guide WAV.
// Keep it as a fractional bar: the audio workstation and mixdown both accept
// fractional startBar values, preserving sub-beat timing without moving any
// existing clips. Older imports still default to bar 1.
export function makeImportedVocalTrack(project,file,assetId,durationSec,startSec=0){
 if(!project?.id||typeof assetId!=='string'||!assetId||!file||!Number.isFinite(durationSec)||durationSec<=0||durationSec>480)
  throw Error('오디오 원본이 올바르지 않습니다.');
 const bpm=Number(project.bpm);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('프로젝트 BPM이 올바르지 않습니다.');
 if(!Number.isFinite(startSec)||startSec<0||startSec>480||startSec+durationSec>480)
  throw Error('선택 구간 WAV의 원곡 위치 또는 길이가 잘못되었습니다.');
 const startBar=1+startSec*bpm/240;
 return {id:`trk_voice_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name:'외부 보컬 WAV',type:'vocal',instrument:'synth',mute:false,solo:false,volume:85,midiNotes:[],clips:[{id:`clip_voice_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,assetId,fileName:file.name,durationSec,startBar,size:file.size}]};
}
