// Step39: offline WAV export sample-peak guard (not a true-peak limiter/mastering).
// Inspect every rendered channel and use one common attenuation factor to preserve
// stereo image and dynamics. Never mutate source/project/AudioBuffer data.
export const DEFAULT_PEAK_CEILING_DB = -1;

export function analyzeMixPeak(buffer, ceilingDb = DEFAULT_PEAK_CEILING_DB, {mono=false,startFrame=0,endFrame}={}) {
 if (!buffer || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
     !Number.isInteger(buffer.length) || buffer.length < 1 || typeof buffer.getChannelData !== 'function')
  throw new Error('WAV 피크 검사에 필요한 오디오 데이터가 올바르지 않습니다.');
 if (typeof mono !== 'boolean')
  throw new Error('WAV 피크 검사 채널 옵션이 올바르지 않습니다.');
 if (!Number.isFinite(ceilingDb) || ceilingDb > 0 || ceilingDb < -24)
  throw new Error('피크 보호 상한은 -24~0 dBFS 사이여야 합니다.');
 const finalFrame=endFrame===undefined?buffer.length:endFrame;
 if(!Number.isInteger(startFrame)||!Number.isInteger(finalFrame)||startFrame<0||
    finalFrame>buffer.length||startFrame>=finalFrame)
  throw new Error('WAV 피크 검사 프레임 범위가 올바르지 않습니다.');
 let peakBefore = 0;
 if (mono) {
  // Match the exact downmix formula in encodeWavPcm. Check both inputs
  // even if their sum cancels; do not allocate a large temporary mono buffer.
  const left=buffer.getChannelData(0);
  const right=buffer.getChannelData(buffer.numberOfChannels>1?1:0);
  if (!left || !right || left.length!==buffer.length || right.length!==buffer.length)
   throw new Error('WAV 피크 검사 중 채널 길이가 일치하지 않습니다.');
  for (let i=startFrame; i<finalFrame; i++) {
   if (!Number.isFinite(left[i]) || !Number.isFinite(right[i]))
    throw new Error('WAV 피크 검사 중 유효하지 않은 오디오 샘플이 발견되었습니다.');
   peakBefore=Math.max(peakBefore,Math.abs((left[i]+right[i])/2));
  }
 } else for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
  const samples = buffer.getChannelData(ch);
  if (!samples || samples.length !== buffer.length)
   throw new Error('WAV 피크 검사 중 채널 길이가 일치하지 않습니다.');
  for (let i = startFrame; i < finalFrame; i++) {
   const value = samples[i];
   if (!Number.isFinite(value))
    throw new Error('WAV 피크 검사 중 유효하지 않은 오디오 샘플이 발견되었습니다.');
   const abs = Math.abs(value);
   if (abs > peakBefore) peakBefore = abs;
  }
 }
 const ceiling = 10 ** (ceilingDb / 20);
 const gain = peakBefore > ceiling ? ceiling / peakBefore : 1;
 return {
  peakBefore, peakAfter: peakBefore * gain, gain,
  gainDb: gain === 1 ? 0 : 20 * Math.log10(gain), ceilingDb,
  attenuated: gain < 1,
 };
}
