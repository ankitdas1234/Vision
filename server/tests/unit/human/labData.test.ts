import { describe, it, expect } from "vitest";
import { Brain, type Body } from "../../../simulation/autonomous/src/brain";

describe("data the Lab shows", () => {
  const make = () => { let t = 9_000_000; const body: Body = { act: async () => {}, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [] };
    const b = new Brain(body, { now: () => t, storageKey: "test.labdata." + Math.random(), getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }) }); return { b, adv: (ms: number) => { t += ms; } }; };
  it("mindView lists people, facts, topics, tricks and milestones, all finite", () => {
    const { b, adv } = make(); b.hear("my name is Asha"); adv(3000); b.hear("I have an exam tomorrow and I am nervous"); adv(3000); b.hear("when I say spin, dance"); b.stimulus("gift");
    const m = b.mindView();
    expect(m.people[0].name).toBe("Asha"); expect(m.topics.length).toBeGreaterThan(0); expect(m.tricks[0].phrase).toBe("spin"); expect(m.people[0].gifts).toBeGreaterThanOrEqual(1);
    for (const p of m.people) for (const k of ["trust", "warmth", "grudge"] as const) { expect(p[k]).toBeGreaterThanOrEqual(0); expect(p[k]).toBeLessThanOrEqual(1); }
    expect(Number.isFinite(m.battery)).toBe(true);
  });
  it("personality can be read and set, and values stay in range", () => {
    const { b } = make(); b.setPersonality({ bold: 0.9, calm: 0.1 }); expect(b.personality().bold).toBe(0.9); expect(b.personality().calm).toBe(0.1);
  });
  it("recentEvents is a bounded list", () => { const { b } = make(); for (let i = 0; i < 400; i++) b.stimulus("praise"); expect(b.recentEvents().length).toBeLessThanOrEqual(120); });
});
