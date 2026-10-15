// Step49: deterministic post-gain/downmix/fade WAV export meter.
// Measures the samples presented to the encoder BEFORE integer quantization.
// No buffer mutation, network calls, project changes, or new saved settings.
import {WAV_EDGE_FADE_MS, WAV_EXPORT_CHANNELS, wavEdgeGain} from './wavPcm.js';

const dbfs = value => value > 0 ? 20 * Math.log10(value) : -Infinity;

export function analyzeWavExport(buf, {channels=2, startFrame=0, endFrame,
 exportGain=1, edgeFadeMs=0}={}) {
 if (!WAV_EXPORT_CHANNELS.includes(channels))
  throw new Error('WAV 출력 분석 채널은 모노(1) 또는 스테레오(2)만 지원합니다.');
 if (!Number.isFinite(exportGain) || exportGain < 0)
  throw new Error('WAV 출력 분석 음량 배율이 올바르지 않습니다.');
 if (edgeFadeMs !== 0 && edgeFadeMs !== WAV_EDGE_FADE_MS)
  throw new Error('WAV 출력 분석 경계 페이드가 올바르지 않습니다.');
 if (!buf || !Number.isInteger(buf.length) || buf.length < 1 ||
     !Number.isInteger(buf.sampleRate) || buf.sampleRate < 1 ||
     !Number.isInteger(buf.numberOfChannels) || buf.numberOfChannels < 1 ||
     typeof buf.getChannelData !== 'function')
  throw new Error('WAV 출력 분석 오디오 버퍼가 올바르지 않습니다.');
 const end=endFrame===undefined?buf.length:endFrame;
 if (!Number.isInteger(startFrame) || !Number.isInteger(end) ||
     startFrame < 0 || end > buf.length || startFrame >= end)
  throw new Error('WAV 출력 분석 프레임 범위가 올바르지 않습니다.');
 const left=buf.getChannelData(0),right=buf.getChannelData(buf.numberOfChannels>1?1:0);
 if (!left || !right || left.length!==buf.length || right.length!==buf.length)
  throw new Error('WAV 출력 분석 채널 길이가 일치하지 않습니다.');
 const frames=end-startFrame;
 const fadeFrames=edgeFadeMs===0?0:Math.min(Math.round(buf.sampleRate*edgeFadeMs/1000),Math.max(1,Math.floor(frames/2)));
 let peak=0,energy=0,overRangeSamples=0,overRangeFrames=0,nonFiniteSamples=0;
 for (let i=startFrame;i<end;i++) {
  const fade=fadeFrames===0?1:wavEdgeGain(i-startFrame,frames,fadeFrames);
  const gain=exportGain*fade;
  const values=channels===1?[(left[i]+right[i])/2*gain]:[left[i]*gain,right[i]*gain];
  let over=false;
  for (const value of values) {
   // Float encoder converts non-finite values to zero. Integer PCM's DataView
   // conversion also produces zero for NaN; report anomalies separately.
   if (!Number.isFinite(value)) {nonFiniteSamples++;continue;}
   const magnitude=Math.abs(value);
   peak=Math.max(peak,magnitude);
   energy+=value*value;
   if (magnitude>1) {overRangeSamples++;over=true;}
  }
  if (over)overRangeFrames++;
 }
 const rms=Math.sqrt(energy/(frames*channels));
 return {
  frames,channels,sampleRate:buf.sampleRate,durationSec:frames/buf.sampleRate,
  samplePeak:peak,samplePeakDbfs:dbfs(peak),rms,rmsDbfs:dbfs(rms),
  overRangeSamples,overRangeFrames,nonFiniteSamples,
  // These are sample-domain diagnostics, NOT true peak or LUFS measurements.
 };
}
