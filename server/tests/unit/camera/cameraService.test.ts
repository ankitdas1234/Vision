import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("../../../src/camera/mediaStorage", () => ({
  storeMedia: vi.fn(async () => ({ stored: true, googleDriveFileId: "file-123", googleDriveUrl: "https://drive.example/file-123" })),
}));

import { cameraService } from "../../../src/camera/CameraService";
import { storeMedia } from "../../../src/camera/mediaStorage";
import { resetMotionDetectorFor } from "../../../src/perception/motionDetection";

async function solidColorJpeg(gray: number): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: gray, g: gray, b: gray } } })
    .jpeg()
    .toBuffer();
}

// Deliberately random (not a smooth gradient/pattern) so it survives the
// pre-attentive downsample with real contrast/sharpness, the same way real
// camera sensor noise + scene texture does. Two independent calls will
// almost certainly differ enough to register as motion, one reused buffer
// will not.
async function noisyJpeg(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("CameraService.capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMotionDetectorFor("test-robot");
  });

  it("never stores a blank/uniform frame", async () => {
    const buffer = await solidColorJpeg(128);
    const result = await cameraService.capture(buffer, "test-robot");
    expect(result.stored).toBe(false);
    expect(result.discarded).toBe(true);
    expect(result.discardReason).toBe("BLANK_UNIFORM");
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it("never stores a corrupted/unreadable frame", async () => {
    const result = await cameraService.capture(Buffer.from("not a real image"), "test-robot");
    expect(result.stored).toBe(false);
    expect(result.discarded).toBe(true);
    expect(result.discardReason).toBe("DECODE_ERROR");
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it("stores the first usable frame of a scene (no baseline yet to compare against)", async () => {
    const buffer = await noisyJpeg();
    const result = await cameraService.capture(buffer, "test-robot");
    expect(result.discarded).toBe(false);
    expect(result.stored).toBe(true);
    expect(storeMedia).toHaveBeenCalledTimes(1);
  });

  it("skips storing a second frame identical to the first — nothing changed", async () => {
    const buffer = await noisyJpeg();
    await cameraService.capture(buffer, "test-robot");
    const second = await cameraService.capture(buffer, "test-robot");
    expect(second.stored).toBe(false);
    expect(second.discarded).toBe(false);
    expect(second.skippedReason).toBe("NO_CHANGE");
    expect(storeMedia).toHaveBeenCalledTimes(1);
  });

  it("stores a subsequent frame once the scene actually changes", async () => {
    await cameraService.capture(await noisyJpeg(), "test-robot");
    const changed = await cameraService.capture(await noisyJpeg(), "test-robot");
    expect(changed.stored).toBe(true);
    expect(storeMedia).toHaveBeenCalledTimes(2);
  });
});
