// Step38: session-only, per-project undo/redo for audio clip edits.
// Snapshots include ONLY the affected track's clips. MIDI notes, track mixer,
// other tracks, local audio assets and browser storage are never rewritten.
// This history is intentionally not persisted with the project.
export const CLIP_HISTORY_LIMIT = 40;
const copy = value => JSON.parse(JSON.stringify(value));
const signature = clips => JSON.stringify(clips ?? []);
const findTrack = (tracks,id) => Array.isArray(tracks) ? tracks.find(t=>t?.id===id) : undefined;

export function createClipHistory(projectId) {
 return {projectId,past:[],future:[]};
}

export function recordClipChange(history,projectId,beforeTracks,afterTracks,trackId,label='클립 편집') {
 if (!history || history.projectId!==projectId) throw Error('프로젝트가 변경되어 편집 기록을 사용할 수 없습니다.');
 const before=findTrack(beforeTracks,trackId),after=findTrack(afterTracks,trackId);
 if (!before || !after) throw Error('편집할 트랙이 존재하지 않습니다.');
 if (!Array.isArray(beforeTracks) || !Array.isArray(afterTracks) ||
     beforeTracks.length!==afterTracks.length || beforeTracks.some((t,i)=>t.id!==afterTracks[i]?.id))
  throw Error('클립 기록 중 트랙 구성이 변경되었습니다.');
 // This function is not a general project undo; never accidentally record
 // modifications to clips on another track in a single-target entry.
 if (beforeTracks.some(t=>t.id!==trackId && signature(t.clips)!==signature(findTrack(afterTracks,t.id)?.clips)))
  throw Error('다른 트랙의 클립이 동시에 변경되어 기록할 수 없습니다.');
 const oldClips=signature(before.clips),newClips=signature(after.clips);
 if (oldClips===newClips) return history;
 const entry={trackId,beforeClips:copy(before.clips??[]),afterClips:copy(after.clips??[]),label};
 return {projectId,past:[...history.past,entry].slice(-CLIP_HISTORY_LIMIT),future:[]};
}

export function applyClipHistory(history,projectId,tracks,direction) {
 if (!history || history.projectId!==projectId) throw Error('다른 프로젝트의 편집 기록은 적용할 수 없습니다.');
 if (direction!=='undo' && direction!=='redo') throw Error('지원하지 않는 실행 취소 동작입니다.');
 const undo=direction==='undo',stack=undo?history.past:history.future;
 if (!stack.length) throw Error(undo?'실행 취소할 클립 편집이 없습니다.':'다시 실행할 클립 편집이 없습니다.');
 const entry=stack[stack.length-1],track=findTrack(tracks,entry.trackId);
 if (!track) throw Error('편집했던 트랙이 없어 복원할 수 없습니다.');
 const expected=undo?entry.afterClips:entry.beforeClips;
 if (signature(track.clips)!==signature(expected))
  throw Error('클립이 다른 곳에서 변경되어 안전하게 복원할 수 없습니다. 현재 상태를 유지합니다.');
 const replacement=copy(undo?entry.beforeClips:entry.afterClips);
 const nextTracks=tracks.map(t=>t.id===entry.trackId?{...t,clips:replacement}:t);
 const nextHistory=undo
  ? {projectId,past:history.past.slice(0,-1),future:[...history.future,entry]}
  : {projectId,past:[...history.past,entry].slice(-CLIP_HISTORY_LIMIT),future:history.future.slice(0,-1)};
 return {tracks:nextTracks,history:nextHistory,label:entry.label};
}
