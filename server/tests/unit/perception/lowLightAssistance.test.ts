import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateLowLight,
  resetLowLightState,
  ASK_COOLDOWN_MS,
  MAX_ASK_ATTEMPTS,
} from "../../../src/perception/LowLightAssistance";

const ROBOT = "vision-test";
const BASE = {
  robotId: ROBOT,
  meanBrightness: 20,
  frameReadable: true,
  personDetected: true,
  someoneCloseOnUltrasonic: false,
};

describe("evaluateLowLight", () => {
  beforeEach(() => resetLowLightState());

  it("asks for light when it's dim and a person is visible", () => {
    const prompt = evaluateLowLight({ ...BASE, now: 1000 });
    expect(prompt).not.toBeNull();
    expect(prompt!.attempt).toBe(1);
    expect(prompt!.text.toLowerCase()).toContain("light");
  });

  it("asks when only the ultrasonic knows someone is there (too dark to see them)", () => {
    const prompt = evaluateLowLight({ ...BASE, personDetected: false, someoneCloseOnUltrasonic: true, now: 1000 });
    expect(prompt).not.toBeNull();
  });

  it("stays quiet when nobody is around to ask", () => {
    expect(evaluateLowLight({ ...BASE, personDetected: false, now: 1000 })).toBeNull();
  });

  it("stays quiet in a well-lit room", () => {
    expect(evaluateLowLight({ ...BASE, meanBrightness: 140, now: 1000 })).toBeNull();
  });

  it("ignores an undecodable frame rather than blaming the lighting", () => {
    expect(evaluateLowLight({ ...BASE, frameReadable: false, meanBrightness: 0, now: 1000 })).toBeNull();
  });

  it("does not repeat itself on every cycle", () => {
    expect(evaluateLowLight({ ...BASE, now: 1000 })).not.toBeNull();
    expect(evaluateLowLight({ ...BASE, now: 2000 })).toBeNull();
    expect(evaluateLowLight({ ...BASE, now: 3000 })).toBeNull();
  });

  it("escalates once the cooldown passes and then gives up", () => {
    let now = 1000;
    const texts: string[] = [];
    for (let i = 0; i < MAX_ASK_ATTEMPTS; i++) {
      const prompt = evaluateLowLight({ ...BASE, now });
      expect(prompt).not.toBeNull();
      texts.push(prompt!.text);
      now += ASK_COOLDOWN_MS + 1;
    }
    expect(new Set(texts).size).toBe(MAX_ASK_ATTEMPTS); // each ask is worded differently
    expect(evaluateLowLight({ ...BASE, now })).toBeNull(); // stops nagging
  });

  it("re-arms after the light actually comes back", () => {
    let now = 1000;
    for (let i = 0; i < MAX_ASK_ATTEMPTS; i++) {
      evaluateLowLight({ ...BASE, now });
      now += ASK_COOLDOWN_MS + 1;
    }
    expect(evaluateLowLight({ ...BASE, now })).toBeNull();

    evaluateLowLight({ ...BASE, meanBrightness: 160, now: now + 1 }); // someone turned the light on
    const prompt = evaluateLowLight({ ...BASE, now: now + 2 }); // and then off again
    expect(prompt?.attempt).toBe(1);
  });

  it("does not re-arm on a flicker just over the dim threshold", () => {
    evaluateLowLight({ ...BASE, now: 1000 });
    evaluateLowLight({ ...BASE, meanBrightness: 60, now: 2000 }); // above dim, below recovered
    expect(evaluateLowLight({ ...BASE, now: 3000 })).toBeNull(); // still cooling down
  });

  it("keeps separate state per robot", () => {
    expect(evaluateLowLight({ ...BASE, now: 1000 })).not.toBeNull();
    expect(evaluateLowLight({ ...BASE, robotId: "vision-other", now: 1000 })).not.toBeNull();
  });
});
