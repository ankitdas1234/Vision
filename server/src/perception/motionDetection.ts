/**
 * MOTION / FOREGROUND DETECTION
 * -----------------------------
 * Before a human "recognizes" anything, their visual system is extremely
 * good at noticing that *something changed* — that's what makes movement
 * in the corner of your eye jump out even when you're not looking directly
 * at it. This module is that layer: cheap adaptive background subtraction
 * over a small grayscale grid (reused from imageProcessor's decode, so
 * there's no extra image decoding cost) that answers two questions before
 * any detector/AI model is invoked:
 *
 *   1. Did anything change in this scene since last time?
 *   2. Roughly where (as a normalized bounding box)?
 *
 * Detection/recognition only runs when this says "yes" — which is most of
 * the fix for "the camera takes lots of useless photos": an unchanging,
 * empty scene never reaches the expensive part of the pipeline.
 */

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MotionResult {
  present: boolean;
  magnitude: number; // average changed-pixel intensity delta
  roi: NormalizedBox | null;
  cellsChanged: number;
  totalCells: number;
  /** True on the very first frame for a scene, when there's no background yet. */
  isInitializing: boolean;
}

export interface MotionDetectorOptions {
  /** Per-pixel intensity delta (0-255) above which a cell counts as "changed". */
  changeThreshold: number;
  /** How fast the background model adapts to lighting drift, 0-1. */
  learningRate: number;
  /** Minimum changed cells before we call it "something is here" rather than sensor noise. */
  minCellsForPresence: number;
}

export const DEFAULT_MOTION_OPTIONS: MotionDetectorOptions = {
  changeThreshold: 18,
  learningRate: 0.08,
  minCellsForPresence: 4,
};

/**
 * Stateful per-scene detector. One instance should be kept per camera
 * (robot) so the rolling background model reflects that camera's own
 * empty-room baseline rather than being reset every request.
 */
export class MotionDetector {
  private background: number[] | null = null;
  private width = 0;
  private height = 0;

  constructor(private options: MotionDetectorOptions = DEFAULT_MOTION_OPTIONS) {}

  reset() {
    this.background = null;
  }

  detect(gray: number[], width: number, height: number): MotionResult {
    if (gray.length === 0 || width === 0 || height === 0) {
      return { present: false, magnitude: 0, roi: null, cellsChanged: 0, totalCells: 0, isInitializing: true };
    }

    // Scene geometry changed (e.g. resolution change) — restart the model
    // rather than comparing incompatible grids.
    if (this.background === null || this.width !== width || this.height !== height) {
      this.background = [...gray];
      this.width = width;
      this.height = height;
      return { present: false, magnitude: 0, roi: null, cellsChanged: 0, totalCells: gray.length, isInitializing: true };
    }

    let changedCells = 0;
    let sumDiff = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < gray.length; i++) {
      const diff = Math.abs(gray[i] - this.background[i]);
      if (diff > this.options.changeThreshold) {
        changedCells++;
        sumDiff += diff;
        const x = i % width;
        const y = Math.floor(i / width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      // Slow adaptive blend keeps the background current with lighting
      // drift without immediately absorbing a lingering foreground object.
      this.background[i] = this.background[i] * (1 - this.options.learningRate) + gray[i] * this.options.learningRate;
    }

    const present = changedCells >= this.options.minCellsForPresence;
    const magnitude = changedCells > 0 ? sumDiff / changedCells : 0;
    const roi: NormalizedBox | null = present
      ? {
          x: minX / width,
          y: minY / height,
          width: (maxX - minX + 1) / width,
          height: (maxY - minY + 1) / height,
        }
      : null;

    return { present, magnitude, roi, cellsChanged: changedCells, totalCells: gray.length, isInitializing: false };
  }
}

/** One MotionDetector per robot/camera, so each scene keeps its own baseline. */
const detectorsByRobot = new Map<string, MotionDetector>();

export function getMotionDetectorFor(robotId: string, options?: MotionDetectorOptions): MotionDetector {
  let detector = detectorsByRobot.get(robotId);
  if (!detector) {
    detector = new MotionDetector(options);
    detectorsByRobot.set(robotId, detector);
  }
  return detector;
}

export function resetMotionDetectorFor(robotId: string) {
  detectorsByRobot.delete(robotId);
}
