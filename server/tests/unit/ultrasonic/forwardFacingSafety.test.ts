import { describe, it, expect } from "vitest";
import { isWithinForwardFacingWindow, isMovementSafeConsideringHeadAngle } from "../../../src/ultrasonic/UltrasonicSafety";

describe("isWithinForwardFacingWindow", () => {
  it("is true when the head is pointed dead ahead", () => {
    expect(isWithinForwardFacingWindow(90)).toBe(true);
  });

  it("is true within the tolerance window", () => {
    expect(isWithinForwardFacingWindow(105)).toBe(true);
    expect(isWithinForwardFacingWindow(75)).toBe(true);
  });

  it("is false once the head has turned well away from forward", () => {
    expect(isWithinForwardFacingWindow(160)).toBe(false);
    expect(isWithinForwardFacingWindow(10)).toBe(false);
  });
});

describe("isMovementSafeConsideringHeadAngle", () => {
  it("trusts a CLEAR reading when the head is facing forward", () => {
    expect(isMovementSafeConsideringHeadAngle("CLEAR", 90)).toBe(true);
  });

  it("does not trust a CLEAR reading when the head is turned away — it can't vouch for what's ahead", () => {
    expect(isMovementSafeConsideringHeadAngle("CLEAR", 170)).toBe(false);
  });

  it("is still unsafe when turned away even if the raw status happens to be CLEAR", () => {
    expect(isMovementSafeConsideringHeadAngle("NEAR", 10)).toBe(false);
  });

  it("falls back to angle-agnostic behaviour when no angle is supplied", () => {
    expect(isMovementSafeConsideringHeadAngle("CLEAR")).toBe(true);
    expect(isMovementSafeConsideringHeadAngle("OBSTACLE")).toBe(false);
  });
});
