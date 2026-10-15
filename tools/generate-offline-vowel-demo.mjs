// Reproducible sample of the built-in OFFLINE procedural vowel guide.
// Does not read projects, voice samples or profiles and makes no HTTP requests.
// Usage: node tools/generate-offline-vowel-demo.mjs /path/to/demo.wav
import {writeFile} from 'node:fs/promises';
import {renderOfflineVocalGuide} from '../MYVOCAL-Studio-source/src/lib/offlineVocalGuide.js';

const destination=process.argv[2];
if(!destination)throw Error('Specify a destination .wav path.');
const cues=[
 {lyric:'아이',pitch:60,startSec:0.0,endSec:1.1,velocity:100},
 {lyric:'우리',pitch:64,startSec:1.15,endSec:2.25,velocity:104},
 {lyric:'사랑',pitch:67,startSec:2.30,endSec:3.55,velocity:98},
 {lyric:'노래',pitch:69,startSec:3.65,endSec:4.65,velocity:105},
];
const rendered=renderOfflineVocalGuide({cues});
await writeFile(destination,new Uint8Array(await rendered.blob.arrayBuffer()));
console.log(`OFFLINE vowel guide: ${rendered.rendered} MIDI notes, ${rendered.seconds}s, ${rendered.sampleRate} Hz mono PCM WAV -> ${destination}`);
