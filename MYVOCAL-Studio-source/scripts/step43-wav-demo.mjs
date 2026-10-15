// Generate synthetic comparison WAV files entirely offline, without user audio.
import {writeFileSync,mkdirSync} from 'node:fs';
import {encodeWavPcm} from '../src/lib/wavPcm.js';
import {findWavAudibleRange} from '../src/lib/wavTrim.js';
import {analyzeMixPeak} from '../src/lib/mixPeak.js';
const rate=48000,length=rate*2;
const left=new Float32Array(length),right=new Float32Array(length);
for(let i=0;i<length;i++){
 const t=i/rate;
 if ((t>=.3&&t<.9)||(t>=1.1&&t<1.7)) {
  left[i]=.7*Math.sin(2*Math.PI*440*t);
  right[i]=.35*Math.sin(2*Math.PI*440*t);
 }
}
const buffer={length,sampleRate:rate,numberOfChannels:2,getChannelData:i=>i===0?left:right};
const dir=new URL('../../../release/',import.meta.url);mkdirSync(dir,{recursive:true});
for(const [name,trimSilence] of [['untrimmed',false],['trimmed',true]]){
 const trim=trimSilence?findWavAudibleRange(buffer,{channels:1}):null;
 const range=trim?{startFrame:trim.startFrame,endFrame:trim.endFrame}:{};
 const peak=analyzeMixPeak(buffer,undefined,{mono:true,...range});
 const wav=await encodeWavPcm(buffer,{channels:1,bitDepth:24,exportGain:peak.gain,...range});
 const path=new URL(`MYVOCAL-Step43-${name}-48000Hz-24bit-mono.wav`,dir);
 writeFileSync(path,Buffer.from(await wav.arrayBuffer()));
 console.log(name,{bytes:wav.size,range,peak:peak.peakBefore});
}
