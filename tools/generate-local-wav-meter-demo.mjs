// Offline-only synthetic demonstration for Step49 export diagnostics.
import {writeFileSync} from 'node:fs';
import {analyzeWavExport} from '../MYVOCAL-Studio-source/src/lib/wavExportMeter.js';
import {encodeWavPcm} from '../MYVOCAL-Studio-source/src/lib/wavPcm.js';
const out=new URL('../../release/',import.meta.url);
const rate=48000,frames=rate;
const left=new Float32Array(frames),right=new Float32Array(frames);
for(let i=0;i<frames;i++){
 const t=i/rate;left[i]=1.25*Math.sin(2*Math.PI*440*t);
 right[i]=.4*Math.sin(2*Math.PI*660*t);
}
const buffer={length:frames,sampleRate:rate,numberOfChannels:2,getChannelData:i=>i?right:left};
const unprotected=analyzeWavExport(buffer);
const protectedGain=Math.pow(10,-1/20)/unprotected.samplePeak;
const protectedReport=analyzeWavExport(buffer,{exportGain:protectedGain});
if(unprotected.overRangeSamples===0||protectedReport.overRangeSamples!==0)throw Error('Meter verification failed');
for(const [name,opts] of [
 ['MYVOCAL-Step49-32bit-float-unprotected-demo.wav',{bitDepth:32}],
 ['MYVOCAL-Step49-16bit-PCM-unprotected-demo.wav',{bitDepth:16}],
 ['MYVOCAL-Step49-16bit-PCM-protected-demo.wav',{bitDepth:16,exportGain:protectedGain}],
]) {
 const blob=encodeWavPcm(buffer,opts);
 writeFileSync(new URL(name,out),new Uint8Array(await blob.arrayBuffer()));
}
console.log(JSON.stringify({unprotected,protectedReport,protectedGain},null,2));
