// Non-destructive local audio clip editing. Original media remains in IndexedDB.
// Legacy clips only have durationSec + startBar; new trim fields are optional.
const isNonnegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isPositive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
export const MIN_CLIP_SECONDS = .01;
const withoutFadeReference = clip => {const {fadeReference,...rest}=clip;return rest;};

export function clipWindow(clip, bpm, decodedDuration) {
 const tempo = Number(bpm);
 const validTempo = Number.isFinite(tempo) && tempo > 0;
 const bar = Number(clip?.startBar ?? 1);
 const startSec = validTempo && Number.isFinite(bar) && bar >= 1 ? (bar - 1) * 240 / tempo : 0;
 // Metadata is authoritative for legacy clips; decoded audio may be shorter.
 const stored = clip?.durationSec;
 const sourceDuration = isPositive(decodedDuration)
   ? (isPositive(stored) ? Math.min(decodedDuration, stored) : decodedDuration)
   : (isPositive(stored) ? stored : 0);
 const offset = isNonnegative(clip?.sourceOffsetSec) ? clip.sourceOffsetSec : 0;
 const available = Math.max(0, sourceDuration - offset);
 const length = clip?.playDurationSec == null ? available :
   (isPositive(clip.playDurationSec) ? Math.min(available, clip.playDurationSec) : 0);
 return { startSec, sourceOffsetSec:Math.min(offset,sourceDuration), durationSec:length,
   endSec:startSec+length, sourceDurationSec:sourceDuration };
}

// Returns exactly the buffer segment to play when seeking. No source overrun.
export function clipPlaybackPlan(clip, bpm, seekSec=0, decodedDuration) {
 const timing = clipWindow(clip,bpm,decodedDuration);
 if (!(timing.durationSec >= MIN_CLIP_SECONDS) || !isNonnegative(seekSec)) return null;
 const elapsed = Math.max(0,seekSec-timing.startSec);
 if (elapsed >= timing.durationSec-MIN_CLIP_SECONDS/100) return null;
 return { delaySec:Math.max(0,timing.startSec-seekSec),
   sourceOffsetSec:timing.sourceOffsetSec+elapsed,
   durationSec:timing.durationSec-elapsed };
}

// A validated immutable edit. Never rewrite or delete the original audio asset.
export function editClipTiming(clip, field, value) {
 if (!clip || !isPositive(clip.durationSec)) throw Error('원본 오디오 길이 정보를 확인할 수 없습니다.');
 if (!['startBar','sourceOffsetSec','playDurationSec','fadeInSec','fadeOutSec'].includes(field)) throw Error('지원하지 않는 클립 편집 항목입니다.');
 const n = Number(value);
 if (value === '' || value === null || value === undefined || !Number.isFinite(n)) throw Error('유효한 숫자를 입력해 주세요.');
 if (field === 'fadeInSec' || field === 'fadeOutSec') {
  if (n < 0 || n > clipWindow(clip,120).durationSec) throw Error('페이드 길이는 클립 재생 길이 안쪽이어야 합니다.');
  return {...withoutFadeReference(clip),[field]:n};
 }
 if (field === 'startBar') {
  if (n < 1 || n > 999) throw Error('시작 마디는 1~999 범위여야 합니다.');
  return {...clip,startBar:n};
 }
 const available=clip.durationSec-(isNonnegative(clip.sourceOffsetSec) ? clip.sourceOffsetSec : 0);
 if (field === 'sourceOffsetSec') {
  if (n < 0 || clip.durationSec-n < MIN_CLIP_SECONDS) throw Error('원본 시작점은 오디오 길이 안쪽이어야 합니다.');
  const remaining=clip.durationSec-n;
  return {...withoutFadeReference(clip),sourceOffsetSec:n,
   ...(clip.playDurationSec == null ? {} : {playDurationSec:Math.min(remaining,clip.playDurationSec)})};
 }
 if (n < MIN_CLIP_SECONDS || n > available+1e-9) throw Error('재생 길이는 원본의 남은 길이를 초과할 수 없습니다.');
 return {...withoutFadeReference(clip),playDurationSec:n};
}
export function resetClipTiming(clip){return {...withoutFadeReference(clip),sourceOffsetSec:0,playDurationSec:undefined};}

// Pure clip-only end; the full audio engine combines this with MIDI end.
export function clipsEnd(project) {return Math.max(0,...(project.tracks||[]).flatMap(t=>(t.clips||[]).map(c=>clipWindow(c,project.bpm).endSec)));}


