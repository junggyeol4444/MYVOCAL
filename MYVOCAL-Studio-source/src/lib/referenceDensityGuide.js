// Step59 — optional, deterministic accompaniment thinning from Step57 coarse energy bins.
// Reference-only data is NOT training material; no pitch, beat, rhythm, or source audio is extracted.
import {validateReferenceReport} from './referenceMusicAnalysis.js';

const isInt=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
const PARTS=new Set(['melody','bass','chords','drums']);
const SUPPORT=new Set(['bass','chords','drums']);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const perBar=1920;

function validateArrangement(arrangement){
  if(!arrangement||arrangement.schemaVersion!==1||arrangement.type!=='deterministic-style-arrangement'||
    arrangement.modelInferencePerformed!==false||arrangement.styleTrainingPerformed!==false||
    !isInt(arrangement.bars,1,64)||!isInt(arrangement.bpm,40,240)||arrangement.ticksPerQuarter!==480||
    !Array.isArray(arrangement.tracks)||!isInt(arrangement.tracks.length,1,4))throw new Error('Invalid Step56 arrangement');
  const seen=new Set(),end=arrangement.bars*perBar;
  for(const t of arrangement.tracks){
    if(!t||!PARTS.has(t.part)||seen.has(t.part)||!Array.isArray(t.notes)||t.notes.length>8192)throw new Error('Invalid arrangement track');
    seen.add(t.part);
    for(const n of t.notes)if(!n||!isInt(n.startTick,0,end-1)||!isInt(n.durationTicks,1,perBar)||
      !isInt(n.midiNote,0,127)||!isInt(n.velocity,1,127))throw new Error('Invalid arrangement note');
  }
}

// Never drop melody, drums kick/snare, bass at beat one or bar-opening chord triads.
// Only secondary already-existing accompaniment events are candidates for removal.
function isOptional(part,n){
  const barTick=n.startTick%perBar;
  if(part==='bass')return barTick!==0;
  if(part==='chords')return barTick>=960;
  if(part==='drums')return n.midiNote===42;
  return false;
}

/** Apply coarse, 32-bin reference ENERGY to select existing accompaniment notes to omit.
 * Strength 0 and flat/silent envelopes preserve all events. No notes are added or retimed.
 * Melody and core rhythm anchors survive even in silent reference sections.
 */
export function applyReferenceDensityGuide({arrangement,referenceReport,strength=65,parts=['bass','chords','drums']}={}){
  validateReferenceReport(referenceReport);
  validateArrangement(arrangement);
  if(!isInt(strength,0,100)||!Array.isArray(parts)||parts.length>3||
    new Set(parts).size!==parts.length||parts.some(p=>!SUPPORT.has(p)))throw new Error('Invalid density guidance options');
  const curve=referenceReport.descriptors.energyCurve;
  const avg=curve.reduce((a,b)=>a+b,0)/32;
  const max=Math.max(...curve),min=Math.min(...curve);
  const active=avg>0&&max>min&&strength>0;
  const selected=new Set(parts);
  const total=arrangement.bars*perBar;
  const energyAt=tick=>{
    const index=clamp(Math.floor(tick/total*32),0,31);
    return curve[index];
  };
  const removed={bass:0,chords:0,drums:0};
  const tracks=arrangement.tracks.map(t=>{
    const notes=t.notes.filter(n=>{
      if(!active||!selected.has(t.part)||!isOptional(t.part,n))return true;
      const value=energyAt(n.startTick+n.durationTicks/2);
      const below=clamp((avg-value)/avg,0,1);
      // Retain optional events unless the local coarse energy is markedly below average.
      // Weaker strengths cannot suppress until contrast exceeds the same threshold.
      const threshold=t.part==='drums'?0.25:0.45;
      const keep=below*strength/100<=threshold;
      if(!keep)removed[t.part]++;
      return keep;
    }).map(n=>Object.freeze({...n}));
    return Object.freeze({...t,notes:Object.freeze(notes)});
  });
  const metadata=Object.freeze({type:'reference-energy-density-only',sourceName:referenceReport.name,
    strength,selectedParts:Object.freeze([...parts]),curveBins:32,referenceTrainingAllowed:false,
    sourceAudioIncluded:false,appliedTo:'existing-accompaniment-note-presence-only',
    removedNotes:Object.freeze({...removed}),melodyPreserved:true,coreBeatsPreserved:true});
  return Object.freeze({...arrangement,tracks:Object.freeze(tracks),referenceDensityGuidance:metadata,
    modelInferencePerformed:false,styleTrainingPerformed:false});
}
