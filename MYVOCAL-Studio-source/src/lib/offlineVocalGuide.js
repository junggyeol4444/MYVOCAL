// Built-in, deterministic vowel-formant guide for checking a MIDI vocal melody.
// This is DSP, NOT AI voice cloning or natural singing. It uses no files,
// network, microphone, local inference server or user voice/profile data.
import {validatePhonemePlan} from './phonemePlan.js';
const RATE = 22050;
const MAX_SEC = 90;
const TAU = 2 * Math.PI;
const VOWEL_FORMANTS = {
 a: [800, 1250, 2900], eo: [540, 1400, 2650], i: [280, 2250, 3000],
 o: [480, 930, 2500], u: [340, 800, 2300], eu: [360, 1520, 2450],
};
// Approximations to the six built-in formant profiles, not consonant synthesis.
const JAMO_VOWELS = [
 'a','a','a','a','eo','eo','eo','eo','o','o','o','o','o',
 'u','u','u','u','u','eu','eu','i',
];

// A syllable can also be written using standalone compatibility jamo.
const COMPAT_VOWELS = {
 'ㅏ':'a','ㅐ':'a','ㅑ':'a','ㅒ':'a','ㅓ':'eo','ㅔ':'eo','ㅕ':'eo','ㅖ':'eo',
 'ㅗ':'o','ㅘ':'o','ㅙ':'o','ㅚ':'o','ㅛ':'o','ㅜ':'u','ㅝ':'u','ㅞ':'u',
 'ㅟ':'u','ㅠ':'u','ㅡ':'eu','ㅢ':'eu','ㅣ':'i',
};
const MAX_SYLLABLES_PER_NOTE = 24;
// Choseong consonants are simplified into audible onset *hints*, not spoken
// consonants. Only Korean precomposed syllables carry consonant onset info.
// Unicode Hangul choseong order: ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ.
const ONSET_TYPES = [
 'burst','burst','nasal','burst','burst','liquid','nasal','burst','burst',
 'fricative','fricative','none','burst','burst','burst','burst','burst','burst','fricative',
];
const NEUTRAL_SYLLABLE = Object.freeze({vowel:'a',onset:'none'});

/** Return vowel and simplified onset hints for up to 24 Hangul syllables. */
export function guideSyllableSequence(text) {
 const result=[];
 for (const letter of String(text||'')) {
  const point=letter.codePointAt(0);
  if (point >= 0xac00 && point <= 0xd7a3) {
   const code=point-0xac00;
   result.push({vowel:JAMO_VOWELS[Math.floor(code/28)%21],onset:ONSET_TYPES[Math.floor(code/588)]});
  } else if (COMPAT_VOWELS[letter]) {
   result.push({vowel:COMPAT_VOWELS[letter],onset:'none'});
  }
  if (result.length===MAX_SYLLABLES_PER_NOTE)break;
 }
 return result.length?result:[{...NEUTRAL_SYLLABLE}];
}

// An inexpensive deterministic pseudo-noise source avoids Math.random, user
// audio files and a network/model dependency. The output is reproducible.
function onsetNoise(index, cueIndex, syllableIndex) {
 let x=(Math.imul(index+1, 0x9e3779b1) ^ Math.imul(cueIndex+1, 0x85ebca6b) ^
        Math.imul(syllableIndex+1, 0xc2b2ae35)) >>> 0;
 x^=x>>>16; x=Math.imul(x,0x7feb352d); x^=x>>>15;
 x=Math.imul(x,0x846ca68b);x^=x>>>16;
 return (x>>>0)/2147483648-1;
}

