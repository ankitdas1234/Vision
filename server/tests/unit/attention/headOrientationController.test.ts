import { describe, it, expect } from "vitest";
import { decideHeadCommand, nextScanAngle, DEFAULT_SCAN_BOUNDS } from "../../../src/attention/HeadOrientationController";

describe("nextScanAngle", () => {
  it("sweeps forward until hitting the max bound, then reverses", () => {
    let angle = 166;
    let direction: 1 | -1 = 1;
    ({ angle, direction } = nextScanAngle(angle, direction));
    expect(angle).toBe(DEFAULT_SCAN_BOUNDS.maxAngle);
    expect(direction).toBe(-1);
  });

  it("sweeps backward until hitting the min bound, then reverses", () => {
    let angle = 14;
    let direction: 1 | -1 = -1;
    ({ angle, direction } = nextScanAngle(angle, direction));
    expect(angle).toBe(DEFAULT_SCAN_BOUNDS.minAngle);
    expect(direction).toBe(1);
  });

  it("never sweeps to the mechanical extremes", () => {
    const result = nextScanAngle(DEFAULT_SCAN_BOUNDS.minAngle, -1);
    expect(result.angle).toBeGreaterThanOrEqual(DEFAULT_SCAN_BOUNDS.minAngle);
  });
});

describe("decideHeadCommand", () => {
  it("scans when idle", () => {
    const command = decideHeadCommand({ attentionState: "IDLE", currentAngle: 90, scanDirection: 1 });
    expect(command.type).toBe("SCAN");
    expect(command.angle).not.toBe(90);
  });

  it("scans when habituated too", () => {
    const command = decideHeadCommand({ attentionState: "HABITUATED", currentAngle: 90, scanDirection: 1 });
    expect(command.type).toBe("SCAN");
  });

  it("holds the current bearing when alerted with no precise target", () => {
    const command = decideHeadCommand({ attentionState: "ALERTED", currentAngle: 120, scanDirection: 1 });
    expect(command.type).toBe("HOLD");
    expect(command.angle).toBe(120);
  });

  it("holds when focused but no person center is known (e.g. an unidentified object)", () => {
    const command = decideHeadCommand({ attentionState: "FOCUSED", currentAngle: 75, scanDirection: -1 });
    expect(command.type).toBe("HOLD");
    expect(command.angle).toBe(75);
  });

  it("fine-tracks toward a detected person's on-screen position when focused", () => {
    // Person is left of frame center (frameWidth 640 -> center 320).
    const command = decideHeadCommand({ attentionState: "FOCUSED", currentAngle: 90, scanDirection: 1, personCenterX: 100 });
    expect(command.type).toBe("TRACK");
    expect(command.angle).toBeLessThan(90);
  });
});
