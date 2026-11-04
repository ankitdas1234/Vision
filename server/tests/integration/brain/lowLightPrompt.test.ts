import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { BrainOrchestrator } from "../../../src/brain/BrainOrchestrator";
import { resetMotionDetectorFor } from "../../../src/perception/motionDetection";
import { resetPresenceTrackingFor } from "../../../src/ultrasonic/PresenceDetector";
import { resetLowLightState, ASK_COOLDOWN_MS } from "../../../src/perception/LowLightAssistance";
import { ultrasonicService } from "../../../src/ultrasonic/UltrasonicService";

const ROBOT_ID = "vision-lowlight-test";

/** A frame that decodes fine but is far too dark to work with — exactly
 * the "someone's in an unlit room" case, not a broken camera. */
async function darkJpeg(gray = 6): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: gray, g: gray, b: gray } } })
    .jpeg()
    .toBuffer();
}

async function litJpeg(gray = 160): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: gray, g: gray, b: gray } } })
    .jpeg()
    .toBuffer();
}

/** Put a real reading through the median filter so the controller reports
 * near-field presence — no mocking, this is the same path the firmware uses. */
function reportSomeoneStandingClose() {
  for (let i = 0; i < 5; i++) ultrasonicService.ingest(400); // < safeDistanceMm 600 => NEAR
}

function reportEmptyRoom() {
  for (let i = 0; i < 5; i++) ultrasonicService.ingest(3000);
}

describe("low-light assistance through a real brain cycle", () => {
  beforeEach(() => {
    resetMotionDetectorFor(ROBOT_ID);
    resetPresenceTrackingFor(ROBOT_ID);
    resetLowLightState();
    vi.restoreAllMocks();
  });

  it("asks the person standing there to turn a light on", async () => {
    reportSomeoneStandingClose();
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);

    expect(result.perception.discardReason).toBe("TOO_DARK");
    expect(result.perception.lowLightPrompt).toMatch(/light|curtain/i);
    // It must actually be spoken, not just reported on the cycle result.
    const spoke = result.commandResults.some((c) => c.type === "AUDIO_SPEAK");
    expect(spoke).toBe(true);
  });

  it("says nothing to an empty dark room", async () => {
    reportEmptyRoom();
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);

    expect(result.perception.discardReason).toBe("TOO_DARK");
    expect(result.perception.lowLightPrompt).toBeNull();
  });

  it("does not repeat the request on every single cycle", async () => {
    reportSomeoneStandingClose();
    const brain = new BrainOrchestrator();
    const first = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);
    const second = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);
    const third = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);

    expect(first.perception.lowLightPrompt).not.toBeNull();
    expect(second.perception.lowLightPrompt).toBeNull();
    expect(third.perception.lowLightPrompt).toBeNull();
  });

  it("escalates to a different wording on the next ask once the cooldown passes", async () => {
    reportSomeoneStandingClose();
    const brain = new BrainOrchestrator();
    const first = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);

    // Advance the clock the module reads, WITHOUT faking timers — gesture
    // playback and the DB client both use real setTimeout, and freezing
    // those would deadlock the cycle rather than test it.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + ASK_COOLDOWN_MS + 1000);
    const second = await brain.observeAndReact(await darkJpeg(), ROBOT_ID);
    nowSpy.mockRestore();

    expect(second.perception.lowLightPrompt).not.toBeNull();
    expect(second.perception.lowLightPrompt).not.toBe(first.perception.lowLightPrompt);
    expect(second.perception.lowLightPrompt).toMatch(/door|window/i);
  });

  it("says nothing at all in a well-lit room", async () => {
    reportSomeoneStandingClose();
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await litJpeg(), ROBOT_ID);

    expect(result.perception.discardReason).not.toBe("TOO_DARK");
    expect(result.perception.lowLightPrompt).toBeNull();
  });
});
