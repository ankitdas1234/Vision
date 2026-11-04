import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/perception/objectDetectionModel", () => ({
  detectObjects: vi.fn(),
}));

import { detectObjects } from "../../../src/perception/objectDetectionModel";
import { LocalMLPersonDetector, HeuristicPersonDetector, MockPersonDetector } from "../../../src/perception/personDetection";
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

describe("LocalMLPersonDetector", () => {

  it("reports no detection when the model finds no person", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockResolvedValue([{ label: "chair", confidence: 0.8, boundingBox: { x: 1, y: 1, width: 2, height: 2 } }]);
    const result = await new LocalMLPersonDetector().detect(ctxWithMotion());
    expect(result.personDetected).toBe(false);
  });

  it("reports a detection for a person-class result", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockResolvedValue([{ label: "person", confidence: 0.9, boundingBox: { x: 10, y: 20, width: 100, height: 200 } }]);
    const result = await new LocalMLPersonDetector().detect(ctxWithMotion());
    expect(result.personDetected).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.centerX).toBe(60);
    expect(result.centerY).toBe(120);
  });

  it("picks the highest-confidence person when multiple are detected", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockResolvedValue([
      { label: "person", confidence: 0.4, boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      { label: "person", confidence: 0.95, boundingBox: { x: 50, y: 50, width: 20, height: 20 } },
    ]);
    const result = await new LocalMLPersonDetector().detect(ctxWithMotion());
    expect(result.confidence).toBe(0.95);
  });

  it("degrades to no-detection (not a thrown error) if the model call fails", async () => {
    mockDetectObjects.mockReset();
    mockDetectObjects.mockImplementation(async () => {
      throw new Error("model not loaded");
    });
    const result = await new LocalMLPersonDetector().detect(ctxWithMotion());
    expect(result.personDetected).toBe(false);
  });
});

describe("HeuristicPersonDetector (fallback path)", () => {
  it("reports no detection with no motion", async () => {
    mockDetectObjects.mockReset();
    const result = await new HeuristicPersonDetector().detect(ctxWithMotion({ present: false, roi: null }));
    expect(result.personDetected).toBe(false);
  });

  it("reports a detection for a tall, large-enough motion blob", async () => {
    mockDetectObjects.mockReset();
    const result = await new HeuristicPersonDetector().detect(ctxWithMotion({ roi: { x: 0.3, y: 0.1, width: 0.2, height: 0.4 } }));
    expect(result.personDetected).toBe(true);
  });

  it("rejects a blob that's too small", async () => {
    mockDetectObjects.mockReset();
    const result = await new HeuristicPersonDetector().detect(ctxWithMotion({ roi: { x: 0.3, y: 0.1, width: 0.02, height: 0.04 } }));
    expect(result.personDetected).toBe(false);
  });
});

describe("MockPersonDetector", () => {
  it("always reports a fixed deterministic detection", async () => {
    mockDetectObjects.mockReset();
    const result = await new MockPersonDetector().detect();
    expect(result.personDetected).toBe(true);
  });
});
