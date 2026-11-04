import { describe, it, expect } from "vitest";
import { generateDanceSequence, generateBeatSyncedDanceSequence, DANCE_FRAME_HOLD_MS } from "../../../src/performance/DanceChoreographer";

describe("generateDanceSequence", () => {
  it("produces enough frames to fill the requested duration", () => {
    const frames = generateDanceSequence(4000);
    const totalMs = frames.reduce((sum, f) => sum + f.holdMs, 0);
    expect(totalMs).toBeGreaterThanOrEqual(4000);
  });

  it("produces at least one frame even for a very short duration", () => {
    const frames = generateDanceSequence(10);
    expect(frames.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps every servo angle within the physical 0-180 range", () => {
    const frames = generateDanceSequence(8000);
    for (const frame of frames) {
      expect(frame.eyeAngle).toBeGreaterThanOrEqual(0);
      expect(frame.eyeAngle).toBeLessThanOrEqual(180);
    }
  });

  it("keeps rotation speeds within the continuous-servo -100..100 range", () => {
    const frames = generateDanceSequence(8000);
    for (const frame of frames) {
      expect(Math.abs(frame.leftRotationSpeed)).toBeLessThanOrEqual(100);
      expect(Math.abs(frame.rightRotationSpeed)).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic for the same duration", () => {
    expect(generateDanceSequence(6000)).toEqual(generateDanceSequence(6000));
  });

  it("uses the given frame hold duration", () => {
    const frames = generateDanceSequence(2000, 500);
    expect(frames.every((f) => f.holdMs === 500)).toBe(true);
  });

  it("defaults to DANCE_FRAME_HOLD_MS per frame", () => {
    const frames = generateDanceSequence(2000);
    expect(frames.every((f) => f.holdMs === DANCE_FRAME_HOLD_MS)).toBe(true);
  });
});

describe("generateBeatSyncedDanceSequence", () => {
  it("produces one move per beat", () => {
    const beats = [0, 500, 1000, 1500, 2000];
    const frames = generateBeatSyncedDanceSequence(beats);
    expect(frames).toHaveLength(beats.length);
  });

  it("returns no frames for an empty beat grid", () => {
    expect(generateBeatSyncedDanceSequence([])).toEqual([]);
  });

  it("sets each frame's holdMs to the real gap to the next beat", () => {
    const beats = [0, 500, 1300, 1800];
    const frames = generateBeatSyncedDanceSequence(beats);
    expect(frames[0].holdMs).toBe(500);
    expect(frames[1].holdMs).toBe(800);
    expect(frames[2].holdMs).toBe(500);
  });

  it("gives the last beat a sensible fallback hold rather than 0ms", () => {
    const beats = [0, 500, 1000];
    const frames = generateBeatSyncedDanceSequence(beats);
    expect(frames[frames.length - 1].holdMs).toBeGreaterThan(0);
  });

  it("never produces a hold shorter than the servo-safe minimum, even for very fast beats", () => {
    const beats = [0, 50, 100, 150]; // an unrealistically fast 1200 BPM
    const frames = generateBeatSyncedDanceSequence(beats);
    for (const frame of frames) {
      expect(frame.holdMs).toBeGreaterThanOrEqual(150);
    }
  });

  it("keeps every servo value within the same physical limits as the fixed-tempo sequence", () => {
    const beats = [0, 400, 900, 1200, 1700];
    const frames = generateBeatSyncedDanceSequence(beats);
    for (const frame of frames) {
      expect(frame.eyeAngle).toBeGreaterThanOrEqual(0);
      expect(frame.eyeAngle).toBeLessThanOrEqual(180);
      expect(Math.abs(frame.leftRotationSpeed)).toBeLessThanOrEqual(100);
      expect(Math.abs(frame.rightRotationSpeed)).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic for the same beat grid", () => {
    const beats = [0, 500, 1000, 1500];
    expect(generateBeatSyncedDanceSequence(beats)).toEqual(generateBeatSyncedDanceSequence(beats));
  });
});
