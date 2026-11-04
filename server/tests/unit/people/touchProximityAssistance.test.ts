import { describe, it, expect, beforeEach } from "vitest";
import { shouldReactToProximityContact, resetTouchProximityState, REACT_COOLDOWN_MS } from "../../../src/people/TouchProximityAssistance";

const ROBOT = "vision-test";

describe("shouldReactToProximityContact", () => {
  beforeEach(() => resetTouchProximityState());

  it("reacts the first time something registers as VERY_CLOSE", () => {
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 })).toBe(true);
  });

  it("stays quiet when nothing is that close", () => {
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: false, now: 1000 })).toBe(false);
  });

  it("does not repeat itself every single cycle while contact continues", () => {
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 })).toBe(true);
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1500 })).toBe(false);
  });

  it("reacts again once the cooldown passes, unlike LowLightAssistance it never gives up entirely", () => {
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 })).toBe(true);
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 + REACT_COOLDOWN_MS + 1 })).toBe(true);
    // ...and again, and again — no MAX_ATTEMPTS-style cutoff.
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 + 2 * (REACT_COOLDOWN_MS + 1) })).toBe(true);
  });

  it("keeps separate cooldown state per robot", () => {
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 })).toBe(true);
    expect(shouldReactToProximityContact({ robotId: "vision-other", veryCloseOnUltrasonic: true, now: 1000 })).toBe(true);
  });

  it("a brief gap that clears the condition does not itself trigger anything on its own", () => {
    shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: true, now: 1000 });
    expect(shouldReactToProximityContact({ robotId: ROBOT, veryCloseOnUltrasonic: false, now: 1200 })).toBe(false);
  });
});
