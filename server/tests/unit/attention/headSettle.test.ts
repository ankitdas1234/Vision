import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ServoManager } from "../../../src/servos/ServoManager";
import { HEAD_MAX_DEG_PER_SEC } from "../../../src/servos/ServoConfiguration";
import { setHeadAngle, centerHead, headSettleRemainingMs, headTravelMs, waitForHeadSettled, isHeadForward, resetHeadSettle } from "../../../src/attention/HeadController";

describe("head settle model (the firmware eases at HEAD_MAX_DEG_PER_SEC)", () => {
  let servos: ServoManager;
  beforeEach(() => { vi.useFakeTimers(); servos = new ServoManager(); resetHeadSettle(); });
  afterEach(() => vi.useRealTimers());

  it("a full 180 degree sweep takes 0.75 s", () => {
    expect(HEAD_MAX_DEG_PER_SEC).toBe(240);
    expect(headTravelMs(180)).toBeCloseTo(750);
  });

  it("a command 'completes' instantly but the head is reported as still travelling until it arrives", () => {
    setHeadAngle(150, servos);                                // 60 degrees from centre
    expect(headSettleRemainingMs()).toBeCloseTo(250, -1);
    vi.advanceTimersByTime(100);
    expect(headSettleRemainingMs()).toBeCloseTo(150, -1);
    vi.advanceTimersByTime(200);
    expect(headSettleRemainingMs()).toBe(0);
  });

  it("consecutive moves accumulate instead of resetting the clock (conservative)", () => {
    setHeadAngle(30, servos); setHeadAngle(150, servos);     // 60 + 120 degrees
    expect(headSettleRemainingMs()).toBeCloseTo(750, -1);
  });

  it("centreing counts as a move too", () => {
    setHeadAngle(180, servos); vi.advanceTimersByTime(1000);
    centerHead(servos);
    expect(headSettleRemainingMs()).toBeCloseTo(375, -1);
  });

  it("waitForHeadSettled resolves once the head has arrived, and never waits longer than its cap", async () => {
    setHeadAngle(0, servos);
    const p = waitForHeadSettled();
    await vi.advanceTimersByTimeAsync(400);
    await p;
    expect(headSettleRemainingMs()).toBe(0);
    setHeadAngle(180, servos); setHeadAngle(0, servos);       // would be 1.5 s
    const t0 = Date.now(); const capped = waitForHeadSettled(300);
    await vi.advanceTimersByTimeAsync(300); await capped;
    expect(Date.now() - t0).toBe(300);
  });

  it("isHeadForward reflects the forward-facing window", () => {
    expect(isHeadForward(servos)).toBe(true);
    setHeadAngle(150, servos);
    expect(isHeadForward(servos)).toBe(false);
    setHeadAngle(100, servos);
    expect(isHeadForward(servos)).toBe(true);
  });
});
