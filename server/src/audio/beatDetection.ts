/**
 * BEAT DETECTION — real DSP, not a fixed tempo
 * -----------------------------------------------
 * Standard energy-based onset detection + autocorrelation tempo
 * estimation, run on the actual decoded PCM16 samples of an uploaded
 * audio file (see audio/audioTranscode.ts for how those bytes get here —
 * this never touches a compressed/container format directly, only the
 * same s16le mono buffer that already gets sent to the robot's speaker).
 * This is what makes performance/DanceRunner.ts's beat-synced mode
 * genuinely synced to *this* track's actual rhythm, not the previous
 * fixed-400ms-per-move choreography.
 *
 * Pipeline:
 *   1. Short-time energy in overlapping windows.
 *   2. Onset envelope = half-wave-rectified frame-to-frame energy
 *      increase ("energy flux") — a real, if simple, onset-strength
 *      signal; a full spectral-flux detector would need an FFT per
 *      frame, which is more accurate but unnecessary for driving a
 *      handful of discrete dance-move switches.
 *   3. Autocorrelate the onset envelope over the lag range for
 *      plausible dance tempos to find the dominant periodicity -> BPM.
 *   4. Lay a beat grid at that period, phase-aligned to the strongest
 *      onset peak near the start of the track.
 */

export interface BeatDetectionResult {
  bpm: number;
  /** Beat timestamps in milliseconds from the start of the track. */
  beatTimestampsMs: number[];
  /** 0-1 — how strong/periodic the detected tempo is (ratio of the
   * winning autocorrelation lag's strength to the envelope's own
   * energy). Low confidence (e.g. near-silent or arrhythmic audio)
   * should make callers fall back to a fixed default tempo rather than
   * trust a shaky detection. */
  confidence: number;
}

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_BPM = 60;
const MAX_BPM = 180;

/** Parses a mono s16le buffer (see audioTranscode.ts's transcodeToPcm16
 * output) into normalized [-1, 1] float samples. */
function pcm16ToFloatSamples(buffer: Buffer): Float32Array {
  const sampleCount = Math.floor(buffer.length / 2);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buffer.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

function computeOnsetEnvelope(samples: Float32Array): number[] {
  const energies: number[] = [];
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    let sumSquares = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = samples[start + i];
      sumSquares += s * s;
    }
    energies.push(Math.sqrt(sumSquares / FRAME_SIZE));
  }

  // Half-wave-rectified frame-to-frame increase — an onset is "energy
  // went up", not "energy is high" (which would just track loudness).
  const onset: number[] = [0];
  for (let i = 1; i < energies.length; i++) {
    onset.push(Math.max(0, energies[i] - energies[i - 1]));
  }
  return onset;
}

/** Autocorrelates the onset envelope over the lag range corresponding to
 * MIN_BPM..MAX_BPM at this envelope's frame rate, returning the winning
 * lag (in frames) and how strong that periodicity is relative to the
 * envelope's own energy (used as the confidence figure). */
