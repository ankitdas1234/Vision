import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { analyzeFrame, DEFAULT_FRAME_QUALITY_THRESHOLDS } from "../../../src/camera/imageProcessor";

async function solidColorJpeg(gray: number): Promise<Buffer> {
  return sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: gray, g: gray, b: gray } },
  })
    .jpeg()
    .toBuffer();
}

async function noisyJpeg(): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe("analyzeFrame (pre-attentive quality filter)", () => {
  it("marks a garbage/non-image buffer as a decode error, never throws", async () => {
    const quality = await analyzeFrame(Buffer.from("this is not a jpeg"));
    expect(quality.isReadable).toBe(false);
    expect(quality.isUsable).toBe(false);
    expect(quality.discardReason).toBe("DECODE_ERROR");
  });

  it("discards a uniform gray frame as blank — nothing to see", async () => {
    const buffer = await solidColorJpeg(128);
    const quality = await analyzeFrame(buffer);
    expect(quality.isReadable).toBe(true);
    expect(quality.isUsable).toBe(false);
    expect(quality.discardReason).toBe("BLANK_UNIFORM");
    expect(quality.blankScore).toBeGreaterThan(0.5);
  });

  it("discards a near-black frame as too dark (e.g. a covered lens)", async () => {
    const buffer = await solidColorJpeg(2);
    const quality = await analyzeFrame(buffer);
    expect(quality.isUsable).toBe(false);
    expect(quality.discardReason).toBe("TOO_DARK");
  });

  it("discards a blown-out white frame as too bright", async () => {
    const buffer = await solidColorJpeg(253);
    const quality = await analyzeFrame(buffer);
    expect(quality.isUsable).toBe(false);
    expect(quality.discardReason).toBe("TOO_BRIGHT");
  });

  it("accepts a frame with real detail as usable", async () => {
    const buffer = await noisyJpeg();
    const quality = await analyzeFrame(buffer);
    expect(quality.isReadable).toBe(true);
    expect(quality.isUsable).toBe(true);
    expect(quality.discardReason).toBeNull();
    expect(quality.width).toBe(320);
    expect(quality.height).toBe(240);
  });

  it("reports real decoded dimensions instead of a hardcoded default", async () => {
    const buffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 200, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const quality = await analyzeFrame(buffer);
    expect(quality.width).toBe(800);
    expect(quality.height).toBe(600);
  });

  it("exposes a reusable downsampled grid for motion detection", async () => {
    const buffer = await noisyJpeg();
    const quality = await analyzeFrame(buffer, DEFAULT_FRAME_QUALITY_THRESHOLDS);
    expect(quality.graySamples.length).toBe(quality.gridWidth * quality.gridHeight);
  });
});
