// Generate local synthetic PCM only; no real user media, network or browser.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
const folder=resolve(process.argv[2]||'release');await mkdir(folder,{recursive:true});
const rate=48000,n=rate;const samples=new Float32Array(n);
// 1-second low-level 1kHz tone; 16-bit quantization differences are visible.
for(let i=0;i<n;i++)samples[i]=.00012*Math.sin(2*Math.PI*1000*i/rate);
const buffer={length:n,sampleRate:rate,numberOfChannels:1,getChannelData:()=>samples};
for(const [suffix,flag] of [['without-dither',false],['with-tpdf-dither',true]]){
 const wav=await encodeWavPcm(buffer,{channels:1,bitDepth:16,dither16:flag});
 const path=resolve(folder,`MYVOCAL-Step46-${suffix}-48000Hz-16bit-mono.wav`);
 await writeFile(path,new Uint8Array(await wav.arrayBuffer()));console.log(path,wav.size,'bytes');
}
