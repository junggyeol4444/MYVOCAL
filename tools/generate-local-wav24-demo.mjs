// Offline PCM format comparison, no audio device, network or external packages.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encodeWavPcm} from '../MYVOCAL-Studio-source/src/lib/wavPcm.js';
const output=resolve(process.argv[2]||'release');
await mkdir(output,{recursive:true});
const rate=44100,duration=1,n=rate*duration;
const left=Float32Array.from({length:n},(_,i)=>.65*Math.sin(2*Math.PI*440*i/rate));
const right=Float32Array.from({length:n},(_,i)=>.45*Math.sin(2*Math.PI*660*i/rate));
const buffer={length:n,sampleRate:rate,numberOfChannels:2,getChannelData:ch=>ch===0?left:right};
for(const bitDepth of [16,24]){
 const blob=encodeWavPcm(buffer,{bitDepth});
 const name=`MYVOCAL-Step40-${bitDepth}bit-stereo-demo.wav`;
 await writeFile(resolve(output,name),new Uint8Array(await blob.arrayBuffer()));
 console.log(`${name}: ${blob.size} bytes`);
}
