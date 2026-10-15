// Synthesized stereo pan illustration, not an AI or microphone recording.
// Run: node tools/generate-local-clip-pan-demo.mjs <output.wav>
import {writeFileSync} from 'node:fs';
import {monoPanCompensation} from '../MYVOCAL-Studio-source/src/lib/clipTiming.js';
const out=process.argv[2];if(!out)throw Error('Output WAV path required');
const rate=22050,channels=2,segment=1.2,gap=.15,duration=3*segment+2*gap;
const frames=Math.round(duration*rate),data=new ArrayBuffer(44+frames*channels*2),v=new DataView(data);
const ascii=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
ascii(0,'RIFF');v.setUint32(4,36+frames*4,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,frames*4,true);
const pans=[-1,0,1];
for(let i=0;i<frames;i++){
 const t=i/rate,which=Math.floor(t/(segment+gap)),within=t-which*(segment+gap);
 let l=0,r=0;
 if(which<3&&within<segment){
  const amp=.22*Math.sin(2*Math.PI*330*t)*Math.min(1,within/.02,(segment-within)/.02);
  const pan=pans[which];
  if(pan===0){l=amp;r=amp;}
  else{const a=(pan+1)*Math.PI/4,c=monoPanCompensation(pan);l=amp*c*Math.cos(a);r=amp*c*Math.sin(a);}
 }
 v.setInt16(44+i*4,Math.max(-32768,Math.min(32767,Math.round(l*32767))),true);
 v.setInt16(46+i*4,Math.max(-32768,Math.min(32767,Math.round(r*32767))),true);
}
writeFileSync(out,Buffer.from(data));
console.log(JSON.stringify({out,seconds:duration,sampleRate:rate,channels:2,sections:['left','center','right']}));
