// Step57: offline-only reference-analysis reports. These reports are not training data.
import { analyzeMusicStructure } from './musicStructureAnalysis.js';
import { assertLearningPermission, createLearningRights } from './learningRights.js';
import {analyzeOwnedMusicTempoTonal8} from './ownedMusicTempoTonal8.js';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const round = n => Math.round(n * 1000000) / 1000000;
const MAX_SECONDS = 300;
const MAX_SAMPLES = 12_000_000;
export const REFERENCE_ANALYSIS_LIMITS = Object.freeze({maxFileBytes:30*1024*1024, maxSeconds:MAX_SECONDS, maxInterleavedSamples:MAX_SAMPLES});

export function referenceRights(sourceLabel = '') {
  return createLearningRights({category:'reference-only',consentConfirmed:true,sourceLabel});
}

function checkMetadata({label, rights}) {
  if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new Error('Reference label must be 1–200 characters');
  // Even a training-authorized source must be explicitly classified as reference-only in this workflow.
  if (rights?.category !== 'reference-only') throw new Error('Reference mode requires reference-only material');
  assertLearningPermission(rights,'reference-analysis');
}

function describe(analysis) {
  if (!analysis || analysis.analysisType !== 'signal-energy-only' || !finite(analysis.durationSeconds) || analysis.durationSeconds < 0 || analysis.durationSeconds > MAX_SECONDS || !finite(analysis.peak) || analysis.peak < 0 || !finite(analysis.rms) || analysis.rms < 0 || !Array.isArray(analysis.windows) || !Array.isArray(analysis.activeRegions)) throw new Error('Invalid reference analysis');
  const duration = analysis.durationSeconds;
  const bins = new Array(32).fill(0);
  const weights = new Array(32).fill(0);
  let previousEnd = 0;
  for (const w of analysis.windows) {
    if (!w || !finite(w.startSeconds) || !finite(w.endSeconds) || !finite(w.rms) || w.rms < 0 || w.startSeconds < previousEnd - 1e-8 || w.endSeconds <= w.startSeconds || w.endSeconds > duration + 1e-8) throw new Error('Invalid energy window');
    previousEnd = w.endSeconds;
    // Time-weighted per-bin RMS energy. Split windows along bin boundaries to prevent sampling bias.
    if (duration === 0) throw new Error('Nonempty windows for empty audio');
    let index = Math.min(31,Math.floor(w.startSeconds/duration*32));
    while (index < 32) {
      const overlap = Math.min(w.endSeconds, (index+1)*duration/32) - Math.max(w.startSeconds,index*duration/32);
      if (overlap > 0) { bins[index] += w.rms*w.rms*overlap; weights[index] += overlap; }
      if (w.endSeconds <= (index+1)*duration/32 + 1e-10) break;
      index++;
    }
  }
  let activeSeconds = 0, lastEnd = 0;
  for (const r of analysis.activeRegions) {
    if (!r || !finite(r.startSeconds) || !finite(r.endSeconds) || r.startSeconds < lastEnd || r.endSeconds <= r.startSeconds || r.endSeconds > duration + 1e-8) throw new Error('Invalid active region');
    activeSeconds += r.endSeconds - r.startSeconds; lastEnd = r.endSeconds;
  }
  return Object.freeze({durationSeconds:round(duration),peak:round(analysis.peak),rms:round(analysis.rms),activeFraction:duration ? round(activeSeconds/duration) : 0,energyCurve:Object.freeze(bins.map((v,i)=>round(weights[i] ? Math.sqrt(v/weights[i]) : 0)))});
}

export function createReferenceReport({label,rights,analysis,rhythmTonal=null}) {
  checkMetadata({label,rights});
  const descriptors = describe(analysis);
  return Object.freeze({schemaVersion:1,type:'reference-signal-report',name:label.trim(),rightsCategory:'reference-only',purpose:'reference-analysis',trainingAllowed:false,trainingPerformed:false,descriptors,
    ...(rhythmTonal?{referenceRhythmTonal8:rhythmTonal}:{}),
    unavailable:Object.freeze([
     ...(rhythmTonal?.rhythm.estimatedBpm?[]:['confident-inferred-bpm']),
     ...(rhythmTonal?.tonality.estimatedKey?[]:['confident-inferred-key']),
     'chords','melody','genre','instrumentation','arrangement'
    ]),audioIncluded:false});
}

