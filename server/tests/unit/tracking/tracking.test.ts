import { describe, it, expect } from "vitest";
import { computeTrackingStep, nextTrackingState, DEFAULT_TRACKING_CONFIG } from "../../../src/perception/tracking";

describe("person tracking", () => {
  it("TEST 1: person appears on left -> eye moves left (angle decreases)", () => {
    const { angle, moved } = computeTrackingStep(100, 90); // left of center (320)
    expect(moved).toBe(true);
    expect(angle).toBeLessThan(90);
  });

  it("TEST 2: person appears on right -> eye moves right (angle increases)", () => {
    const { angle, moved } = computeTrackingStep(540, 90); // right of center
    expect(moved).toBe(true);
    expect(angle).toBeGreaterThan(90);
  });

  it("TEST 3: person centered -> eye remains stable", () => {
    const { angle, moved } = computeTrackingStep(325, 90); // within dead zone
    expect(moved).toBe(false);
    expect(angle).toBe(90);
  });

  it("TEST 4: person disappears -> tracking state changes to TARGET_LOST after grace period", () => {
    const state = nextTrackingState("TRACKING", false, DEFAULT_TRACKING_CONFIG.targetLostGraceMs + 100);
    expect(state).toBe("TARGET_LOST");
  });
});
