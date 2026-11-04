import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/perception/objectDetectionModel", () => ({
  detectObjects: vi.fn(),
}));

import { detectObjects } from "../../../src/perception/objectDetectionModel";
import { LocalMLObjectDetector, HeuristicObjectDetector, MockObjectDetector } from "../../../src/perception/objectDetection";
import type { DetectionContext } from "../../../src/perception/perceptionContext";

const mockDetectObjects = vi.mocked(detectObjects);

function ctxWithMotion(overrides: Partial<DetectionContext["motion"]> = {}): DetectionContext {
  return {
    robotId: "robot-1",
    imageBuffer: Buffer.from("fake"),
    width: 640,
    height: 480,
    quality: {} as DetectionContext["quality"],
    motion: { present: true, magnitude: 40, roi: { x: 0.3, y: 0.1, width: 0.2, height: 0.4 }, cellsChanged: 10, totalCells: 100, isInitializing: false, ...overrides },
  };
}

describe("LocalMLObjectDetector", () => {

  it("returns real COCO-class labels, not a generic placeholder", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockResolvedValue([{ label: "chair", confidence: 0.8, boundingBox: { x: 1, y: 1, width: 2, height: 2 } }]);
    const result = await new LocalMLObjectDetector().detect(ctxWithMotion());
    expect(result).toEqual([{ name: "chair", category: "chair", confidence: 0.8, boundingBox: { x: 1, y: 1, width: 2, height: 2 } }]);
  });

  it("excludes person detections — personDetection.ts owns those", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockResolvedValue([
      { label: "person", confidence: 0.9, boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      { label: "backpack", confidence: 0.6, boundingBox: { x: 5, y: 5, width: 3, height: 3 } },
    ]);
    const result = await new LocalMLObjectDetector().detect(ctxWithMotion());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("backpack");
  });

  it("returns an empty array (not a thrown error) if the model call fails", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockImplementation(async () => {
      throw new Error("model not loaded");
    });
    const result = await new LocalMLObjectDetector().detect(ctxWithMotion());
    expect(result).toEqual([]);
  });
});

describe("HeuristicObjectDetector (fallback path)", () => {
  it("reports an honest 'unidentified object', never a specific label", async () => {
    mockDetectObjects.mockReset();
    const result = await new HeuristicObjectDetector().detect(ctxWithMotion());
    expect(result[0].name).toBe("unidentified object");
    expect(result[0].category).toBe("unknown");
  });

  it("reports nothing with no motion", async () => {
    mockDetectObjects.mockReset();
    const result = await new HeuristicObjectDetector().detect(ctxWithMotion({ present: false, roi: null }));
    expect(result).toEqual([]);
  });
});

describe("MockObjectDetector", () => {
  it("always reports no objects", async () => {
    mockDetectObjects.mockReset();
    expect(await new MockObjectDetector().detect()).toEqual([]);
  });
});
