import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReferencePcm,createReferenceReport,referenceRights,validateReferenceReport,compareReferenceReports,REFERENCE_ANALYSIS_LIMITS} from '../src/lib/referenceMusicAnalysis.js';
import {createLearningRights,canUseLearningAsset} from '../src/lib/learningRights.js';

const rights=referenceRights('test');
const args={label:'Local Reference',rights,samples:new Float32Array(8000),sampleRate:8000};
function example(){const samples=new Float32Array(8000);samples.fill(.4,1000,7000);return analyzeReferencePcm({...args,samples});}

test('Reference rights allow analysis but deny both training purposes',()=>{assert.equal(canUseLearningAsset(rights,'reference-analysis'),true);assert.equal(canUseLearningAsset(rights,'style-learning'),false);assert.equal(canUseLearningAsset(rights,'model-training'),false);});
test('silence makes no false musical claims',()=>{const r=analyzeReferencePcm(args);assert.equal(r.descriptors.rms,0);assert.equal(r.descriptors.activeFraction,0);assert.equal(r.descriptors.energyCurve.length,32);assert.deepEqual(r.unavailable,['bpm','key','chords','melody','genre','instrumentation','arrangement']);});
test('report is marked non-training and contains no PCM',()=>{const r=example();assert.equal(r.type,'reference-signal-report');assert.equal(r.trainingAllowed,false);assert.equal(r.trainingPerformed,false);assert.equal(r.audioIncluded,false);assert.doesNotMatch(JSON.stringify(r),/samples|arrayBuffer/);});
test('sample energy and active fraction are meaningful',()=>{const r=example();assert.equal(r.descriptors.peak,0.4);assert.ok(r.descriptors.activeFraction>0.5);assert.ok(r.descriptors.energyCurve[16]>0.39);});
test('stereo input analysis',()=>{const r=analyzeReferencePcm({...args,samples:new Float32Array(16000).fill(0.2),channels:2});assert.equal(r.descriptors.durationSeconds,1);assert.ok(r.descriptors.rms>0);});
test('refuses unconsented reference rights',()=>assert.throws(()=>analyzeReferencePcm({...args,rights:createLearningRights({category:'reference-only'})}),/permission/));
test('refuses rights for training even with consent',()=>assert.throws(()=>analyzeReferencePcm({...args,rights:createLearningRights({category:'self-created',consentConfirmed:true})}),/reference-only/));
test('rejects undefined label',()=>assert.throws(()=>analyzeReferencePcm({...args,label:undefined}),/label/));
test('rejects oversized label',()=>assert.throws(()=>analyzeReferencePcm({...args,label:'a'.repeat(201)}),/label/));
test('rejects non typed array',()=>assert.throws(()=>analyzeReferencePcm({...args,samples:[1]}),/PCM/));
test('rejects truncated multichannel frames',()=>assert.throws(()=>analyzeReferencePcm({...args,samples:new Float32Array(3),channels:2}),/limits/));
test('rejects samples beyond cap',()=>assert.throws(()=>analyzeReferencePcm({...args,samples:new Float32Array(REFERENCE_ANALYSIS_LIMITS.maxInterleavedSamples+1)}),/oversized/));
test('rejects 301 seconds',()=>assert.throws(()=>analyzeReferencePcm({...args,samples:new Float32Array(8000*301)}),/limits/));
test('rejects NaNs',()=>assert.throws(()=>analyzeReferencePcm({...args,samples:new Float32Array([NaN])}),/Nonfinite/));
test('rejects invalid analysis shape',()=>assert.throws(()=>createReferenceReport({label:'x',rights,analysis:{analysisType:'signal-energy-only',durationSeconds:2,peak:1,rms:1,windows:[],activeRegions:[{startSeconds:0,endSeconds:3}]}}),/active region/));
test('rejects non-contiguous or unordered time windows',()=>assert.throws(()=>createReferenceReport({label:'x',rights,analysis:{analysisType:'signal-energy-only',durationSeconds:2,peak:1,rms:1,windows:[{startSeconds:1,endSeconds:2,rms:1},{startSeconds:0,endSeconds:1,rms:1}],activeRegions:[]}}),/window/));
test('report validation round-trips JSON',()=>assert.equal(validateReferenceReport(JSON.parse(JSON.stringify(example()))),true));
test('tampering training flag is blocked',()=>assert.throws(()=>validateReferenceReport({...example(),trainingAllowed:true}),/identity/));
test('malformed energy descriptors blocked',()=>assert.throws(()=>validateReferenceReport({...example(),descriptors:{...example().descriptors,energyCurve:[-1]}}),/descriptors/));
test('comparison of same signal is zero, no inferred similarity',()=>{const x=example();const c=compareReferenceReports(x,x);assert.equal(c.meanEnergyCurveDistance,0);assert.equal(c.rmsDifference,0);assert.equal(c.similarityScore,null);});
test('comparison exposes signed descriptor differences',()=>{const c=compareReferenceReports(example(),analyzeReferencePcm(args));assert.ok(c.rmsDifference<0);assert.ok(c.meanEnergyCurveDistance>0);});
test('comparison rejects style-training profile instead of treating as reference',()=>assert.throws(()=>compareReferenceReports(example(),{type:'my-music-style'}),/identity/));
test('time-weighted bins work when windows span several bins',()=>{const analysis={analysisType:'signal-energy-only',durationSeconds:1,peak:1,rms:1,windows:[{startSeconds:0,endSeconds:1,rms:1}],activeRegions:[{startSeconds:0,endSeconds:1}]};const r=createReferenceReport({label:'x',rights,analysis});assert.ok(r.descriptors.energyCurve.every(v=>v===1));});
