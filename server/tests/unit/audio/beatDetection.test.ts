import { describe, it, expect } from "vitest";
import { detectBeats } from "../../../src/audio/beatDetection";

const SAMPLE_RATE = 16000;

/** Builds a synthetic mono PCM16 buffer: silence with a short loud burst
 * ("click") every `intervalMs`, for `durationMs` total — a click track at
 * an exact, known BPM (60000 / intervalMs), the standard way to validate
 * a beat detector against ground truth rather than real music (whose
 * "true" beat positions are subjective/hard to independently verify). */
function buildClickTrack(bpm: number, durationMs: number, sampleRateHz = SAMPLE_RATE): Buffer {
  const intervalMs = 60000 / bpm;
  const totalSamples = Math.floor((durationMs / 1000) * sampleRateHz);
  const buffer = Buffer.alloc(totalSamples * 2);
  const clickSamples = Math.floor(0.02 * sampleRateHz); // 20ms click burst

  for (let t = 0; t < durationMs; t += intervalMs) {
    const startSample = Math.floor((t / 1000) * sampleRateHz);
    for (let i = 0; i < clickSamples && startSample + i < totalSamples; i++) {
      // Consistent-amplitude noise burst — a real percussive click has
      // fairly stable loudness hit to hit; varying it randomly per
      // sample (rather than varying loudness *between* clicks) still
      // gives each click the same total energy, which is what a beat
      // detector should be able to rely on.
      const value = Math.round((Math.random() * 2 - 1) * 32000);
      buffer.writeInt16LE(value, (startSample + i) * 2);
    }
  }
  return buffer;
}

describe("detectBeats", () => {
  it("recovers approximately the correct BPM from a 120 BPM click track", () => {
    const track = buildClickTrack(120, 8000);
    const result = detectBeats(track, SAMPLE_RATE);
    expect(result.bpm).toBeGreaterThanOrEqual(115);
    expect(result.bpm).toBeLessThanOrEqual(125);
  });

  it("recovers approximately the correct BPM from a 90 BPM click track", () => {
    const track = buildClickTrack(90, 8000);
    const result = detectBeats(track, SAMPLE_RATE);
    expect(result.bpm).toBeGreaterThanOrEqual(85);
    expect(result.bpm).toBeLessThanOrEqual(95);
  });

  it("recovers approximately the correct BPM from a 150 BPM click track", () => {
    const track = buildClickTrack(150, 8000);
    const result = detectBeats(track, SAMPLE_RATE);
    expect(result.bpm).toBeGreaterThanOrEqual(140);
    expect(result.bpm).toBeLessThanOrEqual(160);
  });

  it("produces a roughly even number of beats for the track duration", () => {
    const track = buildClickTrack(120, 8000); // 8s at 120bpm = 16 beats
    const result = detectBeats(track, SAMPLE_RATE);
    expect(result.beatTimestampsMs.length).toBeGreaterThan(10);
    expect(result.beatTimestampsMs.length).toBeLessThan(20);
  });

  it("reports higher confidence for a strongly periodic click track than for noise", () => {
    const clickTrack = buildClickTrack(120, 8000);
    const clickResult = detectBeats(clickTrack, SAMPLE_RATE);

    const noiseBuffer = Buffer.alloc(8000 * (SAMPLE_RATE / 1000) * 2);
    for (let i = 0; i < noiseBuffer.length / 2; i++) {
      noiseBuffer.writeInt16LE(Math.round((Math.random() * 2 - 1) * 30000), i * 2);
    }
    const noiseResult = detectBeats(noiseBuffer, SAMPLE_RATE);

    expect(clickResult.confidence).toBeGreaterThan(noiseResult.confidence);
  });

  it("returns a safe default (not a crash or NaN) for audio too short to analyze", () => {
    const tinyBuffer = Buffer.alloc(100);
    const result = detectBeats(tinyBuffer, SAMPLE_RATE);
    expect(result.bpm).toBe(120);
    expect(result.beatTimestampsMs).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("beat timestamps land close to the actual click positions", () => {
    const track = buildClickTrack(120, 8000);
    const result = detectBeats(track, SAMPLE_RATE);
    // Ground truth clicks are at 0, 500, 1000, 1500... ms
    const expectedPeriod = 500;
    // Check that consecutive detected beats are spaced close to the true period.
    for (let i = 1; i < result.beatTimestampsMs.length; i++) {
      const gap = result.beatTimestampsMs[i] - result.beatTimestampsMs[i - 1];
      expect(gap).toBeGreaterThan(expectedPeriod * 0.85);
      expect(gap).toBeLessThan(expectedPeriod * 1.15);
    }
  });
});
