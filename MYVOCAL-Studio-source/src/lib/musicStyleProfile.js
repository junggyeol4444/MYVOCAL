// Step54: reproducible, local-only style profile from rights-cleared signal analysis.
// Energy descriptors are not inferred genre, BPM, melody, key or trained AI weights.
import { assertLearningPermission } from './learningRights.js';
const finite = n => typeof n === 'number' && Number.isFinite(n);
function rounded(n) { return Math.round(n * 1000000) / 1000000; }
export function createMusicStyleProfile({id, name, entries}) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid profile ID');
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('Invalid profile name');
  if (!Array.isArray(entries) || !entries.length || entries.length > 1000) throw new Error('Invalid source entries');
  const ids = new Set(), sources = []; let peakSum = 0, rmsSum = 0, activeSum = 0, durationSum = 0;
  for (const entry of entries) {
    const {music, analysis} = entry || {};
    if (!music || typeof music.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(music.id) || !/^[a-f0-9]{64}$/i.test(music.sha256 || '')) throw new Error('Invalid music manifest');
    assertLearningPermission(music.rights, 'style-learning');
    if (ids.has(music.id)) throw new Error('Duplicate source');
    ids.add(music.id);
    if (!analysis || analysis.analysisType !== 'signal-energy-only' || !finite(analysis.durationSeconds) || analysis.durationSeconds <= 0 || !finite(analysis.peak) || analysis.peak < 0 || !finite(analysis.rms) || analysis.rms < 0 || !Array.isArray(analysis.activeRegions)) throw new Error('Invalid signal analysis');
    let active = 0, previousEnd = 0;
    for (const region of analysis.activeRegions) {
      if (!region || !finite(region.startSeconds) || !finite(region.endSeconds) || region.startSeconds < previousEnd || region.endSeconds <= region.startSeconds || region.endSeconds > analysis.durationSeconds + 1e-8) throw new Error('Invalid active region');
      active += region.endSeconds - region.startSeconds; previousEnd = region.endSeconds;
    }
    peakSum += analysis.peak * analysis.durationSeconds;
    rmsSum += analysis.rms * analysis.durationSeconds;
    activeSum += active;
    durationSum += analysis.durationSeconds;
    sources.push(Object.freeze({musicId: music.id, sha256: music.sha256.toLowerCase()}));
  }
  return Object.freeze({schemaVersion: 1, id, name: name.trim(), type: 'my-music-style', sourceCount: sources.length, sources: Object.freeze(sources), descriptors: Object.freeze({meanPeak: rounded(peakSum / durationSum), meanRms: rounded(rmsSum / durationSum), activeFraction: rounded(activeSum / durationSum), totalDurationSeconds: rounded(durationSum)}), unavailable: Object.freeze(['bpm','key','chords','melody','genre','instrumentation']), trainingPerformed: false});
}
