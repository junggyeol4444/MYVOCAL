// Offline signal-level analysis. This does not infer chords, genre or musical key.
export function analyzeMusicStructure({samples, sampleRate, channels = 1, windowSeconds = 0.1}) {
  if (!(samples instanceof Float32Array || samples instanceof Float64Array)) throw new TypeError('PCM float samples required');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new RangeError('Invalid sample rate');
  if (!Number.isInteger(channels) || channels < 1 || channels > 32 || samples.length % channels) throw new RangeError('Invalid channels');
  if (!Number.isFinite(windowSeconds) || windowSeconds < 0.01 || windowSeconds > 2) throw new RangeError('Invalid window');
  const frameSize = Math.max(1, Math.round(sampleRate * windowSeconds));
  const frames = samples.length / channels;
  const windows = [];
  let peak = 0, sumSquares = 0;
  for (let start = 0; start < frames; start += frameSize) {
    const end = Math.min(frames, start + frameSize);
    let energy = 0;
    for (let f = start; f < end; f++) {
      let mono = 0;
      for (let c = 0; c < channels; c++) {
        const value = samples[f * channels + c];
        if (!Number.isFinite(value)) throw new RangeError('Nonfinite PCM sample');
        peak = Math.max(peak, Math.abs(value));
        sumSquares += value * value;
        mono += value;
      }
      mono /= channels;
      energy += mono * mono;
    }
    windows.push({startSeconds: start / sampleRate, endSeconds: end / sampleRate, rms: Math.sqrt(energy / (end - start))});
  }
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
  const loudness = windows.map(w => w.rms);
  const threshold = Math.max(0.005, Math.max(0, ...loudness) * 0.2);
  const activeRegions = [];
  let open = null;
  for (const w of windows) {
    if (w.rms >= threshold && open === null) open = w.startSeconds;
    if (w.rms < threshold && open !== null) { activeRegions.push({startSeconds: open, endSeconds: w.startSeconds}); open = null; }
  }
  if (open !== null) activeRegions.push({startSeconds: open, endSeconds: frames / sampleRate});
  return {durationSeconds: frames / sampleRate, sampleRate, channels, peak, rms, windows, activeRegions, analysisType: 'signal-energy-only', bpm: null, key: null, chords: null, genre: null};
}
