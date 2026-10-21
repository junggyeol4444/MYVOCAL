// Reviewable mouth cues from REAL PCM samples + the project's MIDI/lyric score.
// This is signal-energy gating, NOT forced phoneme recognition or neural face motion.
import {syllableHint} from './phonemePlan.js';
import {phonemeViseme,validateLipSync} from './characterLipSync.js';
export function lipSyncFromSingingAudio(alignment,buffer,{threshold=0.012}={}){
 if(!Array.isArray(alignment?.cues)||!alignment.cues.length||!buffer||typeof buffer.getChannelData!=='function')throw Error('가사·MIDI 싱크와 디코딩된 보컬 WAV가 필요합니다.');
 if(!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||buffer.sampleRate>96000||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2||!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>360)throw Error('보컬 오디오 형식/길이를 확인하세요.');
 if(!Number.isFinite(threshold)||threshold<0.001||threshold>0.3)throw Error('입 움직임 감지 임곗값이 올바르지 않습니다.');
 const channels=Array.from({length:buffer.numberOfChannels},(_,n)=>buffer.getChannelData(n));
 const cues=[];let last=0;
 for(const note of alignment.cues){
  if(!Number.isFinite(note.startSec)||!Number.isFinite(note.endSec)||note.startSec<last-0.002||note.endSec<=note.startSec||note.endSec>buffer.duration+0.08)throw Error('MIDI 노트와 실제 WAV 시간축이 일치하지 않습니다.');
  last=note.endSec;
  const chars=[...String(note.lyric||'')].filter(c=>/[가-힣a-zA-Z]/u.test(c));if(!chars.length)continue;
  for(let k=0;k<chars.length;k++){
   const ch=chars[k],start=note.startSec+(note.endSec-note.startSec)*k/chars.length,end=note.startSec+(note.endSec-note.startSec)*(k+1)/chars.length;
   const length=end-start;
   const samples=12,active=[];
   for(let j=0;j<samples;j++){
    const mid=start+length*(j+0.5)/samples;
    const first=Math.max(0,Math.floor((mid-0.007)*buffer.sampleRate)),stop=Math.min(channels[0].length,Math.ceil((mid+0.007)*buffer.sampleRate));
    let power=0,count=0;
    for(const c of channels)for(let n=first;n<stop;n+=2){const val=c[n];if(Number.isFinite(val)){power+=val*val;count++}}
    if(count&&Math.sqrt(power/count)>=threshold)active.push(j);
   }
   if(!active.length)continue;
   const opening=start+length*Math.max(0,active[0]-0.5)/samples;
   const closing=start+length*Math.min(samples,active.at(-1)+1.5)/samples;
   const startMs=Math.round(opening*1000),endMs=Math.round(closing*1000);
   if(endMs<=startMs)continue;
   const phoneme=syllableHint(ch)?.nucleus||({'a':'ㅏ','e':'ㅔ','i':'ㅣ','o':'ㅗ','u':'ㅜ'})[ch.toLowerCase()]||'ㅏ';
   const result={startMs,endMs,phoneme,lyric:ch,viseme:phonemeViseme(phoneme)};
   if(cues.length&&result.startMs<cues.at(-1).endMs)result.startMs=cues.at(-1).endMs;
   if(result.endMs>result.startMs)cues.push(result);
   if(cues.length>2000)throw Error('자동 Lip Sync 길이가 2000개를 초과했습니다.');
  }
 }
 if(!cues.length)throw Error('가창 오디오에서 실제 발성 구간이 감지되지 않았습니다. 녹음과 MIDI 타이밍을 확인하세요.');
 return validateLipSync({version:1,cues});
}