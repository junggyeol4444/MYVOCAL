// Step55: local, deterministic symbolic sketch. This is NOT model inference or learned style transfer.
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function assertProfile(profile) {
  if (!profile || profile.type !== 'my-music-style' || profile.schemaVersion !== 1 || profile.trainingPerformed !== false || !Array.isArray(profile.sources) || !profile.sources.length || !profile.descriptors) throw new Error('Invalid style profile');
  for (const key of ['meanPeak', 'meanRms', 'activeFraction']) if (typeof profile.descriptors[key] !== 'number' || !Number.isFinite(profile.descriptors[key]) || profile.descriptors[key] < 0) throw new Error('Invalid style descriptors');
  if (profile.descriptors.activeFraction > 1) throw new Error('Invalid active fraction');
}
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
export function composeStyleSketch({ profile, seed = 1, bpm = 100, bars = 4, rootMidi = 60, scale = 'major' }) {
  assertProfile(profile);
  if (!integer(seed, 0, 0xffffffff) || !integer(bpm, 40, 240) || !integer(bars, 1, 64) || !integer(rootMidi, 36, 84) || !['major','minor'].includes(scale)) throw new Error('Invalid composition options');
  const random = rng(seed), intervals = scale === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  const density = clamp(profile.descriptors.activeFraction, 0, 1);
  const velocity = Math.round(clamp(55 + profile.descriptors.meanRms * 70, 40, 110));
  const notes = [];
  for (let step = 0; step < bars * 8; step++) {
    // Energy statistics influence rest density and velocity, not inferred pitches/genre.
    if (random() > 0.2 + density * 0.75) continue;
    const degree = Math.floor(random() * intervals.length);
    const pitch = rootMidi + intervals[degree] + (random() < 0.18 ? 12 : 0);
    notes.push(Object.freeze({startTick: step * 240, durationTicks: random() < 0.2 ? 480 : 240, midiNote: pitch, velocity}));
  }
  return Object.freeze({schemaVersion: 1, type: 'deterministic-symbolic-sketch', profileId: profile.id, seed, bpm, bars, rootMidi, scale, ticksPerQuarter: 480, notes: Object.freeze(notes), modelInferencePerformed: false, styleTrainingPerformed: false});
}
function vlq(n) { if (!integer(n, 0, 0x0fffffff)) throw new Error('Invalid delta'); const bytes = [n & 127]; while ((n >>>= 7)) bytes.unshift((n & 127) | 128); return bytes; }
function chunk(tag, bytes) { const n = bytes.length; return [...Buffer.from(tag), (n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255,...bytes]; }
export function exportSketchMidi(sketch) {
  if (!sketch || sketch.type !== 'deterministic-symbolic-sketch' || !integer(sketch.bpm,40,240) || !integer(sketch.bars,1,64) || !Array.isArray(sketch.notes)) throw new Error('Invalid sketch');
  const events = [{tick:0, order:0, bytes:[0xff,0x51,0x03,...[(Math.round(60000000/sketch.bpm)>>>16)&255,(Math.round(60000000/sketch.bpm)>>>8)&255,Math.round(60000000/sketch.bpm)&255]]}];
  for (const note of sketch.notes) {
    if (!note || !integer(note.startTick,0,sketch.bars*1920-1) || !integer(note.durationTicks,1,1920) || !integer(note.midiNote,0,127) || !integer(note.velocity,1,127)) throw new Error('Invalid MIDI note');
    events.push({tick:note.startTick,order:2,bytes:[0x90,note.midiNote,note.velocity]},{tick:note.startTick+note.durationTicks,order:1,bytes:[0x80,note.midiNote,0]});
  }
  events.sort((a,b)=>a.tick-b.tick || a.order-b.order);
  const track=[]; let previous=0;
  for (const e of events) {track.push(...vlq(e.tick-previous),...e.bytes); previous=e.tick;}
  track.push(0,0xff,0x2f,0);
  return Uint8Array.from([...chunk('MThd',[0,1,0,1,1,224]),...chunk('MTrk',track)]);
}
