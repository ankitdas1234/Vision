import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";
import { BrainOrchestrator } from "../../../src/brain/BrainOrchestrator";
import { resetMotionDetectorFor } from "../../../src/perception/motionDetection";
import { resetPresenceTrackingFor } from "../../../src/ultrasonic/PresenceDetector";

const ROBOT_ID = "vision-integration-test";

async function solidColorJpeg(gray: number): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: gray, g: gray, b: gray } } })
    .jpeg()
    .toBuffer();
}

function sharedNoiseBuffer(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return pixels;
}

/** Builds a frame from a shared noisy background (so an unchanged background
 * never registers as motion) with an optional tall, bright, person-shaped
 * blob composited on top — isolates the motion ROI to just the blob. */
async function sceneJpeg(background: Buffer, withPersonBlob: boolean, width = 320, height = 240): Promise<Buffer> {
  const pixels = Buffer.from(background);
  if (withPersonBlob) {
    for (let y = 40; y < 220; y++) {
      for (let x = 120; x < 180; x++) {
        const idx = (y * width + x) * 3;
        pixels[idx] = 250;
        pixels[idx + 1] = 250;
        pixels[idx + 2] = 250;
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("BrainOrchestrator (full sense -> orient -> attend -> detect pipeline)", () => {
  beforeEach(() => {
    resetMotionDetectorFor(ROBOT_ID);
    resetPresenceTrackingFor(ROBOT_ID);
  });

  it("a blank frame completes a cycle with no false person/object detections", async () => {
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(await solidColorJpeg(128), ROBOT_ID);
    expect(result.perception.frameDiscarded).toBe(true);
    expect(result.perception.discardReason).toBe("BLANK_UNIFORM");
    expect(result.perception.personDetected).toBe(false);
    expect(result.decision).toBeTruthy();
    expect(result.reaction).toBeTruthy();
  });

  it("a person-shaped foreground blob is detected once the scene changes", async () => {
    const brain = new BrainOrchestrator();
    const background = sharedNoiseBuffer(320, 240);
    // First frame establishes the room's baseline (textured, but no blob).
    await brain.observeAndReact(await sceneJpeg(background, false), ROBOT_ID);
    // Second frame: a person-shaped blob appears against the same background.
    const result = await brain.observeAndReact(await sceneJpeg(background, true), ROBOT_ID);

    expect(result.perception.frameDiscarded).toBe(false);
    expect(result.perception.motionDetected).toBe(true);
    expect(result.perception.personDetected).toBe(true);
    expect(result.decision.decision).not.toBe("IGNORE");
  });

  it("never throws on an unreadable buffer and still returns a complete result", async () => {
    const brain = new BrainOrchestrator();
    const result = await brain.observeAndReact(Buffer.from("mock"), ROBOT_ID);
    expect(result.observationId).toBeTruthy();
    expect(result.decision).toBeTruthy();
    expect(result.perception.frameDiscarded).toBe(true);
  });
});
