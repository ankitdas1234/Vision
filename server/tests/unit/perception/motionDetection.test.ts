import { describe, it, expect } from "vitest";
import { MotionDetector } from "../../../src/perception/motionDetection";

const WIDTH = 8;
const HEIGHT = 6;

function flatGrid(value: number): number[] {
  return new Array(WIDTH * HEIGHT).fill(value);
}

describe("MotionDetector (background subtraction)", () => {
  it("treats the first frame as baseline initialization, not motion", () => {
    const detector = new MotionDetector();
    const result = detector.detect(flatGrid(100), WIDTH, HEIGHT);
    expect(result.isInitializing).toBe(true);
    expect(result.present).toBe(false);
  });

  it("reports no motion for an unchanging scene", () => {
    const detector = new MotionDetector();
    detector.detect(flatGrid(100), WIDTH, HEIGHT);
    const result = detector.detect(flatGrid(100), WIDTH, HEIGHT);
    expect(result.present).toBe(false);
    expect(result.roi).toBeNull();
  });

  it("detects a foreground blob and reports its bounding box", () => {
    const detector = new MotionDetector();
    detector.detect(flatGrid(50), WIDTH, HEIGHT);

    const changed = flatGrid(50);
    // Bright 2x2 blob in the middle of the grid.
    for (const y of [2, 3]) {
      for (const x of [3, 4]) {
        changed[y * WIDTH + x] = 220;
      }
    }
    const result = detector.detect(changed, WIDTH, HEIGHT);
    expect(result.present).toBe(true);
    expect(result.cellsChanged).toBe(4);
    expect(result.roi).toEqual({ x: 3 / WIDTH, y: 2 / HEIGHT, width: 2 / WIDTH, height: 2 / HEIGHT });
  });

  it("ignores a single noisy pixel below the presence threshold", () => {
    const detector = new MotionDetector();
    detector.detect(flatGrid(50), WIDTH, HEIGHT);
    const changed = flatGrid(50);
    changed[0] = 200; // one pixel changed — not enough to count as "present"
    const result = detector.detect(changed, WIDTH, HEIGHT);
    expect(result.present).toBe(false);
  });

  it("restarts the background model when frame geometry changes", () => {
    const detector = new MotionDetector();
    detector.detect(flatGrid(50), WIDTH, HEIGHT);
    const result = detector.detect(flatGrid(50), WIDTH + 1, HEIGHT);
    expect(result.isInitializing).toBe(true);
  });
});
