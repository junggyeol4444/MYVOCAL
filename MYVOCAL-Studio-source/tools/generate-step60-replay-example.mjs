// Synthetic test-only data; never copy user sound or project files.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createLearningReplayBundle,verifyLearningReplayBundle} from '../src/lib/learningReplayBundle.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const profile=JSON.parse(await readFile(resolve(root,'examples/step58/SYNTHETIC-style-profile.json'),'utf8'));
const referenceReport=JSON.parse(await readFile(resolve(root,'examples/step59/SYNTHETIC-reference-report.json'),'utf8'));
const options={seed:19,bpm:120,bars:8,rootMidi:60,scale:'minor',complexity:'full',
 parts:['melody','bass','chords','drums'],velocityGuide:true,densityGuide:true,velocityStrength:80,densityStrength:100};
const result=await createLearningReplayBundle({profile,referenceReport,options});
const verified=await verifyLearningReplayBundle(JSON.parse(JSON.stringify(result.bundle)));
if(Buffer.compare(Buffer.from(result.bytes),Buffer.from(verified.bytes)))throw Error('Step60 replay check failed');
const out=resolve(root,'examples/step60');await mkdir(out,{recursive:true});
await writeFile(resolve(out,'SYNTHETIC-replay.json'),JSON.stringify(result.bundle,null,2)+'\n');
await writeFile(resolve(out,'SYNTHETIC-replayed.mid'),result.bytes);
await writeFile(resolve(out,'SYNTHETIC-verification.json'),JSON.stringify({verified:true,
 midiSha256:result.bundle.result.midiSha256,recipeSha256:result.bundle.result.recipeSha256,
 tracks:result.bundle.result.trackSummary,synthetic:true},null,2)+'\n');
console.log(`Replayed ${result.bytes.length} MIDI bytes / ${result.bundle.result.trackSummary.length} tracks; SHA-256 verified`);
