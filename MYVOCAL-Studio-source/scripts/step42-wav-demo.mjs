// Step42: deterministic local PCM demo; no audio devices or network access.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
const out=process.argv[2]||resolve(process.cwd(),'../../release');
const rate=48000,frames=rate;
const left=Float32Array.from({length:frames},(_,i)=>.6*Math.sin(2*Math.PI*440*i/rate));
const right=Float32Array.from({length:frames},(_,i)=>.4*Math.sin(2*Math.PI*660*i/rate));
const buffer={length:frames,sampleRate:rate,numberOfChannels:2,getChannelData:i=>i===0?left:right};
for(const channels of [2,1]){
 const blob=encodeWavPcm(buffer,{channels,bitDepth:24});
 const bytes=Buffer.from(await blob.arrayBuffer());
 const name=`MYVOCAL-Step42-48000Hz-24bit-${channels===1?'mono':'stereo'}-demo.wav`;
 writeFileSync(resolve(out,name),bytes);
 console.log(`${name}: ${bytes.length} bytes, channels=${bytes.readUInt16LE(22)}, rate=${bytes.readUInt32LE(24)}, bitDepth=${bytes.readUInt16LE(34)}`);
}