// Shapes <=40ms consonant cues inside a syllable without altering its MIDI
// pitch or note duration. A sin² window begins AND ends at silence so
// internal syllable boundaries do not click. No phoneme accuracy is claimed.
function consonantHint(onset, phase, index, cueIndex, syllableIndex, inside, frames) {
 if(onset==='none')return {gain:1,add:0};
 const span=Math.max(2,Math.min(Math.floor(RATE*0.04),Math.floor(frames*0.28)));
 if(inside<=0 || inside>=span)return {gain:1,add:0};
 const envelope=Math.sin(Math.PI*inside/span)**2;
 if(onset==='nasal')return {gain:1-0.35*envelope,add:0.15*envelope*Math.sin(phase)};
 if(onset==='liquid')return {gain:1-0.20*envelope,add:0.07*envelope*Math.sin(2*phase)};
 const noise=onsetNoise(index,cueIndex,syllableIndex);
 if(onset==='fricative')return {gain:1-0.62*envelope,add:0.34*envelope*noise};
 return {gain:1-0.68*envelope,add:0.32*envelope*noise};
}

// Extract successive sung vowel approximations rather than using only the
// first Hangul syllable. The count is bounded even for pasted long lyrics.
export function guideVowelSequence(text) {
 return guideSyllableSequence(text).map(s=>s.vowel);
}

export function guideVowel(text) { return guideVowelSequence(text)[0]; }


export function validateGuideCues(alignment, selection = null) {
 if (!alignment || !Array.isArray(alignment.cues) || alignment.cues.length < 1 || alignment.cues.length > 128)
  throw Error('오프라인 가창 가이드는 1~128개 MIDI 음표가 필요합니다.');
 let end = 0;
 let totalVoiceSeconds = 0;
 for (const [cueIndex,c] of alignment.cues.entries()) {
  if (!c || typeof c !== 'object' || typeof c.lyric !== 'string' || c.lyric.length > 240 ||
      !Number.isFinite(c.pitch) || !Number.isInteger(c.pitch) || c.pitch < 36 || c.pitch > 96 ||
      !Number.isFinite(c.startSec) || !Number.isFinite(c.endSec) || c.startSec < 0 ||
      c.endSec <= c.startSec || c.endSec > MAX_SEC ||
      !Number.isFinite(c.velocity) || c.velocity < 0 || c.velocity > 127) {
   throw Error('오프라인 가창 가이드의 음표·시간·강약 정보가 잘못되었습니다.');
  }
  end = Math.max(end, c.endSec);
  if ((!selection || (cueIndex+1>=selection.startCue && cueIndex+1<=selection.endCue)) &&
      c.lyric.trim() && c.lyric.trim() !== '—' && c.velocity > 0) {
   totalVoiceSeconds += c.endSec - c.startSec;
   if (totalVoiceSeconds > 120)
    throw Error('가이드 가창 음표의 누적 길이는 120초를 넘을 수 없습니다. 구간을 나눠 내보내 주세요.');
  }
 }
 return end;
}

function writeU16(bytes, offset, value) {
 bytes[offset] = value & 255;
 bytes[offset + 1] = (value >>> 8) & 255;
}
function writeU32(bytes, offset, value) {
 writeU16(bytes, offset, value);
 writeU16(bytes, offset + 2, value >>> 16);
}

