import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { BrainOrchestrator } from "../../../src/brain/BrainOrchestrator";
import { noteAnnoyance, clearAnnoyance, ANNOYANCE_DECAY_MS } from "../../../src/mental/Annoyance";
import { resetMotionDetectorFor } from "../../../src/perception/motionDetection";
import { resetPresenceTrackingFor } from "../../../src/ultrasonic/PresenceDetector";
import { resetLowLightState } from "../../../src/perception/LowLightAssistance";

/** The robot code the camera route and the conversation route both use
 * (`req.body?.robotId ?? "vision-001"` / `ROBOT_HARDWARE.robotCode`) — if
 * these ever drift apart, irritation set by a conversation would never be
 * seen by the brain loop, and this test is what would catch it. */
const ROBOT_ID = "vision-001";

async function ordinaryFrame(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = 90 + Math.floor(Math.random() * 120);
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("irritation set by the conversation layer shows up in the brain's mood", () => {
  beforeEach(() => {
    resetMotionDetectorFor(ROBOT_ID);
    resetPresenceTrackingFor(ROBOT_ID);
    resetLowLightState();
    clearAnnoyance();
    vi.restoreAllMocks();
  });

  it("is NEUTRAL-ish while nothing is irritating it", async () => {
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await ordinaryFrame(), ROBOT_ID);
    expect(result.mentalState.mood).not.toBe("ANNOYED");
  });

  it("reads ANNOYED while the flag is set", async () => {
    noteAnnoyance(ROBOT_ID, 2);
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await ordinaryFrame(), ROBOT_ID);
    expect(result.mentalState.mood).toBe("ANNOYED");
    expect(result.perception.gesturePlayed).toBe("ANNOYED_TURN_AWAY");
  }, 15_000);

  it("calms down on its own once it has decayed", async () => {
    noteAnnoyance(ROBOT_ID, 3);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + ANNOYANCE_DECAY_MS + 1000);
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await ordinaryFrame(), ROBOT_ID);
    expect(result.mentalState.mood).not.toBe("ANNOYED");
  }, 15_000);
});
