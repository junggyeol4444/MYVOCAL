// Step47 local synthetic demo. No real audio or external services.
import {writeFileSync} from 'node:fs';
import {resolveWavExportRange} from '../src/lib/wavExportRange.js';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
import assert from 'node:assert/strict';
const dir=process.argv[2];if(!dir)throw Error('Usage: node scripts/demo-wav-range-step47.mjs <release-directory>');
const sampleRate=48000,durationSec=2,frames=sampleRate*durationSec;
const left=new Float32Array(frames),right=new Float32Array(frames);
for(let i=0;i<frames;i++){
 const t=i/sampleRate,amplitude=t<.5?.8:t<1.25?.25:.6;
 left[i]=amplitude*Math.sin(2*Math.PI*220*t);
 right[i]=amplitude*Math.sin(2*Math.PI*330*t);
}
const buffer={length:frames,sampleRate,numberOfChannels:2,getChannelData:i=>i?right:left};
const selection=resolveWavExportRange(buffer,{startSec:.5,endSec:1.25});
const full=encodeWavPcm(buffer,{bitDepth:16,channels:2});
const selected=encodeWavPcm(buffer,{bitDepth:16,channels:2,...selection});
const fullBytes=Buffer.from(await full.arrayBuffer()),selectedBytes=Buffer.from(await selected.arrayBuffer());
assert.equal(fullBytes.readUInt32LE(40),frames*4);
assert.equal(selectedBytes.readUInt32LE(40),selection.durationSec*sampleRate*4);
assert.deepEqual(selectedBytes.subarray(44),fullBytes.subarray(44+selection.startFrame*4,44+selection.endFrame*4));
writeFileSync(`${dir}/MYVOCAL-Step47-full-48000Hz-16bit-stereo-demo.wav`,fullBytes);
writeFileSync(`${dir}/MYVOCAL-Step47-range-48000Hz-16bit-stereo-demo.wav`,selectedBytes);
console.log(JSON.stringify({sampleRate,channels:2,bitDepth:16,fullFrames:frames,selectedFrames:selection.endFrame-selection.startFrame,selectedStartSec:selection.startSec,selectedEndSec:selection.endSec,pcmMatchesFullMixSlice:true},null,2));
