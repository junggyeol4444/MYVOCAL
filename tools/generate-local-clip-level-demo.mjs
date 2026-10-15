// Synthetic local demonstration of the same clip gain + fade helpers used by Web Audio.
// This is not a microphone recording, an AI voice, or an actual WebView2 playback test.
import {writeFileSync} from 'node:fs';
import {clipLevel,clipFadeGain} from '../MYVOCAL-Studio-source/src/lib/clipTiming.js';
const output=process.argv[2];if(!output)throw Error('Expected WAV output path');
const rate=22050,segment=1.5,frames=Math.round(rate*segment),total=frames*3;
const data=Buffer.alloc(44+total*2);
const str=(off,s)=>data.write(s,off,'ascii');
str(0,'RIFF');data.writeUInt32LE(36+total*2,4);str(8,'WAVE');str(12,'fmt ');
data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
str(36,'data');data.writeUInt32LE(total*2,40);
const clips=[{durationSec:segment,gainPercent:100,fadeInSec:.1,fadeOutSec:.1},
 {durationSec:segment,gainPercent:50,fadeInSec:.1,fadeOutSec:.1},
 {durationSec:segment,gainPercent:100,clipMuted:true,fadeInSec:.1,fadeOutSec:.1}];
const rms=[];
for(let k=0;k<3;k++){
 let sum=0;
 for(let i=0;i<frames;i++){
  const sec=i/rate;
  const x=.35*Math.sin(2*Math.PI*440*sec)*clipLevel(clips[k])*clipFadeGain(clips[k],segment,sec);
  data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+2*(k*frames+i));
  sum+=x*x;
 }
 rms.push(Math.sqrt(sum/frames));
}
writeFileSync(output,data);
if(!(rms[0]>rms[1]*1.99 && rms[1]>0 && rms[2]===0))throw Error('Gain ratio or mute demo check failed');
console.log(JSON.stringify({file:output,seconds:segment*3,rate,channels:1,rms,ratio:rms[1]/rms[0]}));