function findDominantPeriod(onset: number[], frameRateHz: number): { lagFrames: number; strength: number } {
  const minLag = Math.floor((60 / MAX_BPM) * frameRateHz);
  const maxLag = Math.ceil((60 / MIN_BPM) * frameRateHz);

  const scoreAt = new Map<number, number>();
  const scoreForLag = (lag: number): number => {
    const cached = scoreAt.get(lag);
    if (cached !== undefined) return cached;
    let score = 0;
    for (let i = 0; i + lag < onset.length; i++) {
      score += onset[i] * onset[i + lag];
    }
    scoreAt.set(lag, score);
    return score;
  };

  let totalEnergy = 0;
  for (const v of onset) totalEnergy += v * v;

  // A lag corresponding to a fractional number of frames (e.g. a true
  // period of 12.5 frames) splits its autocorrelation energy across the
  // two neighboring integer lags (12 and 13) instead of concentrating in
  // one bin — at low time resolution (few frames per beat) this can let
  // an exact-integer harmonic lag (e.g. 25, sitting cleanly on 2x the
  // true period) outscore the true fundamental purely from
  // quantization, not because it's actually the stronger periodicity.
  // Comparing each lag's score summed with its immediate neighbors
  // ("smoothed" autocorrelation) fixes this the same way it's handled
  // in real tempo-tracking literature, without needing sub-frame
  // interpolation.
  const smoothedScore = (lag: number): number => scoreForLag(lag - 1) + scoreForLag(lag) + scoreForLag(lag + 1);

  let bestLag = minLag;
  let bestSmoothed = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < onset.length; lag++) {
    const smoothed = smoothedScore(lag);
    if (smoothed > bestSmoothed) {
      bestSmoothed = smoothed;
      bestLag = lag;
    }
  }
  let bestScore = scoreForLag(bestLag);

  // Octave-error correction: even after smoothing, a signal can have
  // genuine secondary energy at exact multiples of the true period
  // (2x, 3x...) that scores comparably. The shorter (faster-tempo)
  // period is almost always the musically correct one when scores are
  // close, so prefer it.
  for (const divisor of [2, 3]) {
    const candidateLag = Math.round(bestLag / divisor);
    if (candidateLag < minLag) continue;
    const candidateSmoothed = smoothedScore(candidateLag);
    if (candidateSmoothed >= bestSmoothed * 0.7) {
      bestLag = candidateLag;
      bestSmoothed = candidateSmoothed;
      bestScore = scoreForLag(candidateLag);
    }
  }

  const strength = totalEnergy > 0 ? Math.max(0, Math.min(1, bestScore / totalEnergy)) : 0;
  return { lagFrames: bestLag, strength };
}

/** Finds the strongest onset peak within the first `withinFrames` frames
 * to phase-align the beat grid to something the track is actually doing,
 * rather than starting arbitrarily at t=0. */
function findStrongestEarlyOnsetFrame(onset: number[], withinFrames: number): number {
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < Math.min(withinFrames, onset.length); i++) {
    if (onset[i] > bestVal) {
      bestVal = onset[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Runs beat detection on a decoded mono PCM16 buffer. `sampleRateHz` must
 * match whatever transcodeToPcm16 was actually called with.
 */
export function detectBeats(pcm16Buffer: Buffer, sampleRateHz: number): BeatDetectionResult {
  const samples = pcm16ToFloatSamples(pcm16Buffer);
  if (samples.length < FRAME_SIZE * 4) {
    // Too short to say anything real about tempo — caller should treat
    // this as "use a fixed default," not trust a guess from almost no data.
    return { bpm: 120, beatTimestampsMs: [], confidence: 0 };
  }

  const onset = computeOnsetEnvelope(samples);
  const frameRateHz = sampleRateHz / HOP_SIZE;
  const { lagFrames, strength } = findDominantPeriod(onset, frameRateHz);

  const bpm = Math.round((60 * frameRateHz) / lagFrames);
  const periodMs = 60000 / bpm;

  const phaseFrame = findStrongestEarlyOnsetFrame(onset, lagFrames);
  const phaseMs = (phaseFrame * HOP_SIZE * 1000) / sampleRateHz;
  const trackDurationMs = (samples.length * 1000) / sampleRateHz;

  const beatTimestampsMs: number[] = [];
  for (let t = phaseMs; t < trackDurationMs; t += periodMs) {
    if (t >= 0) beatTimestampsMs.push(Math.round(t));
  }
  // Beats before the phase anchor still count (track doesn't start on a
  // beat necessarily) — walk backward from the anchor too.
  for (let t = phaseMs - periodMs; t >= 0; t -= periodMs) {
    beatTimestampsMs.unshift(Math.round(t));
  }

  return { bpm, beatTimestampsMs, confidence: strength };
}
