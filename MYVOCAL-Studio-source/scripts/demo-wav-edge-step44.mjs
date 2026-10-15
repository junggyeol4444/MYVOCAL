// Reproducible local synthetic WAV samples. No network, no user media.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
const dest=process.argv[2];
if(!dest)throw Error('Usage: node scripts/demo-wav-edge-step44.mjs <output directory>');
const sampleRate=48000;
const left=new Float32Array(sampleRate);
for(let i=0;i<left.length;i++)left[i]=.55*Math.sin(2*Math.PI*440*i/sampleRate+0.6);
// Hard boundaries demonstrate why a fade may be useful; a sine phase offset
// is intentionally used so the first/last sample is nonzero.
const audio={length:left.length,sampleRate,numberOfChannels:1,getChannelData:()=>left};
for(const [name,edgeFadeMs] of [['unfaded',0],['faded',5]]){
 const wav=await encodeWavPcm(audio,{channels:1,bitDepth:24,edgeFadeMs});
 const path=resolve(dest,`MYVOCAL-Step44-${name}-48000Hz-24bit-mono.wav`);
 writeFileSync(path,Buffer.from(await wav.arrayBuffer()));
 console.log(path, wav.size, 'bytes');
}
