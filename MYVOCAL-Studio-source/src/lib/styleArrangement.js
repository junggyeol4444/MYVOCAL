// Step56 — deterministic, editable multi-track arrangement for Step55 MIDI sketches.
// Musical harmony and drum patterns are explicit presets, NOT extracted from reference audio.
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PARTS = Object.freeze(['melody', 'bass', 'chords', 'drums']);
const TICKS_PER_BAR = 1920;
const SCALE = Object.freeze({major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10]});
const CHANNELS = Object.freeze({melody:0,bass:1,chords:2,drums:9});
const PROGRAMS = Object.freeze({melody:80,bass:33,chords:0});
const named = (kind) => ({melody:'Lead Sketch',bass:'Preset Bass',chords:'Preset Chords',drums:'Preset Drums'})[kind];

function validateSketch(sketch) {
  if (!sketch || sketch.schemaVersion !== 1 || sketch.type !== 'deterministic-symbolic-sketch' ||
      !isInt(sketch.bpm,40,240) || !isInt(sketch.bars,1,64) || !isInt(sketch.rootMidi,36,84) ||
      !SCALE[sketch.scale] || !Array.isArray(sketch.notes) || sketch.notes.length > 8192 ||
      !isInt(sketch.ticksPerQuarter,480,480) || typeof sketch.profileId !== 'string' ||
      sketch.modelInferencePerformed !== false || sketch.styleTrainingPerformed !== false) throw new Error('Invalid Step55 sketch');
  for (const n of sketch.notes) {
    if (!n || !isInt(n.startTick,0,sketch.bars*TICKS_PER_BAR-1) ||
        !isInt(n.durationTicks,1,TICKS_PER_BAR) || !isInt(n.midiNote,0,127) ||
        !isInt(n.velocity,1,127)) throw new Error('Invalid melody note');
  }
}
function validateProfile(profile, sketch) {
  if (!profile || profile.type !== 'my-music-style' || profile.schemaVersion !== 1 ||
      profile.trainingPerformed !== false || profile.id !== sketch.profileId ||
      !Array.isArray(profile.sources) || profile.sources.length < 1 || !profile.descriptors) throw new Error('Invalid style profile');
  for (const key of ['meanPeak','meanRms','activeFraction']) {
    if (typeof profile.descriptors[key] !== 'number' || !Number.isFinite(profile.descriptors[key]) ||
        profile.descriptors[key] < 0 || profile.descriptors[key] > (key === 'activeFraction' ? 1 : 100)) throw new Error('Invalid energy descriptor');
  }
}
const note = (startTick, durationTicks, midiNote, velocity) => ({startTick,durationTicks,midiNote,velocity});
const scaled = (root, intervals, degree) => root + intervals[((degree%7)+7)%7] + 12 * Math.floor(degree/7);
/** Convert one Step55 sketch to editable MIDI parts. The source notes are preserved exactly. */
export function arrangeStyleSketch({sketch,profile,parts=['melody','bass','chords','drums'],complexity='balanced'}={}) {
  validateSketch(sketch); validateProfile(profile,sketch);
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > PARTS.length ||
      parts.some(p=>!PARTS.includes(p)) || new Set(parts).size !== parts.length ||
      !['simple','balanced','full'].includes(complexity)) throw new Error('Invalid arrangement options');
  const {bars,rootMidi,scale,bpm} = sketch;
  const intervals = SCALE[scale];
  const energy = clamp(profile.descriptors.meanRms,0,1);
  const activity = clamp(profile.descriptors.activeFraction,0,1);
  const vel = clamp(Math.round(52+energy*55),40,112);
  const pattern = [0,5,3,4]; // fixed, openly documented I–vi–IV–V (major) / i–VI–iv–V (minor) degree pattern
  const tracks=[];
  for (const part of PARTS.filter(p=>parts.includes(p))) {
    const notes=[];
    if (part==='melody') {
      notes.push(...sketch.notes.map(n=>note(n.startTick,n.durationTicks,n.midiNote,n.velocity)));
    } else if (part==='bass') {
      for (let bar=0;bar<bars;bar++) {
        const pitch=scaled(rootMidi-24,intervals,pattern[bar%4]);
        const beats=complexity==='simple'?[0]:complexity==='balanced'?[0,2]:[0,1,2,3];
        for(const beat of beats) notes.push(note(bar*TICKS_PER_BAR+beat*480,complexity==='simple'?1800:420,pitch,vel));
      }
    } else if (part==='chords') {
      for(let bar=0;bar<bars;bar++) {
        const root=pattern[bar%4];
        const beats=complexity==='full'?[0,2]:[0];
        for(const beat of beats) for(const offset of [0,2,4]) {
          const pitch=scaled(rootMidi-12,intervals,root+offset);
          notes.push(note(bar*TICKS_PER_BAR+beat*480,complexity==='full'?900:1800,pitch,clamp(vel-13,1,127)));
        }
      }
    } else { // General MIDI percussion; velocity/density derives only from observed signal energy.
      for(let bar=0;bar<bars;bar++) {
        for(let beat=0;beat<4;beat++) {
          const tick=bar*TICKS_PER_BAR+beat*480;
          if(beat===0||beat===2)notes.push(note(tick,100,36,vel));
          if(beat===1||beat===3)notes.push(note(tick,100,38,clamp(vel-5,1,127)));
          if(complexity==='full'||(complexity==='balanced'&&activity>=0.3)||beat%2===0) {
            notes.push(note(tick,100,42,clamp(vel-16,1,127)));
          }
          if(complexity==='full')notes.push(note(tick+240,100,42,clamp(vel-22,1,127)));
        }
      }
    }
    tracks.push(Object.freeze({part,name:named(part),channel:CHANNELS[part],program:PROGRAMS[part]??null,notes:Object.freeze(notes.map(n=>Object.freeze(n)))}));
  }
  return Object.freeze({schemaVersion:1,type:'deterministic-style-arrangement',profileId:profile.id,
    bpm,bars,ticksPerQuarter:480,scale,rootMidi,complexity,tracks:Object.freeze(tracks),
    patternSource:'preset-only',modelInferencePerformed:false,styleTrainingPerformed:false});
}
function variable(n) {
  if(!isInt(n,0,0x0fffffff))throw new Error('Invalid MIDI delta');
  const bytes=[n&0x7f]; while((n=Math.floor(n/128))>0)bytes.unshift((n&0x7f)|0x80);
  return bytes;
}
function header(type,bytes) { const n=bytes.length; return [...type.split('').map(c=>c.charCodeAt(0)),(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255,...bytes]; }
function asciiName(s) {return Array.from(s,c=>c.charCodeAt(0));}
function writeTrack(events) {
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order||a.bytes[1]-b.bytes[1]);
  const out=[];let last=0;
  for(const evt of events){if(evt.tick<last)throw new Error('Unsorted MIDI');out.push(...variable(evt.tick-last),...evt.bytes);last=evt.tick;}
  out.push(0,0xff,0x2f,0);
  return header('MTrk',out);
}
/** Standard MIDI file format 1. Track 0 = conductor, following tracks = individual parts. */
export function exportArrangementMidi(arrangement) {
  if(!arrangement || arrangement.type!=='deterministic-style-arrangement' || arrangement.schemaVersion!==1 ||
      !isInt(arrangement.bpm,40,240) || !isInt(arrangement.bars,1,64) ||
      arrangement.ticksPerQuarter!==480 || !Array.isArray(arrangement.tracks) ||
      arrangement.tracks.length<1 || arrangement.tracks.length>4 ||
      arrangement.modelInferencePerformed!==false || arrangement.styleTrainingPerformed!==false) throw new Error('Invalid arrangement');
  const unique=new Set();
  const tempo=Math.round(60000000/arrangement.bpm);
  const bytes=[...header('MThd',[0,1,0,arrangement.tracks.length+1,1,224])];
  bytes.push(...writeTrack([{tick:0,order:0,bytes:[0xff,0x51,3,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255]},
    {tick:0,order:1,bytes:[0xff,0x58,4,4,2,24,8]}]));
  for(const track of arrangement.tracks) {
    if(!track||!PARTS.includes(track.part)||unique.has(track.part)||track.channel!==CHANNELS[track.part]||
        track.program!==(PROGRAMS[track.part]??null)||!Array.isArray(track.notes)||track.notes.length>8192)throw new Error('Invalid MIDI part');
    unique.add(track.part);
    const label=asciiName(named(track.part));
    const events=[{tick:0,order:0,bytes:[0xff,0x03,label.length,...label]}];
    if(track.program!==null)events.push({tick:0,order:1,bytes:[0xc0|track.channel,track.program]});
    for(const n of track.notes) {
      if(!n||!isInt(n.startTick,0,arrangement.bars*TICKS_PER_BAR-1)||!isInt(n.durationTicks,1,TICKS_PER_BAR)||
          !isInt(n.midiNote,0,127)||!isInt(n.velocity,1,127))throw new Error('Invalid arrangement note');
      events.push({tick:n.startTick,order:3,bytes:[0x90|track.channel,n.midiNote,n.velocity]});
      events.push({tick:n.startTick+n.durationTicks,order:2,bytes:[0x80|track.channel,n.midiNote,0]});
    }
    bytes.push(...writeTrack(events));
  }
  return Uint8Array.from(bytes);
}
