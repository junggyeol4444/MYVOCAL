// Step43: optional non-destructive leading/trailing WAV silence trim.
// Threshold is measured on the actual output channels before quantization.
// A completely silent mix remains intact (never generate a zero-frame WAV).
export const WAV_TRIM_THRESHOLD_DB = -60;

export function findWavAudibleRange(buffer,{channels=2,thresholdDb=WAV_TRIM_THRESHOLD_DB,startFrame=0,endFrame}={}) {
 if (channels!==1 && channels!==2) throw new Error('WAV 무음 제거 출력 채널이 올바르지 않습니다.');
 if (!Number.isFinite(thresholdDb) || thresholdDb < -120 || thresholdDb > 0)
  throw new Error('WAV 무음 제거 임계값은 -120~0 dBFS여야 합니다.');
 if (!buffer || !Number.isInteger(buffer.length) || buffer.length<1 ||
     !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels<1 ||
     !Number.isInteger(buffer.sampleRate) || buffer.sampleRate<1 ||
     typeof buffer.getChannelData!=='function')
  throw new Error('WAV 무음 제거용 오디오 버퍼가 올바르지 않습니다.');
 const finalFrame=endFrame===undefined?buffer.length:endFrame;
 if (!Number.isInteger(startFrame) || !Number.isInteger(finalFrame) ||
     startFrame<0 || finalFrame>buffer.length || startFrame>=finalFrame)
  throw new Error('WAV 무음 제거 프레임 범위가 올바르지 않습니다.');
 const l=buffer.getChannelData(0),r=buffer.getChannelData(buffer.numberOfChannels>1?1:0);
 if (!l || !r || l.length!==buffer.length || r.length!==buffer.length)
  throw new Error('WAV 무음 제거 중 채널 길이가 일치하지 않습니다.');
 const threshold=10**(thresholdDb/20);
 let audibleStart=-1,audibleEnd=0;
 for (let i=startFrame;i<finalFrame;i++) {
  const left=l[i],right=r[i];
  if (!Number.isFinite(left) || !Number.isFinite(right))
   throw new Error('WAV 무음 제거 중 유효하지 않은 오디오 샘플이 발견되었습니다.');
  const peak=channels===1?Math.abs((left+right)/2):Math.max(Math.abs(left),Math.abs(right));
  if (peak>=threshold) {if(audibleStart<0)audibleStart=i;audibleEnd=i+1;}
 }
 const silent=audibleStart<0;
 if(silent){audibleStart=startFrame;audibleEnd=finalFrame;}
 return {startFrame:audibleStart,endFrame:audibleEnd,silent,
  trimmed:!silent&&(audibleStart!==startFrame||audibleEnd!==finalFrame),
  removedStartFrames:audibleStart-startFrame,removedEndFrames:finalFrame-audibleEnd,thresholdDb};
}
