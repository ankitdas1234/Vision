import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { scoreFaceQuality } from "../../../../src/perception/quality/faceQuality";
import type { FaceDetectionResult, Point2D } from "../../../../src/perception/faceDetection";

/** Builds a synthetic, roughly-symmetric frontal-face landmark set
 * centered at (cx, cy) with the given face width — good enough to
 * exercise the pose/occlusion math without needing a real detector. */
function frontalLandmarks(cx: number, cy: number, faceWidth: number): { landmarks68: Point2D[]; landmarks5: FaceDetectionResult["landmarks5"] } {
  const half = faceWidth / 2;
  const jaw: Point2D[] = Array.from({ length: 17 }, (_, i) => ({ x: cx - half + (i / 16) * faceWidth, y: cy + half * 0.9 }));
  const brows: Point2D[] = Array.from({ length: 10 }, (_, i) => ({ x: cx - half * 0.6 + i * (faceWidth * 0.12), y: cy - half * 0.3 }));
  const noseBridge: Point2D[] = Array.from({ length: 4 }, (_, i) => ({ x: cx, y: cy - half * 0.1 + i * 5 }));
  // Chosen so noseToChin/jawWidth lands close to the ~0.42 expected ratio.
  const noseBottom: Point2D[] = [
    { x: cx - 10, y: cy + half * 0.32 },
    { x: cx - 5, y: cy + half * 0.36 },
    { x: cx, y: cy + half * 0.38 },
    { x: cx + 5, y: cy + half * 0.36 },
    { x: cx + 10, y: cy + half * 0.32 },
  ];
  // Eye centers ~0.25*faceWidth either side of center, so eyeSpan/jawWidth
  // lands close to the ~0.5 expected ratio.
  const leftEye: Point2D[] = Array.from({ length: 6 }, (_, i) => ({ x: cx - half * 0.5 - 15 + i * 6, y: cy - half * 0.15 }));
  const rightEye: Point2D[] = Array.from({ length: 6 }, (_, i) => ({ x: cx + half * 0.5 - 15 + i * 6, y: cy - half * 0.15 }));
  const mouth: Point2D[] = Array.from({ length: 20 }, (_, i) => {
    const t = i / 19;
    return { x: cx - half * 0.35 + t * faceWidth * 0.35, y: cy + half * 0.45 };
  });

  const landmarks68 = [...jaw, ...brows, ...noseBridge, ...noseBottom, ...leftEye, ...rightEye, ...mouth];

  return {
    landmarks68,
    landmarks5: {
      leftEye: { x: cx - half * 0.5, y: cy - half * 0.15 },
      rightEye: { x: cx + half * 0.5, y: cy - half * 0.15 },
      nose: { x: cx, y: cy + half * 0.3 },
      leftMouth: mouth[0],
      rightMouth: mouth[19],
    },
  };
}

async function checkerboardJpeg(width: number, height: number, cellSize = 6): Promise<Buffer> {
  // High-contrast, high-frequency pattern that survives JPEG compression
  // and downsampling far better than per-pixel random noise, which gets
  // smoothed away by chroma/luma compression — a genuinely sharp-looking
  // synthetic image for exercising the blur-rejection path's "accept" side.
  const rows = Math.ceil(height / cellSize);
  const cols = Math.ceil(width / cellSize);
  let rects = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      rects += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
    }
  }
  const svg = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff"/>${rects}</svg>`);
  return sharp(svg).jpeg({ quality: 95 }).toBuffer();
}

async function flatJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } }).jpeg().toBuffer();
}

function detectionAt(cx: number, cy: number, faceWidth: number, detectorConfidence = 0.9): FaceDetectionResult {
  const { landmarks68, landmarks5 } = frontalLandmarks(cx, cy, faceWidth);
  return {
    boundingBox: { x: cx - faceWidth / 2, y: cy - faceWidth / 2, width: faceWidth, height: faceWidth },
    detectorConfidence,
    landmarks68,
    landmarks5,
  };
}

describe("scoreFaceQuality", () => {
  it("accepts a large, sharp, frontal, high-confidence face", async () => {
    const frameSize = 400;
    const image = await checkerboardJpeg(frameSize, frameSize);
    const detection = detectionAt(frameSize / 2, frameSize / 2, 200, 0.95);
    const score = await scoreFaceQuality(image, frameSize, frameSize, detection);
    expect(score.isUsable).toBe(true);
    expect(score.rejectReasons).toHaveLength(0);
  });

  it("rejects a face that's too small relative to the frame", async () => {
    const frameSize = 800;
    const image = await checkerboardJpeg(frameSize, frameSize);
    const detection = detectionAt(frameSize / 2, frameSize / 2, 20, 0.95);
    const score = await scoreFaceQuality(image, frameSize, frameSize, detection);
    expect(score.isUsable).toBe(false);
    expect(score.rejectReasons).toContain("TOO_SMALL");
  });

  it("rejects a face with low detector confidence", async () => {
    const frameSize = 400;
    const image = await checkerboardJpeg(frameSize, frameSize);
    const detection = detectionAt(frameSize / 2, frameSize / 2, 200, 0.1);
    const score = await scoreFaceQuality(image, frameSize, frameSize, detection);
    expect(score.rejectReasons).toContain("LOW_DETECTOR_CONFIDENCE");
  });

  it("rejects a blurry face crop", async () => {
    const frameSize = 400;
    const image = await flatJpeg(frameSize, frameSize);
    const detection = detectionAt(frameSize / 2, frameSize / 2, 200, 0.95);
    const score = await scoreFaceQuality(image, frameSize, frameSize, detection);
    expect(score.rejectReasons).toContain("TOO_BLURRY");
  });

  it("rejects a face turned far to one side (excessive yaw)", async () => {
    const frameSize = 400;
    const image = await checkerboardJpeg(frameSize, frameSize);
    const detection = detectionAt(frameSize / 2, frameSize / 2, 200, 0.95);
    // Push the nose sharply toward one eye to simulate a turned head.
    detection.landmarks5.nose = { x: detection.landmarks5.rightEye.x - 2, y: detection.landmarks5.nose.y };
    const score = await scoreFaceQuality(image, frameSize, frameSize, detection);
    expect(score.rejectReasons).toContain("EXCESSIVE_YAW");
  });

  it("overallScore is higher for a clearly better frame than a marginal one", async () => {
    const frameSize = 400;
    const goodImage = await checkerboardJpeg(frameSize, frameSize);
    const goodDetection = detectionAt(frameSize / 2, frameSize / 2, 220, 0.98);
    const good = await scoreFaceQuality(goodImage, frameSize, frameSize, goodDetection);

    const marginalImage = await checkerboardJpeg(frameSize, frameSize);
    const marginalDetection = detectionAt(frameSize / 2, frameSize / 2, 40, 0.65);
    const marginal = await scoreFaceQuality(marginalImage, frameSize, frameSize, marginalDetection);

    expect(good.overallScore).toBeGreaterThan(marginal.overallScore);
  });
});
