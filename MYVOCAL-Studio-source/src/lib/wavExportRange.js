// Step47: optional, non-destructive WAV time-range export.
// Time positions are absolute seconds on the existing project timeline.
// Round both boundaries to the nearest output sample; never emit empty PCM.
export function resolveWavExportRange(buffer, options={}) {
 if (!buffer || !Number.isInteger(buffer.length) || buffer.length<1 ||
     !Number.isInteger(buffer.sampleRate) || buffer.sampleRate<1)
  throw new Error('WAV 구간 선택용 오디오 버퍼가 올바르지 않습니다.');
 if (!options || typeof options!=='object' || Array.isArray(options))
  throw new Error('WAV 구간 선택 옵션이 올바르지 않습니다.');
 const hasStart=Object.hasOwn(options,'startSec'),hasEnd=Object.hasOwn(options,'endSec');
 if (!hasStart && !hasEnd)
  return {selected:false,startFrame:0,endFrame:buffer.length,startSec:0,
   endSec:buffer.length/buffer.sampleRate,durationSec:buffer.length/buffer.sampleRate};
 if (!hasStart || !hasEnd || typeof options.startSec!=='number' || typeof options.endSec!=='number' ||
     !Number.isFinite(options.startSec) || !Number.isFinite(options.endSec) ||
     options.startSec<0 || options.endSec<=options.startSec ||
     options.endSec>buffer.length/buffer.sampleRate)
  throw new Error('WAV 선택 구간은 프로젝트 길이 안에서 시작 < 끝인 초 단위 숫자여야 합니다.');
 const startFrame=Math.round(options.startSec*buffer.sampleRate);
 const endFrame=Math.round(options.endSec*buffer.sampleRate);
 if (startFrame<0 || endFrame>buffer.length || startFrame>=endFrame)
  throw new Error('WAV 선택 구간이 1샘플보다 짧거나 출력 범위를 벗어났습니다.');
 return {selected:true,startFrame,endFrame,startSec:startFrame/buffer.sampleRate,
  endSec:endFrame/buffer.sampleRate,durationSec:(endFrame-startFrame)/buffer.sampleRate};
}
