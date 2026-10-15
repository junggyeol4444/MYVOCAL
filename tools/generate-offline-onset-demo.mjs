// Reproducible rule-based consonant-onset guide; no models, file reads, or network.
// Usage: node tools/generate-offline-onset-demo.mjs output.wav
import {writeFile} from 'node:fs/promises';
import {renderOfflineVocalGuide} from '../MYVOCAL-Studio-source/src/lib/offlineVocalGuide.js';

const target=process.argv[2];
if(!target?.toLowerCase().endsWith('.wav'))throw Error('Specify an output .wav path.');
const cues=[
 {lyric:'사랑',pitch:60,startSec:0,endSec:1.15,velocity:100},
 {lyric:'바람',pitch:64,startSec:1.2,endSec:2.35,velocity:100},
 {lyric:'나를',pitch:67,startSec:2.4,endSec:3.55,velocity:100},
 {lyric:'불러',pitch:69,startSec:3.6,endSec:4.8,velocity:100},
];
const result=renderOfflineVocalGuide({cues});
await writeFile(target,new Uint8Array(await result.blob.arrayBuffer()));
console.log(`OFFLINE consonant-onset guide (NOT natural speech): ${result.rendered} notes, ${result.seconds}s, ${result.sampleRate}Hz mono PCM WAV -> ${target}`);
