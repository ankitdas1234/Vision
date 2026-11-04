import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldAttemptFaceVisibilityHelp,
  noteFaceVisibilityAttempt,
  resetFaceVisibilityState,
  ATTEMPT_COOLDOWN_MS,
  MAX_ATTEMPTS,
} from "../../../src/people/FaceVisibilityAssistance";

const ROBOT = "vision-test";
const BASE = { robotId: ROBOT, personDetected: true, skipReason: "NO_FACE_DETECTED" as string | null };

describe("shouldAttemptFaceVisibilityHelp", () => {
  beforeEach(() => resetFaceVisibilityState());

  it("attempts help when a person is present but no face was found at all", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 })).toBe(true);
  });

  it("attempts help when the face is there but too small to use", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, skipReason: "TOO_SMALL", now: 1000 })).toBe(true);
  });

  it("does NOT attempt help for a distance-unrelated skip reason (turned away)", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, skipReason: "EXCESSIVE_YAW", now: 1000 })).toBe(false);
  });

  it("does NOT attempt help for a distance-unrelated skip reason (occluded/blurry)", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, skipReason: "LIKELY_OCCLUDED", now: 1000 })).toBe(false);
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, skipReason: "TOO_BLURRY", now: 1000 })).toBe(false);
  });

  it("stays quiet when nobody is detected at all", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, personDetected: false, now: 1000 })).toBe(false);
  });

  it("stays quiet when a usable face was actually found (no skip reason)", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, skipReason: null, now: 1000 })).toBe(false);
  });

  it("does not restart the multi-second sequence every single cycle", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 })).toBe(true);
    noteFaceVisibilityAttempt(ROBOT, 1000);
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1500 })).toBe(false);
  });

  it("allows a second attempt once the cooldown passes, then stops after MAX_ATTEMPTS", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 })).toBe(true);
    noteFaceVisibilityAttempt(ROBOT, 1000);

    const secondAttemptAt = 1000 + ATTEMPT_COOLDOWN_MS + 1;
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: secondAttemptAt })).toBe(true);
    noteFaceVisibilityAttempt(ROBOT, secondAttemptAt);

    expect(MAX_ATTEMPTS).toBe(2); // documents the assumption this test is built on
    const thirdAttemptAt = secondAttemptAt + ATTEMPT_COOLDOWN_MS + 1;
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: thirdAttemptAt })).toBe(false); // gave up after MAX_ATTEMPTS
  });

  it("re-arms once a usable face is actually seen (skipReason cleared)", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 })).toBe(true);
    noteFaceVisibilityAttempt(ROBOT, 1000);
    resetFaceVisibilityState(ROBOT); // what BrainOrchestrator does once recognition.skipReason comes back null

    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 + 1 })).toBe(true); // no cooldown wait needed after a real reset
  });

  it("keeps separate state per robot", () => {
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, now: 1000 })).toBe(true);
    expect(shouldAttemptFaceVisibilityHelp({ ...BASE, robotId: "vision-other", now: 1000 })).toBe(true);
  });
});
