import { describe, it, expect, vi } from "vitest";

// queueForPlayback calls the real ffmpeg-static transcode pipeline, which
// needs an ffmpeg binary not available in this sandbox (see
// tests/unit/audio/audioTranscode.test.ts's own equivalent workaround) —
// mocked here since this test is about the beat-sync/fallback decision,
// not the transcode step itself.
vi.mock("../../../src/music/MusicUploadService", () => ({
  musicUploadService: { queueForPlayback: vi.fn().mockResolvedValue(undefined) },
}));

import { runDanceToBeats } from "../../../src/performance/DanceRunner";
import { taskManager } from "../../../src/tasks/TaskManager";
import type { MusicTrackRow } from "../../../src/repositories/musicTracks.repository";

function makeTrack(overrides: Partial<MusicTrackRow> = {}): MusicTrackRow {
  return {
    id: "track-1",
    title: "Test Track",
    uploadedByUserId: null,
    mediaId: null,
    durationMs: 4000,
    bpm: 120,
    beatConfidence: 0.8,
    beatTimestampsMs: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500],
    checksum: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("runDanceToBeats", () => {
  it("uses the real beat grid (one move per beat) when confidence is high", async () => {
    const track = makeTrack();
    const task = taskManager.create({ robotId: "vision-001", taskType: "DANCE", input: {}, description: "test" });

    await runDanceToBeats(task.id, "vision-001", track, Buffer.from("fake-audio"));

    const finalTask = taskManager.get(task.id);
    expect(finalTask?.result?.totalFrames).toBe(track.beatTimestampsMs.length);
  });

  it("falls back to fixed-tempo choreography when beat confidence is too low", async () => {
    const track = makeTrack({ beatConfidence: 0.02, beatTimestampsMs: [0, 500] });
    const task = taskManager.create({ robotId: "vision-001", taskType: "DANCE", input: {}, description: "test" });

    await runDanceToBeats(task.id, "vision-001", track, Buffer.from("fake-audio"));

    const finalTask = taskManager.get(task.id);
    // Fixed-tempo fallback is driven by track.durationMs (4000ms), not by
    // the (untrustworthy) 2-beat grid — so frame count should reflect
    // the fixed cadence over the full duration, not just 2 frames.
    expect(finalTask?.result?.totalFrames).toBeGreaterThan(2);
  });

  it("falls back to fixed-tempo choreography when too few beats were detected", async () => {
    const track = makeTrack({ beatConfidence: 0.9, beatTimestampsMs: [500] }); // only 1 beat
    const task = taskManager.create({ robotId: "vision-001", taskType: "DANCE", input: {}, description: "test" });

    await runDanceToBeats(task.id, "vision-001", track, Buffer.from("fake-audio"));

    const finalTask = taskManager.get(task.id);
    expect(finalTask?.result?.totalFrames).toBeGreaterThan(1);
  });
});
