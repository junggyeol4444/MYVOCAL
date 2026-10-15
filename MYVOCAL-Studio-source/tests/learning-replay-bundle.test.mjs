import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLearningReplayBundle,verifyLearningReplayBundle,REPLAY_MAX_JSON_BYTES} from '../src/lib/learningReplayBundle.js';
import {composeStyleSketch} from '../src/lib/styleComposition.js';
import {arrangeStyleSketch,exportArrangementMidi} from '../src/lib/styleArrangement.js';
import {applyReferenceEnergyGuide} from '../src/lib/referenceArrangementGuide.js';
import {applyReferenceDensityGuide} from '../src/lib/referenceDensityGuide.js';
import {createReferenceReport,referenceRights} from '../src/lib/referenceMusicAnalysis.js';

const profile={schemaVersion:1,type:'my-music-style',id:'user-style',name:'My Music Style',trainingPerformed:false,
 sourceCount:1,sources:[{musicId:'song-1',sha256:'b'.repeat(64)}],descriptors:{meanPeak:.8,meanRms:.4,activeFraction:.85,totalDurationSeconds:9}};
const analysis={analysisType:'signal-energy-only',durationSeconds:8,peak:1,rms:.5,
 windows:Array.from({length:32},(_,i)=>({startSeconds:i/4,endSeconds:(i+1)/4,rms:i<16?.03:.95})),activeRegions:[{startSeconds:0,endSeconds:8}]};
const reference=createReferenceReport({label:'Reference audio',rights:referenceRights('public reference'),analysis});
const options={seed:42,bpm:124,bars:8,rootMidi:60,scale:'minor',complexity:'full',
 parts:['melody','bass','chords','drums'],velocityGuide:true,densityGuide:true,velocityStrength:70,densityStrength:100};
const clone=o=>JSON.parse(JSON.stringify(o));
const create=(data={})=>createLearningReplayBundle({profile,referenceReport:reference,options,...data});
const fails=async(promise)=>assert.rejects(promise);