export function analyzeReferencePcm({label,rights,samples,sampleRate,channels=1,includeTempoKey=false,signal=null}) {
  checkMetadata({label,rights});
  if (!(samples instanceof Float32Array || samples instanceof Float64Array) || samples.length>MAX_SAMPLES) throw new Error('Invalid or oversized reference PCM');
  if (!Number.isInteger(sampleRate) || sampleRate<8000 || sampleRate>384000 || !Number.isInteger(channels) || channels<1 || channels>32 || samples.length%channels || samples.length/channels/sampleRate>MAX_SECONDS) throw new Error('Reference audio exceeds limits');
  const analysis=analyzeMusicStructure({samples,sampleRate,channels,windowSeconds:0.25});
  let rhythmTonal=null;
  if(includeTempoKey){
   const duration=samples.length/channels/sampleRate;
   if(duration>=8){
    const rate=16000,frames=Math.floor(duration*rate);
    if(frames>rate*MAX_SECONDS)
     throw Error('Reference PCM 분석 길이가 5분을 초과합니다.');
    const pcm=new Float32Array(frames);
    for(let i=0;i<frames;i++){
     if(i%32000===0&&signal?.aborted)throw Error('Reference PCM 분석이 취소됐습니다.');
     const exact=i*sampleRate/rate,at=Math.min(Math.floor(exact),samples.length/channels-1),
      next=Math.min(at+1,samples.length/channels-1),part=exact-at;
     let sum=0;
     for(let ch=0;ch<channels;ch++)
      sum+=samples[at*channels+ch]*(1-part)+samples[next*channels+ch]*part;
     pcm[i]=sum/channels;
    }
    rhythmTonal=analyzeOwnedMusicTempoTonal8(pcm,rate,{signal,referenceOnly:true});
   }
  }
  return createReferenceReport({label,rights,analysis,rhythmTonal});
}

export function validateReferenceReport(report) {
  if (!report || report.type!=='reference-signal-report' || report.schemaVersion!==1 || report.rightsCategory!=='reference-only' || report.purpose!=='reference-analysis' || report.trainingAllowed!==false || report.trainingPerformed!==false || report.audioIncluded!==false || typeof report.name!=='string' || !report.name.trim() || report.name.length>200) throw new Error('Invalid reference report identity');
  const d=report.descriptors;
  if (!d || !finite(d.durationSeconds) || d.durationSeconds<0 || d.durationSeconds>MAX_SECONDS || !finite(d.peak) || d.peak<0 || !finite(d.rms) || d.rms<0 || !finite(d.activeFraction) || d.activeFraction<0 || d.activeFraction>1 || !Array.isArray(d.energyCurve) || d.energyCurve.length!==32 || d.energyCurve.some(v=>!finite(v)||v<0)) throw new Error('Invalid reference report descriptors');
  if(report.referenceRhythmTonal8!==undefined){
   const feature=report.referenceRhythmTonal8;
   if(feature?.version!==1||feature.source!=='actual-reference-only-pcm-dsp'||
    feature.neuralTraining!==false||
    (feature.rhythm?.estimatedBpm!==null&&
      (!Number.isInteger(feature.rhythm?.estimatedBpm)||
       feature.rhythm.estimatedBpm<40||feature.rhythm.estimatedBpm>240))||
    (feature.tonality?.chroma12!==null&&
      (!Array.isArray(feature.tonality?.chroma12)||
       feature.tonality.chroma12.length!==12||
       feature.tonality.chroma12.some(x=>!finite(x)||x<0||x>1))))
    throw Error('Reference 음악의 실제 템포·조성 신호 분석 결과가 올바르지 않습니다.');
  }
  return true;
}

export function compareReferenceReports(a,b) {
  validateReferenceReport(a);validateReferenceReport(b);
  const left=a.descriptors, right=b.descriptors;
  const curveDelta=left.energyCurve.reduce((sum,v,i)=>sum+Math.abs(v-right.energyCurve[i]),0)/32;
  return Object.freeze({comparisonType:'signal-descriptors-only',durationDifferenceSeconds:round(right.durationSeconds-left.durationSeconds),rmsDifference:round(right.rms-left.rms),activeFractionDifference:round(right.activeFraction-left.activeFraction),meanEnergyCurveDistance:round(curveDelta),similarityScore:null,trainingPerformed:false});
}
