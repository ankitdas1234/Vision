import { describe, it, expect, beforeEach, vi } from "vitest";
import { noteAnnoyance, getAnnoyance, isAnnoyed, clearAnnoyance, ANNOYANCE_DECAY_MS } from "../../../src/mental/Annoyance";
import { evaluateEmotion, emotionToGestureHint } from "../../../src/emotion/EmotionEngine";

const ROBOT = "vision-annoyance-test";

describe("Annoyance (short-lived irritation)", () => {
  beforeEach(() => clearAnnoyance());

  it("starts calm", () => {
    expect(isAnnoyed(ROBOT)).toBe(false);
    expect(getAnnoyance(ROBOT)).toBe(0);
  });

  it("holds the level it was given", () => {
    noteAnnoyance(ROBOT, 2, 1000);
    expect(getAnnoyance(ROBOT, 1000)).toBe(2);
  });

  it("never gets calmer from a fresh lower-level provocation", () => {
    noteAnnoyance(ROBOT, 3, 1000);
    noteAnnoyance(ROBOT, 1, 2000);
    expect(getAnnoyance(ROBOT, 2000)).toBe(3);
  });

  it("wears off on its own", () => {
    noteAnnoyance(ROBOT, 2, 1000);
    expect(getAnnoyance(ROBOT, 1000 + ANNOYANCE_DECAY_MS - 1)).toBe(2);
    expect(getAnnoyance(ROBOT, 1000 + ANNOYANCE_DECAY_MS + 1)).toBe(0);
  });

  it("is refreshed by a new provocation rather than expiring mid-argument", () => {
    noteAnnoyance(ROBOT, 1, 1000);
    noteAnnoyance(ROBOT, 1, 1000 + ANNOYANCE_DECAY_MS - 1);
    expect(getAnnoyance(ROBOT, 1000 + ANNOYANCE_DECAY_MS + 100)).toBe(1);
  });

  it("keeps robots separate", () => {
    noteAnnoyance(ROBOT, 2, 1000);
    expect(getAnnoyance("vision-other", 1000)).toBe(0);
  });
});

describe("EmotionEngine with annoyance", () => {
  const base = { curiosity: 30, uncertainty: 10, isSafe: true, decision: "OBSERVE" };

  it("shows ANNOYED while irritated", () => {
    expect(evaluateEmotion({ ...base, annoyance: 1 }).emotion).toBe("ANNOYED");
  });

  it("gets more intense with the level", () => {
    const mild = evaluateEmotion({ ...base, annoyance: 1 }).intensity;
    const severe = evaluateEmotion({ ...base, annoyance: 3 }).intensity;
    expect(severe).toBeGreaterThan(mild);
  });

  it("never outranks a safety concern", () => {
    expect(evaluateEmotion({ ...base, isSafe: false, annoyance: 3 }).emotion).toBe("WORRIED");
  });

  it("outranks the pleased greeting an admin would otherwise get", () => {
    expect(evaluateEmotion({ ...base, personCategory: "ADMIN", annoyance: 1 }).emotion).toBe("ANNOYED");
    expect(evaluateEmotion({ ...base, personCategory: "ADMIN" }).emotion).toBe("HAPPY");
  });

  it("behaves exactly as before when nothing is irritating it", () => {
    expect(evaluateEmotion({ ...base, annoyance: 0 }).emotion).toBe(evaluateEmotion(base).emotion);
  });

  it("delivers annoyed speech curtly", () => {
    expect(emotionToGestureHint("ANNOYED")).toEqual({ speechPace: "fast", eyeMovement: "subtle" });
  });
});

describe("GestureExecutor annoyance mapping", () => {
  it("turns away when annoyed, whatever the decision layer wanted", async () => {
    const dispatched: Array<{ angle: number }> = [];
    vi.doMock("../../../src/commands/CommandRegistry", () => ({
      commandRegistry: {
        dispatch: async (input: { params: { angle: number } }) => {
          dispatched.push({ angle: input.params.angle });
          return { status: "OK" };
        },
      },
    }));
    vi.doMock("../../../src/servos/ServoManager", () => ({
      servoManager: { getPositional: () => ({ angle: 90 }) },
    }));

    const { playEmbodiedGesture } = await import("../../../src/reactions/GestureExecutor");
    // GREET + ANNOYED would previously have produced nothing at all; the
    // annoyed branch is checked first on purpose.
    const gesture = await playEmbodiedGesture("robot", "ANNOYED", "GREET");

    expect(gesture).toBe("ANNOYED_TURN_AWAY");
    expect(dispatched.length).toBeGreaterThan(0);
    expect(dispatched.at(-1)!.angle).toBe(90); // always returns to where the head was
    vi.doUnmock("../../../src/commands/CommandRegistry");
    vi.doUnmock("../../../src/servos/ServoManager");
    vi.resetModules();
  }, 10_000);
});
