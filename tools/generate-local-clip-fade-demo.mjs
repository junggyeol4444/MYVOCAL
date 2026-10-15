// Demonstration clip for Step32. Synthetic sine tones, no user media, no network.
// This uses the exact envelope calculation shared by live and offline mixdown.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {clipFadeGain} from '../MYVOCAL-Studio-source/src/lib/clipTiming.js';
const path = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)),'../../Step32-clip-fade-demo.wav');
const rate=22050,duration=4,frames=Math.round(duration*rate);
const data=Buffer.alloc(44+frames*2);
data.write('RIFF',0,'ascii');data.writeUInt32LE(36+frames*2,4);data.write('WAVEfmt ',8,'ascii');
data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
data.write('data',36,'ascii');data.writeUInt32LE(frames*2,40);
const clip={fadeInSec:.65,fadeOutSec:.9};
for(let i=0;i<frames;i++){
 const t=i/rate,g=clipFadeGain(clip,duration,t);
 const hz=t<2?220:330;const value=Math.round(Math.sin(t*2*Math.PI*hz)*g*.65*32767);
 data.writeInt16LE(Math.max(-32768,Math.min(32767,value)),44+i*2);
}
writeFileSync(path,data);
console.log(`Generated local fade WAV: ${path}; ${duration}s, ${rate}Hz mono 16-bit; fades .65s/.9s`);
