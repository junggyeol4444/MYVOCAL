// Step42: local PCM WAV export. The default stereo 16-bit path is byte-compatible
// with the original Step39 encoder; optional 24-bit writes signed 3-byte PCM.
// Optional mono is an arithmetic (L+R)/2 downmix, not a pan-law adjustment.
// No source-buffer mutation. Optional deterministic 16-bit TPDF dither is off by default.
// Step44: optional 5ms linear boundary fade prevents hard WAV cuts after trimming.
// It is applied to encoded samples only; the rendered buffer remains untouched.
// The browser OfflineAudioContext performs any source resampling during mixdown.
export const WAV_EDGE_FADE_MS = 5;
// Fixed nonzero seed: reproducible local PCM output, not cryptographic randomness.
export const WAV_DITHER_SEED = 0x4d59564f;
// Two independent uniform draws per PCM sample yield triangular +/-1 LSB noise.
// Dither is added after trim/downmix/fade/gain, immediately before quantization.
export function createWavTpdfDither(seed=WAV_DITHER_SEED) {
 if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)
  throw new Error('WAV 디더 시드가 올바르지 않습니다.');
 let state=seed>>>0;
 const uniform=()=>{
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
 return ()=>uniform()+uniform()-1;
}

export const WAV_PCM_BITS = Object.freeze([16, 24]);
// IEEE 754 floating-point WAV is format 3, not integer PCM format 1.
export const WAV_EXPORT_BITS = Object.freeze([16, 24, 32]);
export const WAV_EXPORT_CHANNELS = Object.freeze([1, 2]);
// Supported offline render rates. The legacy/default export remains 44.1 kHz.
export const WAV_EXPORT_SAMPLE_RATES = Object.freeze([44100, 48000]);

// Relative to the exported (possibly trimmed) range. Never overlap the two fades.
// A one-frame export fades to silence, as it has no safe boundary transition.
export function wavEdgeGain(frameIndex, frameCount, fadeFrames) {
 if (!Number.isInteger(frameCount) || frameCount < 1 ||
     !Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameCount ||
     !Number.isInteger(fadeFrames) || fadeFrames < 0)
  throw new Error('WAV 경계 페이드 프레임 값이 올바르지 않습니다.');
 if (fadeFrames === 0) return 1;
 if (frameCount === 1) return 0;
 return Math.min(1, frameIndex / fadeFrames, (frameCount - 1 - frameIndex) / fadeFrames);
}