export function pcmMonoToWav(samples, rate = RATE) {
 if (!(samples instanceof Float32Array) || samples.length < 1 || samples.length > MAX_SEC * RATE || rate !== RATE)
  throw Error('가이드 WAV의 길이 또는 샘플 레이트가 잘못되었습니다.');
 const bytes = new Uint8Array(44 + samples.length * 2);
 for (const [offset, word] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for (let i = 0; i < word.length; i++) bytes[offset + i] = word.charCodeAt(i);
 writeU32(bytes, 4, bytes.length - 8);
 writeU32(bytes, 16, 16); // PCM fmt size
 writeU16(bytes, 20, 1); // uncompressed PCM
 writeU16(bytes, 22, 1); // mono
 writeU32(bytes, 24, RATE);
 writeU32(bytes, 28, RATE * 2);
 writeU16(bytes, 32, 2);
 writeU16(bytes, 34, 16);
 writeU32(bytes, 40, samples.length * 2);
 for (let i = 0; i < samples.length; i++) {
  const v = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
  const pcm = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  writeU16(bytes, 44 + 2 * i, pcm & 0xffff);
 }
 return bytes;
}

function vowelHarmonics(f0, vowel) {
 const [f1, f2, f3] = VOWEL_FORMANTS[vowel] || VOWEL_FORMANTS.a;
 const harmonics = [];
 let total = 0;
 for (let k = 1; k <= Math.min(40, Math.floor(7600 / f0)); k++) {
  const frequency = k * f0;
  const gaussian = (center, width) => Math.exp(-0.5 * ((frequency - center) / width) ** 2);
  const weight = (0.24 + 2.5 * gaussian(f1, 210) + 1.8 * gaussian(f2, 340) + 1.25 * gaussian(f3, 480)) / Math.pow(k, 0.9);
  harmonics.push([k, weight]);
  total += weight;
 }
 return harmonics.map(([k, weight]) => [k, weight / Math.max(total, 0.0001)]);
}

// Read only the TIMING of an existing editable jamo plan. User-edited tokens
// are engine-specific hints; this procedural guide never claims to pronounce
// them. ID-based grouping is necessary when a note repeats the same syllable.
// Unsupported Latin/mixed notes continue to use the original even split.
export function guidePhonemeTiming(alignment, plan, selection = null) {
 validateGuideCues(alignment, selection);
 validatePhonemePlan(plan,alignment); // reject stale/out-of-range/overlapping edits
 const layouts = Array(alignment.cues.length).fill(null);
 for (let n=0;n<alignment.cues.length;n++) {
  const cue=alignment.cues[n];
  if(!cue.lyric.trim() || cue.lyric.trim()==='—' || cue.velocity===0)continue;
  const chars=[...cue.lyric.trim()].filter(c=>!(/\s/u).test(c));
  if(!chars.length || chars.length>MAX_SYLLABLES_PER_NOTE || chars.some(c=>!(c>='가'&&c<='힣')))continue;
  const parts=plan.segments.filter(s=>s.cueIndex===n+1);
  const grouped=Array.from({length:chars.length},()=>[]);
  const ids=new Set();
  for(const s of parts){
   const match=/^c(\d+)-u(\d+)-p(\d+)$/.exec(s.id||'');
   if(!match || Number(match[1])!==n || Number(match[2])>=chars.length ||
      chars[Number(match[2])]!==s.syllable)
    throw Error(`${n+1}번 음표의 저장된 발음 구간이 가사와 일치하지 않습니다. 발음 계획을 재생성해 주세요.`);
   if(ids.has(s.id))throw Error(`${n+1}번 음표의 발음 구간 ID가 중복됐습니다.`);
   ids.add(s.id);
   grouped[Number(match[2])].push(s);
  }
  if(grouped.some(g=>!g.length||!g.some(s=>s.kind==='nucleus'||s.kind==='text')))
   throw Error(`${n+1}번 음표의 발음 타임라인에 중성이 없습니다. 다시 생성해 주세요.`);
  const first=Math.round(cue.startSec*RATE),last=Math.round(cue.endSec*RATE),length=last-first;
  const fragments=[];
  for(let j=0;j<grouped.length;j++){
   const g=grouped[j];
   for(const part of g){
    const start=Math.max(0,Math.min(length,Math.round(part.startSec*RATE)-first));
    const end=Math.max(0,Math.min(length,Math.round(part.endSec*RATE)-first));
    if(end>start)fragments.push({start,end,kind:part.kind,syllableIndex:j});
   }
  }
  // Never process an unsorted layout created by malformed/reordered IDs.
  // The editable plan validator already rejects overlapping times.
  for(let k=1;k<fragments.length;k++)if(fragments[k].start<fragments[k-1].end)
   throw Error(`${n+1}번 음표의 음절 순서가 잘못되었습니다.`);
  layouts[n]=fragments;
 }
 return layouts;
}

// Smooth a spectral transition at the start of a user-timed nucleus. The
// oscillator phase itself is never reset, keeping MIDI pitch continuous.
function guidedSpectrumSample(spectra,fragment,offset,phase){
 const curr=spectra[fragment.syllableIndex];
 const prev=spectra[Math.max(0,fragment.syllableIndex-1)];
 const frames=Math.max(1,Math.min(Math.round(0.014*RATE),Math.floor((fragment.end-fragment.start)/3)));
 const t=fragment.kind==='nucleus' && fragment.syllableIndex>0
  ? Math.min(1,Math.max(0,(offset-fragment.start)/frames)) : 1;
 const blend=t*t*(3-2*t);
 let value=0;
 for(let j=0;j<curr.length;j++){
  const [k,w]=curr[j];
  value+=(prev[j][1]*(1-blend)+w*blend)*Math.sin(k*phase);
 }
 return value;
}

/** Select a contiguous range of MIDI cue indices (1-based), without editing
 * the source alignment or its saved phoneme timing. Selection boundaries use
 * the original musical timeline; exported WAV begins at time zero.
 */
export function resolveGuideCueRange(alignment, startCue, endCue) {
 validateGuideCues(alignment,{startCue,endCue});
 const count=alignment.cues.length;
 if (!Number.isInteger(startCue) || !Number.isInteger(endCue) ||
     startCue<1 || startCue>count || endCue<startCue || endCue>count)
  throw Error('미리 듣기 음표 범위가 올바르지 않습니다. 시작과 끝 음표를 다시 선택하세요.');
 const cues=alignment.cues.slice(startCue-1,endCue);
 const startSec=Math.min(...cues.map(c=>c.startSec));
 const endSec=Math.max(...cues.map(c=>c.endSec));
 if (!Number.isFinite(startSec)||!Number.isFinite(endSec)||endSec<=startSec)
  throw Error('미리 듣기 음표 시간 범위가 올바르지 않습니다.');
 return {startCue,endCue,startSec,endSec,count:cues.length};
}

/** Offline, read-only subset preview. Cues outside the selection are omitted
 * even if they overlap the chosen notes. Phoneme segments retain their global
 * cue indices, so manual timing remains identical to full-song rendering.
 */
export function renderOfflineVocalGuideSelection(alignment, phonemePlan, startCue, endCue) {
 const range=resolveGuideCueRange(alignment,startCue,endCue);
 return renderOfflineVocalGuide(alignment,phonemePlan,range);
}

export function renderOfflineVocalGuide(alignment, phonemePlan = null, selection = null) {
 const duration = validateGuideCues(alignment,selection);
 // Validate the entire supplied saved plan, not just selected notes. This
 // prevents a broken/stale plan from silently falling back during previews.
 const timedLayouts=phonemePlan ? guidePhonemeTiming(alignment,phonemePlan,selection) : null;
 if(selection) {
  const verified=resolveGuideCueRange(alignment,selection.startCue,selection.endCue);
  if(selection.startSec!==verified.startSec||selection.endSec!==verified.endSec||
     selection.count!==verified.count)
   throw Error('미리 듣기 음표 범위가 변경되었습니다. 다시 선택하세요.');
 }
 let timedCues=0;
 const samples = new Float32Array(Math.ceil(duration * RATE));
 let sung = 0;
 for (const [cueIndex,cue] of alignment.cues.entries()) {
  if (selection && (cueIndex < selection.startCue-1 || cueIndex >= selection.endCue)) continue;
  if (!cue.lyric.trim() || cue.lyric.trim() === '—' || cue.velocity === 0) continue;
  const f0 = 440 * Math.pow(2, (cue.pitch - 69) / 12);
  const syllables=guideSyllableSequence(cue.lyric);
  const vowelSequence=syllables.map(s=>s.vowel);
  const timed=timedLayouts?.[cueIndex];
  if(timed)timedCues++;
  // Precompute the spectrum once per vowel. All spectra have the same harmonic
  // count for this note, so transitions can blend weights without resetting
  // oscillator phase (which would create audible boundary clicks).
  const spectra=vowelSequence.map(v=>vowelHarmonics(f0,v));
  const first = Math.round(cue.startSec * RATE);
  const last = Math.min(samples.length, Math.round(cue.endSec * RATE));
  const length = last - first;
  if (length <= 0) continue;
  sung++;
  const attack = Math.max(1, Math.min(length / 3, Math.round(0.018 * RATE)));
  const release = Math.max(1, Math.min(length / 3, Math.round(0.045 * RATE)));
  let phase = 0;
  let timedIndex=0;
  for (let i = 0; i < length; i++) {
   const seconds = i / RATE;
   // Short onset and release avoid clicks; delayed mild vibrato is only a
   // synthetic guide, not a learned vocal performance.
   const envelope = Math.min(1, i / attack, (length - 1 - i) / release);
   const vibrato = seconds < 0.18 ? 0 : 0.003 * Math.sin(TAU * 5.1 * (seconds - 0.18));
   phase += TAU * f0 * (1 + vibrato) / RATE;
   let shaped=0;
   if(timed){
    // The saved onset/nucleus/coda intervals decide when the synthetic guide
    // sounds, including intentional silence in manually created timing gaps.
    while(timedIndex<timed.length && i>=timed[timedIndex].end)timedIndex++;
    const part=timed[timedIndex];
    if(part && i>=part.start){
     const base=guidedSpectrumSample(spectra,part,i,phase);
     if(part.kind==='onset'){
      const onset=consonantHint(syllables[part.syllableIndex].onset,phase,i,cueIndex,
       part.syllableIndex,i-part.start,part.end-part.start);
      shaped=base*0.34*onset.gain+onset.add;
     }else if(part.kind==='coda'){
      const progress=(i-part.start)/Math.max(1,part.end-part.start);
      shaped=base*(0.58-0.35*progress); // no fabricated final-consonant speech
     }else shaped=base;
     // Avoid clicks on silence-to-sound gaps edited into the phoneme plan.
     const previous=timed[timedIndex-1],following=timed[timedIndex+1];
     const fade=Math.max(1,Math.round(0.003*RATE));
     if(!previous||previous.end<part.start)shaped*=Math.min(1,(i-part.start)/fade);
     if(!following||following.start>part.end)shaped*=Math.min(1,(part.end-1-i)/fade);
    }
   }else{
    // Legacy/evenly split guide path stays unchanged for projects without a
    // saved phoneme timeline and for notes with unsupported Latin symbols.
    const position=((i+0.5)/length)*vowelSequence.length;
    const part=Math.min(vowelSequence.length-1,Math.floor(position));
    const fraction=position-part;
    const t=part+1<vowelSequence.length ? Math.max(0,Math.min(1,(fraction-0.8)/0.2)) : 0;
    const blend=t*t*(3-2*t);
    const spectrum=spectra[part],next=spectra[Math.min(part+1,spectra.length-1)];
    let value=0;
    for(let j=0;j<spectrum.length;j++) {
     const [k,weight]=spectrum[j];
     value+=(weight+(next[j][1]-weight)*blend)*Math.sin(k*phase);
    }
    const segmentBegin=Math.floor(part*length/syllables.length);
    const segmentEnd=Math.floor((part+1)*length/syllables.length);
    const onset=consonantHint(syllables[part].onset, phase, i, cueIndex, part,
     i-segmentBegin, segmentEnd-segmentBegin);
    shaped=value*onset.gain+onset.add;
   }
   samples[first + i] += shaped * 0.72 *
    (cue.velocity / 127) * Math.max(0, envelope);
  }
 }
 // Bound the sum of overlapping notes; intentional silence remains zero.
 for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * 1.15);
 // Crop only after rendering the original musical phase and envelopes.
 // Unlike reindexing MIDI cues this keeps saved jamo times and phase intact.
 const startFrame=selection ? Math.round(selection.startSec*RATE) : 0;
 const endFrame=selection ? Math.min(samples.length,Math.round(selection.endSec*RATE)) : samples.length;
 if(endFrame<=startFrame)throw Error('선택한 음표가 너무 짧아 WAV로 만들 수 없습니다.');
 const pcm=selection?samples.subarray(startFrame,endFrame):samples;
 const wav=pcmMonoToWav(pcm);
 return {blob:new Blob([wav],{type:'audio/wav'}),rendered:sung,
  seconds:selection?pcm.length/RATE:duration,
  kind:selection?'offline-formant-guide-selection':'offline-formant-guide',
  sampleRate:RATE,timedCues,
  ...(selection?{selection:{...selection,startFrame,endFrame}}:{})};
}
