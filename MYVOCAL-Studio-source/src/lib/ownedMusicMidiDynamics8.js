// Original #8/#11: real rights-cleared owned-song PCM energy profile
// translates into EDITABLE original-composition MIDI velocity envelopes.
// Never copies source melody, chords, recordings, lyrics, or note timing.
// Existing MIDI notes are preserved in an exact undo snapshot.
import {ownedMusicGuideForProject8,ownedMusicSectionEnergy8,
 validateOwnedMusicStyle8} from './ownedMusicStyle8.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function applyOwnedMusicMidiDynamics8(project,profile,{strength=65}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!project.tracks.length||
  project.tracks.length>48||!Number.isInteger(strength)||strength<0||strength>100)
  throw Error('작업 중인 음악 프로젝트와 스타일 적용 강도(0~100)를 선택하세요.');
 validateOwnedMusicStyle8(profile);
 if(project.ownedMusicMidiUndo8)
  throw Error('이미 스타일이 적용됐습니다. 이전 적용을 되돌리고 새 스타일을 선택하세요.');
 let all=0,last=0;
 for(const track of project.tracks){
  if(!Array.isArray(track.midiNotes)||track.midiNotes.length>12000)
   throw Error('MIDI 노트가 없거나 안전한 편집 허용량을 초과했습니다.');
  for(const n of track.midiNotes){
   if(!Number.isFinite(n.startBeat)||n.startBeat<0||
     !Number.isFinite(n.length)||n.length<=0||
     !Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127)
    throw Error('실제 편집 가능한 MIDI 시작 박자·길이·속도 정보가 올바르지 않습니다.');
   last=Math.max(last,n.startBeat+n.length);all++;
  }
 }
 if(!all||all>50000||last<=0||last>4800)
  throw Error('실제 MIDI 음표 1~50,000개와 정상적인 음악 박자 길이가 필요합니다.');
 const guide=ownedMusicGuideForProject8(profile);
 const base={...project,ownedMusicGuide8:guide};
 const saved=[],tracks=project.tracks.map(t=>{
  if(!t.midiNotes.length)return {...t};
  const original=t.midiNotes.map(n=>({...n}));
  const applied=original.map(n=>{
   const normalized=clamp((n.startBeat+n.length/2)/last,0,1);
   const relative=ownedMusicSectionEnergy8(base,normalized);
   const gain=relative===null?1:1+(clamp(.8+.35*(relative-1),.7,1.3)-1)*strength/100;
   return {...n,velocity:clamp(Math.round(n.velocity*gain),1,127)};
  });
  saved.push({trackId:t.id,before:original,after:applied});
  return {...t,midiNotes:applied};
 });
 return {...base,tracks,
  ownedMusicMidiUndo8:{
   version:1,profileId:profile.id,source:'actual-owned-local-pcm',
   appliedAt:new Date().toISOString(),strength,saved
  }};
}
export function undoOwnedMusicMidiDynamics8(project){
 const history=project?.ownedMusicMidiUndo8;
 if(history?.version!==1||history.source!=='actual-owned-local-pcm'||
  !Array.isArray(history.saved)||!Array.isArray(project.tracks))
  throw Error('보관된 내 음악 스타일 MIDI 편집 기록이 없습니다.');
 const keyed=new Map(history.saved.map(x=>[x.trackId,x]));
 if(keyed.size!==history.saved.length)
  throw Error('복구 MIDI 트랙 정보가 중복됐습니다.');
 const tracks=project.tracks.map(t=>{
  const old=keyed.get(t.id);if(!old)return t;
  // Do not silently erase subsequent hand edits made in the editor.
  if(JSON.stringify(t.midiNotes)!==JSON.stringify(old.after))
   throw Error('스타일 적용 후 수동 변경한 MIDI가 있어 자동 되돌리기로 덮어쓸 수 없습니다.');
  return {...t,midiNotes:old.before.map(n=>({...n}))};
 });
 for(const id of keyed.keys())if(!project.tracks.some(t=>t.id===id))
  throw Error('복원하려는 원래 악기 트랙이 삭제되어 있습니다.');
 const {ownedMusicMidiUndo8,...rest}=project;
 return {...rest,tracks};
}
