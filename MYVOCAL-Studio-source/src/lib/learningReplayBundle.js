// Step60: portable, verifiable LOCAL recipe for reproducing Step55–59 symbolic MIDI.
// The JSON contains sanitized aggregate descriptors, never raw audio, project files or AI weights.
import {composeStyleSketch} from './styleComposition.js';
import {arrangeStyleSketch,exportArrangementMidi} from './styleArrangement.js';
import {applyReferenceEnergyGuide} from './referenceArrangementGuide.js';
import {applyReferenceDensityGuide} from './referenceDensityGuide.js';
import {validateReferenceReport} from './referenceMusicAnalysis.js';

const isInt=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const PARTS=['melody','bass','chords','drums'];
export const REPLAY_MAX_JSON_BYTES=120*1024;
const enc=new TextEncoder();
const safeName=(s)=>typeof s==='string'&&s.trim()&&s.length<=200;
const exactKeys=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));

function safeProfile(value){
  if(!value||value.type!=='my-music-style'||value.schemaVersion!==1||value.trainingPerformed!==false||
      typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)||
      !Array.isArray(value.sources)||!value.sources.length||value.sources.length>1000)throw Error('Invalid rights-cleared style profile');
  const d=value.descriptors;
  if(!d||!finite(d.meanPeak,0,100)||!finite(d.meanRms,0,100)||!finite(d.activeFraction,0,1))throw Error('Invalid profile statistics');
  const seen=new Set();
  const sources=value.sources.map(s=>{
    if(!s||typeof s.musicId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(s.musicId)||
      typeof s.sha256!=='string'||!/^[a-fA-F0-9]{64}$/.test(s.sha256)||seen.has(s.musicId))throw Error('Invalid or repeated music source');
    seen.add(s.musicId);return {musicId:s.musicId,sha256:s.sha256.toLowerCase()};
  });
  if(value.sourceCount!==undefined&&value.sourceCount!==sources.length)throw Error('Style profile source count mismatch');
  return {schemaVersion:1,type:'my-music-style',id:value.id,name:safeName(value.name)?value.name.trim():value.id,
    trainingPerformed:false,sourceCount:sources.length,sources,
    descriptors:{meanPeak:d.meanPeak,meanRms:d.meanRms,activeFraction:d.activeFraction}};
}
function safeReference(value){
  validateReferenceReport(value);
  const d=value.descriptors;
  // The only information needed by either Reference guide is the 32-bin energy envelope.
  if(d.energyCurve.some(v=>v>100))throw Error('Reference envelope outside bounds');
  return {schemaVersion:1,type:'reference-signal-report',name:value.name.trim(),
    rightsCategory:'reference-only',purpose:'reference-analysis',trainingAllowed:false,
    trainingPerformed:false,audioIncluded:false,
    descriptors:{durationSeconds:d.durationSeconds,peak:d.peak,rms:d.rms,
      activeFraction:d.activeFraction,energyCurve:[...d.energyCurve]}};
}
function cleanOptions(o){
  if(!o||!isInt(o.seed,0,0xffffffff)||!isInt(o.bpm,40,240)||!isInt(o.bars,1,64)||
     !isInt(o.rootMidi,36,84)||!['major','minor'].includes(o.scale)||
     !['simple','balanced','full'].includes(o.complexity)||!Array.isArray(o.parts)||
     o.parts.length<1||o.parts.length>4||new Set(o.parts).size!==o.parts.length||
     o.parts.some(p=>!PARTS.includes(p)))throw Error('Invalid replay composition options');
  if(typeof o.velocityGuide!=='boolean'||typeof o.densityGuide!=='boolean'||
      !isInt(o.velocityStrength,0,100)||!isInt(o.densityStrength,0,100))throw Error('Invalid replay guidance options');
  return {seed:o.seed,bpm:o.bpm,bars:o.bars,rootMidi:o.rootMidi,scale:o.scale,
    complexity:o.complexity,parts:PARTS.filter(p=>o.parts.includes(p)),
    velocityGuide:o.velocityGuide,densityGuide:o.densityGuide,
    velocityStrength:o.velocityStrength,densityStrength:o.densityStrength};
}
function run(profile,reference,options){
  if((options.velocityGuide||options.densityGuide)&&!reference)throw Error('Reference report required for enabled guidance');
  const sketch=composeStyleSketch({profile,seed:options.seed,bpm:options.bpm,bars:options.bars,rootMidi:options.rootMidi,scale:options.scale});
  let arrangement=arrangeStyleSketch({sketch,profile,parts:options.parts,complexity:options.complexity});
  if(options.velocityGuide)arrangement=applyReferenceEnergyGuide({arrangement,referenceReport:reference,strength:options.velocityStrength});
  if(options.densityGuide)arrangement=applyReferenceDensityGuide({arrangement,referenceReport:reference,strength:options.densityStrength});
  return {arrangement,bytes:exportArrangementMidi(arrangement)};
}
async function sha256(bytes){
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 requires local WebCrypto support');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function summary(arrangement){return arrangement.tracks.map(t=>({part:t.part,notes:t.notes.length}));}
/** Build a reproducible, untrained symbolic MIDI package; no original reference sound is included. */
export async function createLearningReplayBundle({profile,referenceReport=null,options}={}){
  const safeP=safeProfile(profile),safeR=referenceReport?safeReference(referenceReport):null;
  const safeO=cleanOptions(options);
  const {arrangement,bytes}=run(safeP,safeR,safeO);
  const bundle={schemaVersion:1,type:'local-learning-midi-replay',mode:'symbolic-preset-not-ai',
    trainingPerformed:false,referenceTrainingAllowed:false,sourceAudioIncluded:false,projectModified:false,
    styleProfile:safeP,referenceReport:safeR,options:safeO,
    result:{midiSha256:await sha256(bytes),recipeSha256:await sha256(enc.encode(JSON.stringify({profile:safeP,reference:safeR,options:safeO}))),
      midiBytes:bytes.length,trackSummary:summary(arrangement)}};
  if(enc.encode(JSON.stringify(bundle)).length>REPLAY_MAX_JSON_BYTES)throw Error('Replay JSON exceeds limit');
  return {bundle,bytes,arrangement};
}
/** Verify and regenerate rather than trusting cached MIDI or externally supplied track summaries. */
export async function verifyLearningReplayBundle(input){
  if(!input||typeof input!=='object'||enc.encode(JSON.stringify(input)).length>REPLAY_MAX_JSON_BYTES)
    throw Error('Invalid or oversized replay JSON');
  if(input.schemaVersion!==1||input.type!=='local-learning-midi-replay'||input.mode!=='symbolic-preset-not-ai'||
     input.trainingPerformed!==false||input.referenceTrainingAllowed!==false||
     input.sourceAudioIncluded!==false||input.projectModified!==false)throw Error('Replay permissions or format mismatch');
  if(!exactKeys(input,['schemaVersion','type','mode','trainingPerformed','referenceTrainingAllowed','sourceAudioIncluded','projectModified','styleProfile','referenceReport','options','result'])||
     !exactKeys(input.styleProfile,['schemaVersion','type','id','name','trainingPerformed','sourceCount','sources','descriptors'])||
     !exactKeys(input.styleProfile.descriptors,['meanPeak','meanRms','activeFraction'])||
     !input.styleProfile.sources.every(s=>exactKeys(s,['musicId','sha256']))||
     !exactKeys(input.options,['seed','bpm','bars','rootMidi','scale','complexity','parts','velocityGuide','densityGuide','velocityStrength','densityStrength'])||
     !exactKeys(input.result,['midiSha256','recipeSha256','midiBytes','trackSummary'])||
     (input.referenceReport!==null&&(!exactKeys(input.referenceReport,['schemaVersion','type','name','rightsCategory','purpose','trainingAllowed','trainingPerformed','audioIncluded','descriptors'])||
     !exactKeys(input.referenceReport.descriptors,['durationSeconds','peak','rms','activeFraction','energyCurve']))))throw Error('Unexpected fields in replay JSON');
  const p=safeProfile(input.styleProfile),r=input.referenceReport===null?null:safeReference(input.referenceReport),o=cleanOptions(input.options);
  if(!input.result||typeof input.result.midiSha256!=='string'||!/^[0-9a-f]{64}$/.test(input.result.midiSha256)||
     !isInt(input.result.midiBytes,0,10_000_000)||typeof input.result.recipeSha256!=='string'||
     !/^[0-9a-f]{64}$/.test(input.result.recipeSha256)||!Array.isArray(input.result.trackSummary))throw Error('Invalid replay result manifest');
  const {bytes,arrangement}=run(p,r,o);
  const hash=await sha256(bytes);
  const recipeHash=await sha256(enc.encode(JSON.stringify({profile:p,reference:r,options:o})));
  if(recipeHash!==input.result.recipeSha256||hash!==input.result.midiSha256||bytes.length!==input.result.midiBytes||
      JSON.stringify(summary(arrangement))!==JSON.stringify(input.result.trackSummary))throw Error('Replay verification mismatch: edited inputs or result checksum');
  return {bundle:input,bytes,arrangement,verified:true};
}
