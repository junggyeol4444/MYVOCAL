// Step41: deterministic offline PCM reference files. No network or audio device.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encodeWavPcm,WAV_EXPORT_SAMPLE_RATES} from '../MYVOCAL-Studio-source/src/lib/wavPcm.js';
const dir=resolve(process.argv[2]||'release');
await mkdir(dir,{recursive:true});
for(const sampleRate of WAV_EXPORT_SAMPLE_RATES){
 const length=sampleRate;
 const left=Float32Array.from({length},(_,i)=>.65*Math.sin(2*Math.PI*440*i/sampleRate));
 const right=Float32Array.from({length},(_,i)=>.45*Math.sin(2*Math.PI*660*i/sampleRate));
 const audio={length,sampleRate,numberOfChannels:2,getChannelData:i=>i===0?left:right};
 const blob=encodeWavPcm(audio,{bitDepth:24});
 const name=`MYVOCAL-Step41-${sampleRate}Hz-24bit-stereo-demo.wav`;
 await writeFile(resolve(dir,name),new Uint8Array(await blob.arrayBuffer()));
 console.log(`${name}: ${blob.size} bytes`);
}
