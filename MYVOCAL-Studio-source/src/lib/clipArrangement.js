// Step36: non-destructive audio clip duplication. Both clips refer to the same
// existing local media asset; no IndexedDB write, copy, or deletion is needed.
import {clipWindow, MIN_CLIP_SECONDS, clipFadeReference} from './clipTiming.js';

const validNumber = value => typeof value === 'number' && Number.isFinite(value);

export function duplicateClip(clip, bpm, newId, mode='after', cursorSec=0) {
 if (!clip || typeof clip !== 'object' || typeof clip.assetId !== 'string' || !clip.assetId ||
     typeof clip.id !== 'string' || !clip.id || typeof newId !== 'string' || !newId || newId === clip.id)
  throw Error('복제할 오디오 클립과 새 ID를 확인해 주세요.');
 if (!validNumber(bpm) || bpm <= 0 || !['after','cursor'].includes(mode))
  throw Error('복제 위치 또는 BPM이 올바르지 않습니다.');
 const timing=clipWindow(clip,bpm);
 if (timing.durationSec < MIN_CLIP_SECONDS) throw Error('재생 길이가 없는 클립은 복제할 수 없습니다.');
 if (mode === 'cursor' && (!validNumber(cursorSec) || cursorSec < 0))
  throw Error('복제할 커서 위치가 올바르지 않습니다.');
 const seconds=mode === 'after' ? timing.endSec : cursorSec;
 const startBar=1+seconds*bpm/240;
 if (!Number.isFinite(startBar) || startBar > 999) throw Error('복제 시작 마디는 999 이하여야 합니다.');
 // Keep all source trim, gain, pan and fade metadata. Do not mutate the clip,
 // and never copy or alter the audio asset itself.
 return {...clip,id:newId,startBar};
}

export function duplicateClipInTracks(tracks, trackId, clipId, newId, bpm, mode='after', cursorSec=0) {
 if (!Array.isArray(tracks) || !tracks.some(t=>t.id===trackId) ||
     tracks.some(t=>(t.clips||[]).some(c=>c.id===newId)))
  throw Error('트랙이 없거나 클립 ID가 중복됩니다.');
 let found=false;
 const result=tracks.map(track=>{
  if (track.id!==trackId) return track;
  const clips=track.clips||[],index=clips.findIndex(c=>c.id===clipId);
  if (index<0) throw Error('복제할 클립을 찾을 수 없습니다.');
  const copy=duplicateClip(clips[index],bpm,newId,mode,cursorSec);
  found=true;
  return {...track,clips:[...clips.slice(0,index+1),copy,...clips.slice(index+1)]};
 });
 if (!found) throw Error('복제할 클립을 찾을 수 없습니다.');
 return result;
}


// Step37: split an audible clip at the current project playhead without touching
// the media asset. Both pieces retain the original fade envelope timebase.
export function splitClipAtCursor(clip,bpm,newId,cursorSec) {
 if (!clip || typeof clip !== 'object' || typeof clip.assetId !== 'string' || !clip.assetId ||
     typeof clip.id !== 'string' || !clip.id || typeof newId !== 'string' || !newId || newId === clip.id)
  throw Error('분할할 오디오 클립과 새 ID를 확인해 주세요.');
 if (!validNumber(bpm) || bpm <= 0 || !validNumber(cursorSec) || cursorSec < 0)
  throw Error('분할 커서 위치 또는 BPM이 올바르지 않습니다.');
 const timing=clipWindow(clip,bpm);
 if (!(timing.durationSec >= MIN_CLIP_SECONDS*2)) throw Error('분할할 클립의 재생 길이가 너무 짧습니다.');
 const firstDuration=cursorSec-timing.startSec;
 const secondDuration=timing.endSec-cursorSec;
 // Keep at least 10 ms of audible audio on each side. A boundary split
 // would create a zero-length or unplayable clip and is therefore rejected.
 if (firstDuration < MIN_CLIP_SECONDS-1e-9 || secondDuration < MIN_CLIP_SECONDS-1e-9)
  throw Error('재생 커서를 클립 내부에 두고 양쪽에 최소 0.01초를 남겨 주세요.');
 const startBar=1+cursorSec*bpm/240;
 if (!Number.isFinite(startBar) || startBar>999)
  throw Error('분할 시작 마디는 999 이하여야 합니다.');
 const fadeReference=clipFadeReference(clip,timing.durationSec);
 const left={...clip,playDurationSec:firstDuration,fadeReference:{...fadeReference}};
 const right={...clip,id:newId,startBar,sourceOffsetSec:timing.sourceOffsetSec+firstDuration,
  playDurationSec:secondDuration,fadeReference:{...fadeReference,offsetSec:fadeReference.offsetSec+firstDuration}};
 return [left,right];
}

export function splitClipInTracks(tracks,trackId,clipId,newId,bpm,cursorSec) {
 if (!Array.isArray(tracks) || !tracks.some(t=>t.id===trackId) ||
     tracks.some(t=>(t.clips||[]).some(c=>c.id===newId)))
  throw Error('트랙이 없거나 클립 ID가 중복됩니다.');
 return tracks.map(track=>{
  if (track.id!==trackId) return track;
  const clips=track.clips||[],index=clips.findIndex(c=>c.id===clipId);
  if (index<0) throw Error('분할할 클립을 찾을 수 없습니다.');
  const [left,right]=splitClipAtCursor(clips[index],bpm,newId,cursorSec);
  return {...track,clips:[...clips.slice(0,index),left,right,...clips.slice(index+1)]};
 });
}
