// Step45: deterministic local-only 48kHz/24-bit/mono peak-normalization demo.
// Uses production analyzer + PCM encoder, not browser OfflineAudioContext.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {analyzeWavPeakNormalization} from '../src/lib/wavNormalize.js';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
const dest=process.argv[2];
if(!dest)throw Error('Usage: node scripts/demo-wav-normalize-step45.mjs <output-directory>');
await mkdir(dest,{recursive:true});
const rate=48000,frames=rate,l=new Float32Array(frames),r=new Float32Array(frames);
for(let i=0;i<frames;i++){
 const tone=Math.sin(2*Math.PI*440*i/rate)*.1;
 l[i]=tone;r[i]=tone*.5;
}
const buffer={sampleRate:rate,length:frames,numberOfChannels:2,getChannelData:i=>i===0?l:r};
const opts={channels:1,bitDepth:24};
const report=analyzeWavPeakNormalization(buffer,{channels:1});
for(const [label,gain] of [['before',1],['normalized',report.gain]]){
 const blob=encodeWavPcm(buffer,{...opts,exportGain:gain});
 const name=`MYVOCAL-Step45-${label}-48000Hz-24bit-mono.wav`;
 await writeFile(join(dest,name),Buffer.from(await blob.arrayBuffer()));
 console.log(name,blob.size,'bytes');
}
console.log(JSON.stringify(report));
