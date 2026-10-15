// Step28: deterministic user-timed *guide* WAV demo; not a neural AI voice.
// Usage: node tools/generate-offline-phoneme-demo.mjs [destination.wav]
// Generates a note with Korean lyrics '아사' and changes the second
// syllable's onset timing from 300ms to 220ms. No network or user data.
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';
import {renderOfflineVocalGuide} from '../src/lib/offlineVocalGuide.js';

const a={format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,projectId:'sample',trackId:'sample-midi',sourceKey:'sample-v1',
 cues:[{lyric:'아사',pitch:69,startSec:0,endSec:0.7,velocity:100},
       {lyric:'나를',pitch:72,startSec:0.75,endSec:1.6,velocity:108},
       {lyric:'사랑',pitch:67,startSec:1.65,endSec:2.55,velocity:110}]};
const plan=buildPhonemePlan(a);
// In note 1, shorten '아' and start the next syllable earlier.
const first=plan.segments.filter(s=>s.cueIndex===1);
if(first.map(s=>s.kind).join(',')!=='nucleus,onset,nucleus')throw Error('Demo phonemes changed');
first[0].endSec=0.22;
first[1].startSec=0.22;
first[1].endSec=0.27;
first[2].startSec=0.27;
const result=renderOfflineVocalGuide(a,plan);
const output=process.argv[2]||fileURLToPath(new URL('./offline-phoneme-demo.wav',import.meta.url));
const bytes=Buffer.from(await result.blob.arrayBuffer());
await writeFile(output,bytes);
console.log(JSON.stringify({file:output,bytes:bytes.length,seconds:result.seconds,timedCues:result.timedCues,
 sampleRate:result.sampleRate,kind:result.kind,model:'none',network:'none'},null,2));