// Non-destructive fade envelope. Missing fields are equivalent to no fade.
// Fade times are measured from the audible clip boundary, NOT the source file.
// If trimming makes previously saved fades overlap, proportionally fit both
// inside the shorter playable window without mutating the saved clip.
export function clipFades(clip, durationSec) {
 const duration = isNonnegative(durationSec) ? durationSec : 0;
 let fadeInSec = isNonnegative(clip?.fadeInSec) ? Math.min(duration,clip.fadeInSec) : 0;
 let fadeOutSec = isNonnegative(clip?.fadeOutSec) ? Math.min(duration,clip.fadeOutSec) : 0;
 if (fadeInSec + fadeOutSec > duration && duration > 0) {
  const fit = duration / (fadeInSec + fadeOutSec);
  fadeInSec *= fit;
  fadeOutSec *= fit;
 }
 return {fadeInSec,fadeOutSec};
}

// Fade curves are optional per clip. Old projects keep their linear envelope.
export const CLIP_FADE_CURVES = Object.freeze(['linear','smooth','equalPower']);
export function clipFadeCurve(clip, direction) {
 const field = direction === 'in' ? 'fadeInCurve' : 'fadeOutCurve';
 return CLIP_FADE_CURVES.includes(clip?.[field]) ? clip[field] : 'linear';
}

// Use a separate edit function so numeric clip timing inputs cannot be confused
// with enum-valued fade curves. No modification is made to the original clip.
export function editClipFadeCurve(clip, direction, curve) {
 if (!clip || !isPositive(clip.durationSec) || !['in','out'].includes(direction) ||
     !CLIP_FADE_CURVES.includes(curve)) throw Error('페이드 곡선 값이 올바르지 않습니다.');
 return {...withoutFadeReference(clip),[direction === 'in' ? 'fadeInCurve' : 'fadeOutCurve']:curve};
}

function shapedProgress(progress, curve) {
 const t = Math.max(0,Math.min(1,progress));
 if (curve === 'smooth') return t*t*(3-2*t);
 if (curve === 'equalPower') return Math.sin(t*Math.PI/2);
 return t;
}

// A split piece can retain its source clip's complete fade envelope, including
// nonlinear curves and fades spanning the split boundary. This metadata is
// optional: all legacy clips use their original local fade calculations.
function validFadeReference(clip,durationSec) {
 const ref=clip?.fadeReference;
 return ref && typeof ref==='object' && isPositive(ref.durationSec) &&
   isNonnegative(ref.offsetSec) && isNonnegative(durationSec) &&
   ref.offsetSec+durationSec<=ref.durationSec+1e-6 ? ref : null;
}

export function clipFadeReference(clip,durationSec) {
 const ref=validFadeReference(clip,durationSec);
 if (ref) return {...ref};
 return {durationSec,offsetSec:0,fadeInSec:clip?.fadeInSec??0,
  fadeOutSec:clip?.fadeOutSec??0,fadeInCurve:clipFadeCurve(clip,'in'),
  fadeOutCurve:clipFadeCurve(clip,'out')};
}

function baseFadeGain(clip,durationSec,elapsedSec) {
 const {fadeInSec,fadeOutSec}=clipFades(clip,durationSec);
 const up=fadeInSec>0 ? shapedProgress(elapsedSec/fadeInSec,clipFadeCurve(clip,'in')) : 1;
 const down=fadeOutSec>0 ? shapedProgress((durationSec-elapsedSec)/fadeOutSec,clipFadeCurve(clip,'out')) : 1;
 return Math.max(0,Math.min(up,down));
}

export function clipFadeGain(clip,durationSec,elapsedSec) {
 if (!isPositive(durationSec) || !Number.isFinite(elapsedSec) || elapsedSec<0 || elapsedSec>durationSec) return 0;
 const ref=validFadeReference(clip,durationSec);
 return ref ? baseFadeGain(ref,ref.durationSec,ref.offsetSec+elapsedSec) :
  baseFadeGain(clip,durationSec,elapsedSec);
}

// Web Audio gain scheduling points relative to a source.start() invocation.
// Split pieces use the same global fade curve grid as their original clip,
// so both real-time playback and WAV export follow the source envelope.
export function clipFadeAutomation(clip,durationSec,elapsedSec=0) {
 if (!isPositive(durationSec) || !isNonnegative(elapsedSec) || elapsedSec>=durationSec) return [];
 const ref=validFadeReference(clip,durationSec);
 const source=ref||clip,sourceDuration=ref?ref.durationSec:durationSec,shift=ref?ref.offsetSec:0;
 const {fadeInSec,fadeOutSec}=clipFades(source,sourceDuration);
 const points=[elapsedSec,durationSec,0-shift,fadeInSec-shift,
  sourceDuration-fadeOutSec-shift,sourceDuration-shift];
 const addCurvePoints=(start,end,curve)=>{
  if (!(end>start) || curve==='linear') return;
  for(let i=1;i<32;i++)points.push(start+(end-start)*i/32-shift);
 };
 addCurvePoints(0,fadeInSec,clipFadeCurve(source,'in'));
 addCurvePoints(sourceDuration-fadeOutSec,sourceDuration,clipFadeCurve(source,'out'));
 const visible=points.filter(t=>t>=elapsedSec-1e-9 && t<=durationSec+1e-9)
  .map(t=>Math.max(elapsedSec,Math.min(durationSec,t))).sort((a,b)=>a-b);
 const unique=visible.filter((t,i)=>i===0 || t>visible[i-1]+1e-9);
 return unique.map(t=>({delaySec:t-elapsedSec,gain:clipFadeGain(clip,durationSec,t)}));
}

