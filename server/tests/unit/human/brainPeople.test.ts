import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body, type BrainOptions } from "../../../simulation/autonomous/src/brain";

let t = 0;
let brain: Brain;
function make(extra: Partial<BrainOptions> = {}) {
  const body: Body = { act: async () => {}, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [] };
  brain = new Brain(body, { now: () => t, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: true, mic: true, personPresent: true }), ...extra });
  return brain;
}
beforeEach(() => { t = 1_000_000; });
afterEach(() => vi.restoreAllMocks());

describe("people by face", () => {
  it("keeps separate memories for separate recognised people", () => {
    make({ knownNames: () => ["Asha", "Ravi"] });
    brain.sight({ type: "appeared", label: "Asha" } as any);
    expect(brain.currentPersonName()).toBe("Asha");
    brain.stimulus("scold");
    const asha = (brain as any).rel.map["asha"];
    expect(asha.grudge).toBeGreaterThan(0);
    t += 200000;
    brain.sight({ type: "appeared", label: "Ravi" } as any);
    expect(brain.currentPersonName()).toBe("Ravi");
    expect(((brain as any).rel.map["ravi"]?.grudge ?? 0)).toBeLessThan(asha.grudge);
  });

  it("carries what he remembered about 'you' over when a face is named", () => {
    make({ knownNames: () => ["Asha"] });
    brain.stimulus("scold");
    brain.learnPersonName("Asha");
    expect((brain as any).rel.map["asha"]?.grudge).toBeGreaterThan(0);
    expect(brain.currentPersonName()).toBe("Asha");
  });

  it("forgets one person on request and leaves the others", () => {
    make({ knownNames: () => ["Asha", "Ravi"] });
    brain.sight({ type: "appeared", label: "Asha" } as any);
    brain.stimulus("praise");
    brain.sight({ type: "appeared", label: "Ravi" } as any);
    expect(brain.forgetPerson("Asha")).toBe(true);
    expect((brain as any).rel.map["asha"]).toBeUndefined();
    expect((brain as any).rel.map["ravi"]).toBeDefined();
  });
});

describe("saved mind and day length", () => {
  it("exports, then restores only when the saved copy is newer", () => {
    make();
    brain.learnPersonName("Asha");
    const st = brain.exportState();
    const other = make();
    expect(other.importState(st, st.savedAt + 1)).toBe(false);
    expect(other.importState(st, 0)).toBe(true);
    expect((other as any).rel.map["asha"]).toBeDefined();
    expect(other.importState({ v: 2 }, 0)).toBe(false);
  });

  it("a shorter day makes the clock run faster", () => {
    make();
    const before = brain.clock.minutes;
    brain.clock.advance(60);
    const slow = brain.clock.minutes - before;
    brain.setDayLength(6);
    const m2 = brain.clock.minutes;
    brain.clock.advance(60);
    expect(brain.clock.minutes - m2).toBeGreaterThan(slow * 3);
  });
});

import { newGoal, goalProgress, goalLine, carryOver, DEFAULT_BIG5 } from "../../../simulation/autonomous/src/human";
describe("long-term goals and mood carry-over", () => {
  const s0 = { cells: 2, facts: 0, interactions: 0 };
  it("forms one ambition at a time and measures real progress", () => {
    const g = newGoal(() => 0.1, s0, DEFAULT_BIG5, [], 0)!;
    expect(g).toBeTruthy();
    expect(newGoal(() => 0.1, s0, DEFAULT_BIG5, [g], 0)).toBeNull();
    expect(goalProgress(g, s0)).toBe(0);
    const s1 = { cells: 2 + 99, facts: 99, interactions: 99 };
    expect(goalProgress(g, s1)).toBe(1);
    expect(goalLine(g, s1, () => 0.1)).toMatch(/did it|Finally|reached/i);
    expect(newGoal(() => 0.1, s1, DEFAULT_BIG5, [{ ...g, done: true }], 5)).toBeTruthy();
  });
  it("a bad evening leaves a bad morning, a good one a good morning, softened", () => {
    expect(carryOver(-0.8)).toBeLessThan(-0.2);
    expect(carryOver(0.9)).toBeGreaterThan(0.2);
    expect(Math.abs(carryOver(0.15))).toBeLessThan(0.01);
    expect(carryOver(-5)).toBeGreaterThanOrEqual(-0.3);
  });
  it("brain keeps a goal and saves it with the rest of his mind", () => {
    make({});
    (brain as any).checkGoals(false);
    expect(brain.currentGoal()).toBeTruthy();
    expect(brain.exportState().goals.length).toBe(1);
  });
});
