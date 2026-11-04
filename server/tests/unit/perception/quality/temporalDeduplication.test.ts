import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { TemporalDeduplicator, computePerceptualHash } from "../../../../src/perception/quality/temporalDeduplication";

async function solidColorJpeg(r: number, g: number, b: number, width = 100, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
}

/** dHash measures internal left-right pixel gradients, so a flat solid
 * color always hashes to all-zero bits regardless of which color it is —
 * these tests need images with actual internal structure. */
async function verticalStripesJpeg(stripeWidth: number, width = 100, height = 100): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">${Array.from({ length: Math.ceil(width / stripeWidth) })
      .map((_, i) => `<rect x="${i * stripeWidth}" y="0" width="${stripeWidth}" height="${height}" fill="${i % 2 === 0 ? "#000000" : "#ffffff"}"/>`)
      .join("")}</svg>`,
  );
  return sharp(svg).jpeg().toBuffer();
}

async function diagonalGradientJpeg(width = 100, height = 100): Promise<Buffer> {
  const svg = Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#000000"/><stop offset="100%" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/></svg>`);
  return sharp(svg).jpeg().toBuffer();
}

async function noisyVariant(base: Buffer): Promise<Buffer> {
  // Re-encode at a different JPEG quality to simulate sensor
  // noise/recompression jitter without changing the actual content.
  return sharp(base).jpeg({ quality: 60 }).toBuffer();
}

describe("computePerceptualHash", () => {
  it("produces a 16-hex-char (64-bit) hash", async () => {
    const hash = await computePerceptualHash(await solidColorJpeg(100, 150, 200));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces the same hash for a re-encoded near-identical image", async () => {
    const base = await solidColorJpeg(80, 120, 60);
    const variant = await noisyVariant(base);
    const h1 = await computePerceptualHash(base);
    const h2 = await computePerceptualHash(variant);
    expect(h1).toBe(h2);
  });

  it("produces different hashes for visually different images", async () => {
    const a = await computePerceptualHash(await verticalStripesJpeg(10));
    const b = await computePerceptualHash(await diagonalGradientJpeg());
    expect(a).not.toBe(b);
  });
});

describe("TemporalDeduplicator", () => {
  let dedup: TemporalDeduplicator;

  beforeEach(() => {
    dedup = new TemporalDeduplicator();
    vi.useRealTimers();
  });

  it("does not flag the first frame in a track as a duplicate", async () => {
    const result = await dedup.check("track-1", await solidColorJpeg(10, 10, 10));
    expect(result.isDuplicate).toBe(false);
    expect(result.closestDistanceToHistory).toBeNull();
  });

  it("flags a near-identical consecutive frame as a duplicate", async () => {
    const base = await solidColorJpeg(50, 100, 150);
    await dedup.check("track-2", base);
    const result = await dedup.check("track-2", await noisyVariant(base));
    expect(result.isDuplicate).toBe(true);
  });

  it("does not flag a genuinely different frame as a duplicate", async () => {
    await dedup.check("track-3", await verticalStripesJpeg(10));
    const result = await dedup.check("track-3", await diagonalGradientJpeg());
    expect(result.isDuplicate).toBe(false);
  });

  it("keeps different tracks independent", async () => {
    const base = await solidColorJpeg(30, 60, 90);
    await dedup.check("track-a", base);
    // Same image, but a different track's history — must not be
    // deduplicated against another track's frames.
    const result = await dedup.check("track-b", base);
    expect(result.isDuplicate).toBe(false);
  });

  it("clearTrack removes history for that track only", async () => {
    const base = await solidColorJpeg(20, 40, 60);
    await dedup.check("track-x", base);
    dedup.clearTrack("track-x");
    const result = await dedup.check("track-x", await noisyVariant(base));
    expect(result.isDuplicate).toBe(false);
  });

  it("exposes activeTrackCount", async () => {
    await dedup.check("t1", await solidColorJpeg(1, 2, 3));
    await dedup.check("t2", await solidColorJpeg(4, 5, 6));
    expect(dedup.activeTrackCount).toBe(2);
  });
});