export function encodeWavPcm(buf, {bitDepth=16, exportGain=1, channels=2, startFrame=0, endFrame, edgeFadeMs=0, dither16=false}={}) {
 if (typeof dither16 !== 'boolean')
  throw new Error('WAV 16비트 디더 옵션이 올바르지 않습니다.');
 if (dither16 && bitDepth !== 16)
  throw new Error('WAV TPDF 디더는 16비트 PCM에서만 지원합니다.');
 if (!WAV_EXPORT_BITS.includes(bitDepth))
  throw new Error('WAV 형식은 16/24비트 PCM 또는 32비트 float만 지원합니다.');
 if (!WAV_EXPORT_CHANNELS.includes(channels))
  throw new Error('WAV 출력 채널은 모노(1) 또는 스테레오(2)만 지원합니다.');
 if (!Number.isFinite(exportGain) || exportGain < 0)
  throw new Error('WAV 출력 음량 배율이 올바르지 않습니다.');
 if (edgeFadeMs !== 0 && edgeFadeMs !== WAV_EDGE_FADE_MS)
  throw new Error('WAV 경계 페이드는 끔(0) 또는 5ms만 지원합니다.');
 if (!buf || !Number.isInteger(buf.length) || buf.length < 1 ||
     !Number.isInteger(buf.sampleRate) || buf.sampleRate < 1 ||
     !Number.isInteger(buf.numberOfChannels) || buf.numberOfChannels < 1 ||
     typeof buf.getChannelData !== 'function')
  throw new Error('WAV 출력 오디오 버퍼가 올바르지 않습니다.');
 const finalFrame=endFrame===undefined?buf.length:endFrame;
 if(!Number.isInteger(startFrame)||!Number.isInteger(finalFrame)||startFrame<0||
    finalFrame>buf.length||startFrame>=finalFrame)
  throw new Error('WAV 출력 프레임 범위가 올바르지 않습니다.');
 const frames=finalFrame-startFrame;
 const fadeFrames=edgeFadeMs===0?0:Math.min(Math.round(buf.sampleRate*edgeFadeMs/1000),Math.max(1,Math.floor(frames/2)));
 const bytesPerSample=bitDepth/8,blockAlign=channels*bytesPerSample;
 const dataBytes=frames*blockAlign;
 // Non-PCM IEEE float uses WAVEFORMATEX (fmt size 18) and a fact chunk.
 // Integer PCM keeps the historical 44-byte header byte-for-byte.
 const isFloat=bitDepth===32, headerBytes=isFloat?58:44;
 if (!Number.isSafeInteger(dataBytes) || dataBytes > 0xffffffff-(headerBytes-8))
  throw new Error('WAV 출력 크기가 RIFF 형식의 한도를 초과합니다.');
 const l=buf.getChannelData(0),r=buf.getChannelData(buf.numberOfChannels>1?1:0);
 if (!l || !r || l.length!==buf.length || r.length!==buf.length)
  throw new Error('WAV 출력 채널 길이가 일치하지 않습니다.');
 const arr=new ArrayBuffer(headerBytes+dataBytes),v=new DataView(arr);
 const str=(pos,s)=>{for(let i=0;i<s.length;i++)v.setUint8(pos+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,headerBytes-8+dataBytes,true);str(8,'WAVE');str(12,'fmt ');
 v.setUint32(16,isFloat?18:16,true);v.setUint16(20,isFloat?3:1,true);v.setUint16(22,channels,true);
 v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*blockAlign,true);
 v.setUint16(32,blockAlign,true);v.setUint16(34,bitDepth,true);
 if(isFloat){
  v.setUint16(36,0,true); // cbSize: no extra format bytes
  str(38,'fact');v.setUint32(42,4,true);v.setUint32(46,frames,true);
  str(50,'data');v.setUint32(54,dataBytes,true);
 } else {str(36,'data');v.setUint32(40,dataBytes,true);}
 let off=headerBytes;
 const dither=dither16?createWavTpdfDither():null;
 for(let i=startFrame;i<finalFrame;i++){
  // Always read the original channels; mono output averages L/R before gain.
  // Stereo/default output keeps the original sample order and quantization.
  const gain=fadeFrames===0?exportGain:exportGain*wavEdgeGain(i-startFrame,frames,fadeFrames);
  const samples=channels===1?[(l[i]+r[i])/2*gain]:[l[i]*gain,r[i]*gain];
  for(const sample of samples){
   // 16-bit intentionally matches the previous Math.max/min + DataView truncation.
   if(isFloat){
    // Float WAV intentionally retains peaks above 0 dBFS unless protection
    // is selected. Non-finite DSP results must not enter an output file.
    v.setFloat32(off,Number.isFinite(sample)?sample:0,true);off+=4;
    continue;
   }
   const s=Math.max(-1,Math.min(1,sample));
   if(bitDepth===16){
    // Keep the historical truncating quantizer byte-identical when disabled.
    // With dither, use symmetric rounding and saturate after adding TPDF noise.
    const pcm=dither?Math.max(-32768,Math.min(32767,Math.round(s*32768+dither()))):s<0?s*32768:s*32767;
    v.setInt16(off,pcm,true);off+=2;
   }
   else {
    const n=Math.trunc(s<0?s*8388608:s*8388607);
    v.setUint8(off++,n&255);v.setUint8(off++,(n>>8)&255);v.setUint8(off++,(n>>16)&255);
   }
  }
 }
 return new Blob([arr],{type:'audio/wav'});
}