test('creates and roundtrips a portable offline JSON recipe',async()=>{
 const {bundle,bytes}=await create();
 const verified=await verifyLearningReplayBundle(clone(bundle));
 assert.equal(verified.verified,true);
 assert.deepEqual(verified.bytes,bytes);
 assert.equal(bundle.type,'local-learning-midi-replay');
 assert.equal(bundle.schemaVersion,1);
});
test('MIDI checksum is the actual standard SHA-256 digest',async()=>{
 const {bundle,bytes}=await create();
 assert.equal(bundle.result.midiSha256,createHash('sha256').update(bytes).digest('hex'));
});
test('MIDI format 1 output has 4 separate part tracks',async()=>{
 const {bytes}=await create();
 const b=Buffer.from(bytes);
 assert.equal(b.toString('ascii',0,4),'MThd');
 assert.equal(b.readUInt16BE(8),1);
 assert.equal(b.readUInt16BE(10),5);
});
test('replay is deterministic across invocations',async()=>{
 const a=await create(),b=await create();
 assert.deepEqual(a.bundle,b.bundle);assert.deepEqual(a.bytes,b.bytes);
});
test('recipe only contains source IDs/hashes and 32 reference bins, never PCM/audio',async()=>{
 const {bundle}=await create();
 assert.equal(bundle.sourceAudioIncluded,false);assert.equal(bundle.referenceTrainingAllowed,false);
 assert.equal(bundle.trainingPerformed,false);assert.equal(bundle.projectModified,false);
 assert.deepEqual(Object.keys(bundle.styleProfile.descriptors).sort(),['activeFraction','meanPeak','meanRms']);
 assert.equal(bundle.referenceReport.descriptors.energyCurve.length,32);
 assert.equal(bundle.referenceReport.audioIncluded,false);
 assert.ok(!JSON.stringify(bundle).includes('windows'));
});
test('reference-only is never changed into an authorized training asset',async()=>{
 const {bundle}=await create();
 assert.equal(bundle.referenceReport.rightsCategory,'reference-only');
 assert.equal(bundle.referenceReport.trainingAllowed,false);
 assert.equal(bundle.referenceReport.trainingPerformed,false);
});
test('matches manually composed existing Step55–59 pipeline',async()=>{
 const {bytes}=await create();
 const sketch=composeStyleSketch({profile,seed:options.seed,bpm:options.bpm,bars:options.bars,rootMidi:options.rootMidi,scale:options.scale});
 const base=arrangeStyleSketch({sketch,profile,complexity:options.complexity,parts:options.parts});
 const velocity=applyReferenceEnergyGuide({arrangement:base,referenceReport:reference,strength:options.velocityStrength});
 const density=applyReferenceDensityGuide({arrangement:velocity,referenceReport:reference,strength:options.densityStrength});
 assert.deepEqual(bytes,exportArrangementMidi(density));
});
test('supports pure preset arrangement with no reference file',async()=>{
 const {bundle,bytes}=await create({referenceReport:null,options:{...options,velocityGuide:false,densityGuide:false}});
 assert.equal(bundle.referenceReport,null);
 assert.deepEqual((await verifyLearningReplayBundle(clone(bundle))).bytes,bytes);
});
test('supports standalone energy velocity guide',async()=>{
 const {bundle}=await create({options:{...options,densityGuide:false}});
 assert.equal((await verifyLearningReplayBundle(bundle)).arrangement.referenceDensityGuidance,undefined);
});
test('supports standalone energy density guide',async()=>{
 const {bundle}=await create({options:{...options,velocityGuide:false}});
 assert.equal((await verifyLearningReplayBundle(bundle)).arrangement.referenceGuidance,undefined);
});
test('tracks can be a one-part subset',async()=>{
 const {bundle,bytes}=await create({options:{...options,parts:['drums']}});
 assert.equal(bundle.result.trackSummary.length,1);
 assert.equal(Buffer.from(bytes).readUInt16BE(10),2);
 assert.equal((await verifyLearningReplayBundle(bundle)).verified,true);
});
test('different options change digest',async()=>{
 const a=await create(),b=await create({options:{...options,seed:100}});
 assert.notEqual(a.bundle.result.midiSha256,b.bundle.result.midiSha256);
});
test('changed seed invalidates saved replay',async()=>{
 const {bundle}=await create();const tamper=clone(bundle);tamper.options.seed=100;
 await fails(verifyLearningReplayBundle(tamper));
});
test('changed Reference energy curve invalidates saved replay',async()=>{
 const {bundle}=await create();const tamper=clone(bundle);tamper.referenceReport.descriptors.energyCurve[2]=100;
 await fails(verifyLearningReplayBundle(tamper));
});
test('changed note-count summary invalidates saved replay',async()=>{
 const {bundle}=await create();const tamper=clone(bundle);tamper.result.trackSummary[0].notes++;
 await fails(verifyLearningReplayBundle(tamper));
});
test('changed checksum invalidates saved replay',async()=>{
 const {bundle}=await create();const tamper=clone(bundle);tamper.result.midiSha256='0'.repeat(64);
 await fails(verifyLearningReplayBundle(tamper));
});
test('changed MIDI byte length invalidates saved replay',async()=>{
 const {bundle}=await create();const tamper=clone(bundle);tamper.result.midiBytes++;
 await fails(verifyLearningReplayBundle(tamper));
});
test('rejects training permission changes in manifest',async()=>{
 const {bundle}=await create();
 for(const [key,value] of [['trainingPerformed',true],['sourceAudioIncluded',true],['referenceTrainingAllowed',true],['projectModified',true],['mode','real-ai']]){
  const b=clone(bundle);b[key]=value;await fails(verifyLearningReplayBundle(b));
 }
});
test('rejects reference report permission changes',async()=>{
 const {bundle}=await create();
 for(const [key,value] of [['trainingPerformed',true],['audioIncluded',true],['rightsCategory','owned'],['trainingAllowed',true]]){
  const b=clone(bundle);b.referenceReport[key]=value;await fails(verifyLearningReplayBundle(b));
 }
});
test('rejects raw audio hidden in a reference energy envelope',async()=>{
 const bad={...reference,descriptors:{...reference.descriptors,energyCurve:Array(32).fill(9999)}};
 await fails(create({referenceReport:bad}));
});
test('rejects a nonexistent Reference when guidance enabled',async()=>{
 await fails(create({referenceReport:null}));
});
test('rejects fraudulent profile training flags',async()=>{
 await fails(create({profile:{...profile,trainingPerformed:true}}));
 await fails(create({profile:{...profile,sourceCount:0}}));
});
test('rejects duplicate, unsafe, or unverified source hashes',async()=>{
 for(const sources of [[...profile.sources,...profile.sources],[{musicId:'../escape',sha256:'b'.repeat(64)}],[{musicId:'song',sha256:'bad'}]]){
  await fails(create({profile:{...profile,sourceCount:undefined,sources}}));
 }
});
test('rejects malformed composition ranges and parts',async()=>{
 for(const bad of [{seed:-1},{bars:65},{bpm:0},{rootMidi:150},{scale:'pentatonic'},
  {complexity:'unknown'},{parts:[]},{parts:['bass','bass']},{parts:['bad']},{velocityStrength:101},
  {densityStrength:1.5},{velocityGuide:'true'},{densityGuide:1}]){
  await fails(create({options:{...options,...bad}}));
 }
});
test('rejects huge replay JSON before regeneration',async()=>{
 const {bundle}=await create();const b=clone(bundle);b.padding='x'.repeat(REPLAY_MAX_JSON_BYTES);
 await fails(verifyLearningReplayBundle(b));
});
test('rejects invalid or missing manifest checksum',async()=>{
 const {bundle}=await create();for(const checksum of ['','deadbeef',undefined,'Z'.repeat(64)]){
  const b=clone(bundle);b.result.midiSha256=checksum;await fails(verifyLearningReplayBundle(b));
 }
});
test('never modifies original style profile, Reference report, or options',async()=>{
 const before=JSON.stringify({profile,reference,options});await create();
 assert.equal(JSON.stringify({profile,reference,options}),before);
});
test('local recipe has bounded serialized size',async()=>{
 const {bundle}=await create();assert.ok(Buffer.byteLength(JSON.stringify(bundle),'utf8')<REPLAY_MAX_JSON_BYTES);
});
test('panel exposes local JSON import, export, and hash verification UI',async()=>{
 const {readFileSync}=await import('node:fs');
 const panel=readFileSync(new URL('../src/components/StyleArrangementPanel.jsx',import.meta.url),'utf8');
 assert.match(panel,/재현 패키지 JSON 내보내기/);
 assert.match(panel,/재현 패키지 검증·다시 열기/);
 assert.match(panel,/verifyLearningReplayBundle/);
});
test('source metadata tampering is rejected even when MIDI sounds the same',async()=>{
 const {bundle}=await create();const b=clone(bundle);b.styleProfile.sources[0].sha256='a'.repeat(64);
 await fails(verifyLearningReplayBundle(b));
});
test('rejects unexpected bundled raw music/project contents',async()=>{
 const {bundle}=await create();
 for(const path of ['audioSamples','projectFiles','rawMedia']){
  const b=clone(bundle);b[path]=[1,2,3];await fails(verifyLearningReplayBundle(b));
 }
 const ref=clone(bundle);ref.referenceReport.pcm=[0.1,0.2];await fails(verifyLearningReplayBundle(ref));
});
test('recipe manifest SHA-256 is independently verifiable',async()=>{
 const {bundle}=await create();
 const {styleProfile:profile,referenceReport:reference,options}=bundle;
 const digest=createHash('sha256').update(JSON.stringify({profile,reference,options})).digest('hex');
 assert.equal(bundle.result.recipeSha256,digest);
});
