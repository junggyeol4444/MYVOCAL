// Step45: opt-in WAV sample-peak normalization. Inspect the exact output
// channel layout and the optional post-trim boundary fade before choosing gain.
// Only the PCM encoder receives this gain; the source AudioBuffer is immutable.
import {DEFAULT_PEAK_CEILING_DB} from './mixPeak.js';
import {WAV_EDGE_FADE_MS,wavEdgeGain,WAV_EXPORT_CHANNELS} from './wavPcm.js';

export const WAV_NORMALIZE_MAX_BOOST_DB = 12;

export function analyzeWavPeakNormalization(buffer,{channels=2,startFrame=0,endFrame,edgeFadeMs=0}={}) {
 if(!WAV_EXPORT_CHANNELS.includes(channels))
  throw new Error('WAV 정규화 출력 채널이 올바르지 않습니다.');
 if(edgeFadeMs!==0 && edgeFadeMs!==WAV_EDGE_FADE_MS)
  throw new Error('WAV 정규화 경계 페이드 옵션이 올바르지 않습니다.');
 if(!buffer || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels<1 ||
    !Number.isInteger(buffer.length) || buffer.length<1 ||
    !Number.isInteger(buffer.sampleRate) || buffer.sampleRate<1 ||
    typeof buffer.getChannelData!=='function')
  throw new Error('WAV 정규화 오디오 버퍼가 올바르지 않습니다.');
 const finalFrame=endFrame===undefined?buffer.length:endFrame;
 if(!Number.isInteger(startFrame)||!Number.isInteger(finalFrame)||startFrame<0||
    finalFrame>buffer.length||startFrame>=finalFrame)
  throw new Error('WAV 정규화 프레임 범위가 올바르지 않습니다.');
 const l=buffer.getChannelData(0),r=buffer.getChannelData(buffer.numberOfChannels>1?1:0);
 if(!l||!r||l.length!==buffer.length||r.length!==buffer.length)
  throw new Error('WAV 정규화 채널 길이가 일치하지 않습니다.');
 const frames=finalFrame-startFrame;
 const fadeFrames=edgeFadeMs===0?0:Math.min(Math.round(buffer.sampleRate*edgeFadeMs/1000),Math.max(1,Math.floor(frames/2)));
 let peakBefore=0;
 for(let i=startFrame;i<finalFrame;i++) {
  const left=l[i],right=r[i];
  if(!Number.isFinite(left)||!Number.isFinite(right))
   throw new Error('WAV 정규화 중 유효하지 않은 오디오 샘플이 발견되었습니다.');
  const fade=fadeFrames===0?1:wavEdgeGain(i-startFrame,frames,fadeFrames);
  const peak=channels===1?Math.abs((left+right)/2*fade):Math.max(Math.abs(left*fade),Math.abs(right*fade));
  if(peak>peakBefore)peakBefore=peak;
 }
 const ceiling=10**(DEFAULT_PEAK_CEILING_DB/20);
 const maxGain=10**(WAV_NORMALIZE_MAX_BOOST_DB/20);
 const idealGain=peakBefore===0?1:ceiling/peakBefore;
 // Float32 PCM rounds the exact -1 dBFS target; avoid a meaningless
 // micro-boost/attenuation from representation error.
 const gain=Math.abs(idealGain-1)<1e-7?1:Math.min(idealGain,maxGain);
 const gainDb=gain===1?0:20*Math.log10(gain);
 return {
  peakBefore,peakAfter:peakBefore*gain,gain,gainDb,
  ceilingDb:DEFAULT_PEAK_CEILING_DB,maxBoostDb:WAV_NORMALIZE_MAX_BOOST_DB,
  boosted:gain>1,attenuated:gain<1,silent:peakBefore===0,
  limited:peakBefore>0 && idealGain>maxGain,
 };
}
