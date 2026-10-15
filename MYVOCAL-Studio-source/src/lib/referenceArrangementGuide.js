// Step58: reference-only energy contour for a NEW preset-generated arrangement.
// Uses no pitch, beat, notes, melody or other source audio. NEVER training or copying source events.
import {validateReferenceReport} from './referenceMusicAnalysis.js';

const int=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const PARTS=new Set(['melody','bass','chords','drums']);
const round=n=>Math.round(n*10000)/10000;

/** Adjust note VELOCITIES ONLY against a validated reference report's coarse energy curve.
 * Strength 0: return detached unaltered notes; 100: strongest bounded 0.65..1.25 multiplier.
 * No reference notes/timing/harmony are present in reports or transferred here.
 */
export function applyReferenceEnergyGuide({arrangement,referenceReport,strength=65}={}) {
  validateReferenceReport(referenceReport);
  if(!int(strength,0,100))throw new Error('Reference guidance strength must be integer 0–100');
  if(!arrangement || arrangement.schemaVersion!==1 || arrangement.type!=='deterministic-style-arrangement' ||
     arrangement.modelInferencePerformed!==false || arrangement.styleTrainingPerformed!==false ||
     !int(arrangement.bars,1,64) || !int(arrangement.bpm,40,240) ||
     arrangement.ticksPerQuarter!==480 || !Array.isArray(arrangement.tracks) ||
     !int(arrangement.tracks.length,1,4)) throw new Error('Invalid Step56 arrangement');
  const totalTicks=arrangement.bars*1920;
  const curve=referenceReport.descriptors.energyCurve;
  const average=curve.reduce((a,b)=>a+b,0)/curve.length;
  const gainAt=tick=>{
    if(!average || strength===0)return 1;
    const pos=clamp(tick/totalTicks*32-.5,0,31);
    const lo=Math.floor(pos),hi=Math.min(31,lo+1),fraction=pos-lo;
    const value=curve[lo]*(1-fraction)+curve[hi]*fraction;
    const ratio=clamp(value/average,0,2.5);
    const fullGain=clamp(0.75+0.45*(ratio-1),0.65,1.25);
    return 1+(fullGain-1)*strength/100;
  };
  const seen=new Set();
  const tracks=arrangement.tracks.map(track=>{
    if(!track||!PARTS.has(track.part)||seen.has(track.part)||!Array.isArray(track.notes)||track.notes.length>8192)throw new Error('Invalid arrangement track');
    seen.add(track.part);
    const notes=track.notes.map(n=>{
      if(!n||!int(n.startTick,0,totalTicks-1)||!int(n.durationTicks,1,1920)||!int(n.midiNote,0,127)||!int(n.velocity,1,127))throw new Error('Invalid arrangement note');
      return Object.freeze({...n,velocity:clamp(Math.round(n.velocity*gainAt(n.startTick+n.durationTicks/2)),1,127)});
    });
    return Object.freeze({...track,notes:Object.freeze(notes)});
  });
  return Object.freeze({...arrangement,tracks:Object.freeze(tracks),
    referenceGuidance:Object.freeze({type:'reference-energy-velocity-only',sourceName:referenceReport.name,
      strength,curveBins:32,referenceTrainingAllowed:false,sourceAudioIncluded:false,
      appliedTo:'velocity-only',minMultiplier:round(1+(0.65-1)*strength/100),maxMultiplier:round(1+(1.25-1)*strength/100)}),
    modelInferencePerformed:false,styleTrainingPerformed:false});
}
