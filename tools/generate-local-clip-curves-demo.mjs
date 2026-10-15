// Generate a reproducible local reference WAV from production clipFadeGain.
// Synthesized sine waves, not AI vocals. No network, uploads or user content.
import {writeFileSync} from 'node:fs';
import {clipFadeGain} from '../MYVOCAL-Studio-source/src/lib/clipTiming.js';
const out=process.argv[2]||'MYVOCAL-Step33-fade-curves-demo.wav';
const sr=22050, segment=1.3, pause=.2;
const shapes=['linear','smooth','equalPower'];
const total=Math.ceil(sr*((segment+pause)*shapes.length));
const b=Buffer.alloc(44+total*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(total*2,40);
const stats=[];
for(let seg=0;seg<shapes.length;seg++){
 const curve=shapes[seg],clip={fadeInSec:.4,fadeOutSec:.4,fadeInCurve:curve,fadeOutCurve:curve};
 let peak=0;
 for(let i=0;i<Math.floor(segment*sr);i++){
  const t=i/sr,gain=clipFadeGain(clip,segment,t),sample=Math.sin(Math.PI*2*220*t)*gain*.45;
  const index=Math.round(seg*(segment+pause)*sr)+i;
  b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(sample*32767))),44+index*2);
  peak=Math.max(peak,Math.abs(sample));
 }
 stats.push({curve,peak});
}
writeFileSync(out,b);
console.log(JSON.stringify({output:out,sampleRate:sr,seconds:total/sr,shapes,stats},null,2));
