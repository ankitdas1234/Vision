import sharp from "sharp";

/**
 * PRE-ATTENTIVE VISUAL FILTER
 * ---------------------------
 * The human retina doesn't send every photon hitting it to the visual
 * cortex for full analysis — a huge amount of pre-processing (contrast,
 * edges, motion) happens before "attention" and "recognition" ever get
 * involved. This module is that pre-attentive stage for Vision: it looks
 * at a frame cheaply (no AI calls, no detection models) and decides
 * whether the frame is even worth looking at further.
 *
 * This is what stops the robot from burning storage/AI calls on:
 *  - a covered/blind lens (near-black frame)
 *  - a blown-out frame (pointed at a light / sun)
 *  - a blank wall / uniform floor (no edges, nothing to see)
 *  - a corrupted/garbage frame from a flaky camera link
 */

export type FrameDiscardReason =
  | "DECODE_ERROR"
  | "TOO_DARK"
  | "TOO_BRIGHT"
  | "BLANK_UNIFORM"
  | "TOO_BLURRY";

export interface FrameQualityThresholds {
  minBrightness: number; // 0-255, below this the frame is effectively black
  maxBrightness: number; // 0-255, above this the frame is blown out/white
  minContrast: number; // stddev of luminance across the sampled grid
  minSharpness: number; // gradient-energy proxy for edge/detail content
}

/**
 * Defaults tuned for a small 8-bit indoor camera (ESP32-CAM). These are
 * intentionally conservative — false negatives (discarding a usable frame)
 * are cheaper to recover from (just capture again) than false positives
 * (running full detection/AI on nothing).
 */
export const DEFAULT_FRAME_QUALITY_THRESHOLDS: FrameQualityThresholds = {
  minBrightness: 12,
  maxBrightness: 245,
  minContrast: 4,
  minSharpness: 3,
};

/** Downsampled grayscale grid size used for quality + motion analysis. Small
 * on purpose — this is peripheral/pre-attentive vision, not the full frame. */
export const PERCEPTION_GRID_WIDTH = 48;
export const PERCEPTION_GRID_HEIGHT = 36;

export interface FrameQuality {
  width: number;
  height: number;
  checksum: string;
  isReadable: boolean;
  meanBrightness: number;
  contrast: number;
  sharpness: number;
  /** 0 = lots of visual detail, 1 = perfectly uniform/blank. */
  blankScore: number;
  isUsable: boolean;
  discardReason: FrameDiscardReason | null;
  /** Downsampled grayscale grid (row-major, PERCEPTION_GRID_WIDTH x
   * PERCEPTION_GRID_HEIGHT), reused by motion detection so the frame is
   * only decoded once. Empty when the frame could not be decoded. */
  graySamples: number[];
  gridWidth: number;
  gridHeight: number;
}

/** Kept for backwards compatibility with anything expecting the old shape. */
export interface ProcessedImage {
  width: number;
  height: number;
  checksum: string;
}

async function sha256(buffer: Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(buffer).digest("hex");
}

/** Sum of absolute neighbour differences — a standard, cheap proxy for edge
 * density / focus used in embedded auto-focus and blur-detection systems.
 * No ML model required; this is the "is there any detail here at all" check. */
function gradientEnergy(gray: number[], width: number, height: number): number {
  let energy = 0;
  let samples = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (x + 1 < width) {
        energy += Math.abs(gray[idx] - gray[idx + 1]);
        samples++;
      }
      if (y + 1 < height) {
        energy += Math.abs(gray[idx] - gray[idx + width]);
        samples++;
      }
    }
  }
  return samples === 0 ? 0 : energy / samples;
}

function meanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function classify(
  meanBrightness: number,
  contrast: number,
  sharpness: number,
  thresholds: FrameQualityThresholds,
): { isUsable: boolean; discardReason: FrameDiscardReason | null; blankScore: number } {
  if (meanBrightness < thresholds.minBrightness) {
    return { isUsable: false, discardReason: "TOO_DARK", blankScore: 1 };
  }
  if (meanBrightness > thresholds.maxBrightness) {
    return { isUsable: false, discardReason: "TOO_BRIGHT", blankScore: 1 };
  }
  // Normalize contrast/sharpness into a single 0-1 "nothing to see here" score.
  const contrastScore = Math.max(0, 1 - contrast / (thresholds.minContrast * 4));
  const sharpnessScore = Math.max(0, 1 - sharpness / (thresholds.minSharpness * 4));
  const blankScore = Math.min(1, (contrastScore + sharpnessScore) / 2);

  if (contrast < thresholds.minContrast) {
    return { isUsable: false, discardReason: "BLANK_UNIFORM", blankScore };
  }
  if (sharpness < thresholds.minSharpness) {
    return { isUsable: false, discardReason: "TOO_BLURRY", blankScore };
  }
  return { isUsable: true, discardReason: null, blankScore };
}

/**
 * Decode + analyze a captured frame. Never throws — a corrupted/unreadable
 * frame is reported as unusable rather than crashing the perception loop,
 * the same way a human just blinks and looks again rather than freezing up.
 */
export async function analyzeFrame(
  buffer: Buffer,
  thresholds: FrameQualityThresholds = DEFAULT_FRAME_QUALITY_THRESHOLDS,
): Promise<FrameQuality> {
  const checksum = await sha256(buffer);

  let width = 0;
  let height = 0;
  let graySamples: number[] = [];

  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;

    const { data } = await image
      .clone()
      .resize(PERCEPTION_GRID_WIDTH, PERCEPTION_GRID_HEIGHT, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    graySamples = Array.from(data);
  } catch {
    return {
      width: 0,
      height: 0,
      checksum,
      isReadable: false,
      meanBrightness: 0,
      contrast: 0,
      sharpness: 0,
      blankScore: 1,
      isUsable: false,
      discardReason: "DECODE_ERROR",
      graySamples: [],
      gridWidth: 0,
      gridHeight: 0,
    };
  }

  if (graySamples.length === 0 || width === 0 || height === 0) {
    return {
      width,
      height,
      checksum,
      isReadable: false,
      meanBrightness: 0,
      contrast: 0,
      sharpness: 0,
      blankScore: 1,
      isUsable: false,
      discardReason: "DECODE_ERROR",
      graySamples: [],
      gridWidth: 0,
      gridHeight: 0,
    };
  }

  const { mean, stdDev } = meanAndStdDev(graySamples);
  const sharpness = gradientEnergy(graySamples, PERCEPTION_GRID_WIDTH, PERCEPTION_GRID_HEIGHT);
  const { isUsable, discardReason, blankScore } = classify(mean, stdDev, sharpness, thresholds);

  return {
    width,
    height,
    checksum,
    isReadable: true,
    meanBrightness: mean,
    contrast: stdDev,
    sharpness,
    blankScore,
    isUsable,
    discardReason,
    graySamples,
    gridWidth: PERCEPTION_GRID_WIDTH,
    gridHeight: PERCEPTION_GRID_HEIGHT,
  };
}

/** Legacy entry point kept for anything still importing the old shape. */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const quality = await analyzeFrame(buffer);
  return { width: quality.width, height: quality.height, checksum: quality.checksum };
}