// One scheduling routine is shared by live playback and offline mixdown.
export function scheduleClipFade(param, clip, durationSec, elapsedSec, startTime) {
 if (!param || !Number.isFinite(startTime) || startTime < 0) throw Error('잘못된 오디오 페이드 시작 시각입니다.');
 const envelope = clipFadeAutomation(clip,durationSec,elapsedSec);
 for (const [index,point] of envelope.entries()) {
  const at = startTime + point.delaySec;
  if (index === 0) param.setValueAtTime(point.gain,at);
  else param.linearRampToValueAtTime(point.gain,at);
 }
 return envelope.length;
}

// Step34: optional, non-destructive per-clip volume and mute metadata.
// Missing fields mean 100% volume and audible (legacy project compatibility).
// Keep the gain stage separate from fade automation and track volume.
export function clipLevel(clip) {
 const raw=clip?.gainPercent;
 const percent=typeof raw === 'number' && Number.isFinite(raw) && raw>=0 && raw<=200 ? raw : 100;
 return clip?.clipMuted === true ? 0 : percent/100;
}

export function editClipLevel(clip,field,value) {
 if (!clip || !isPositive(clip.durationSec)) throw Error('클립 음량을 변경할 수 없습니다.');
 if (field === 'clipMuted') {
  if (typeof value !== 'boolean') throw Error('클립 음소거 값은 참/거짓이어야 합니다.');
  return {...clip,clipMuted:value};
 }
 if (field !== 'gainPercent') throw Error('지원하지 않는 클립 음량 항목입니다.');
 if (value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) throw Error('클립 음량은 0~200%여야 합니다.');
 const number=Number(value);
 if (!Number.isFinite(number) || number<0 || number>200) throw Error('클립 음량은 0~200%여야 합니다.');
 return {...clip,gainPercent:number};
}

export function scheduleClipLevel(param,clip,startTime) {
 if (!param || typeof param.setValueAtTime !== 'function' || !Number.isFinite(startTime) || startTime<0)
  throw Error('잘못된 클립 음량 시작 시각입니다.');
 const level=clipLevel(clip);
 param.setValueAtTime(level,startTime);
 return level;
}


// Step35: per-clip stereo pan, independent of track gain and fade. A missing,
// malformed, or centered pan leaves the legacy audio graph unchanged.
export function clipPan(clip) {
 const value=clip?.panPercent;
 return typeof value === 'number' && Number.isFinite(value) && value>=-100 && value<=100 ? value/100 : 0;
}

export function editClipPan(clip,value) {
 if (!clip || !isPositive(clip.durationSec)) throw Error('클립 좌우 위치를 변경할 수 없습니다.');
 if (value == null || typeof value === 'boolean' ||
     (typeof value !== 'number' && typeof value !== 'string') ||
     (typeof value === 'string' && !value.trim())) throw Error('좌우 위치는 -100~100 범위여야 합니다.');
 const n=Number(value);
 if (!Number.isFinite(n) || n<-100 || n>100) throw Error('좌우 위치는 -100~100 범위여야 합니다.');
 return {...clip,panPercent:n};
}

export function scheduleClipPan(param,clip,startTime) {
 if (!param || typeof param.setValueAtTime !== 'function' ||
     typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime<0)
  throw Error('잘못된 클립 좌우 위치 시작 시각입니다.');
 const pan=clipPan(clip);
 param.setValueAtTime(pan,startTime);
 return pan;
}

// For mono sources, normalize the dominant channel to unity. This makes
// 0% -> +/-1% continuous with legacy centered mono playback and prevents
// panning alone from raising the peak beyond the source level. Stereo sources
// use native StereoPannerNode balance without additional gain.
export function monoPanCompensation(pan) {
 if (typeof pan !== 'number' || !Number.isFinite(pan) || pan<-1 || pan>1)
  throw Error('잘못된 좌우 위치 값입니다.');
 const angle=(pan+1)*Math.PI/4;
 return 1/Math.max(Math.cos(angle),Math.sin(angle));
}
