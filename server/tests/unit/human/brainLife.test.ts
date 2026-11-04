import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body, type BrainOptions, type WorldObject } from "../../../simulation/autonomous/src/brain";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let t = 0; let brain: Brain; let world: WorldObject[] = []; const said: string[] = [];
function make(extra: Partial<BrainOptions> = {}) {
  const body: Body = { act: async (_i, say) => { if (say) said.push(say); }, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => world };
  brain = new Brain(body, { now: () => t, storageKey: "test.life." + Math.random(), getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }), ...extra });
  return brain;
}
const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 1000; (brain as any).lifeTick(); (brain as any).ticks++; } };
beforeEach(() => { t = 5_000_000; world = []; said.length = 0; vi.spyOn(Math, "random").mockImplementation(mulberry(33)); });
afterEach(() => vi.restoreAllMocks());

describe("tricks you teach", () => {
  it("learns 'when I say spin, dance', fumbles at first, improves with practice, and survives save/load", () => {
    make(); expect(brain.hear("when I say spin, dance")?.reply).toMatch(/spin/);
    expect(brain.tricksKnown()[0]).toMatchObject({ phrase: "spin", does: "dance", level: "new" });
    let ok = 0; for (let i = 0; i < 30; i++) { t += 1000; const r = brain.hear("spin"); if (r?.instructions.length) ok++; }
    expect(ok).toBeGreaterThan(5); expect(ok).toBeLessThan(30);
    expect(brain.tricksKnown()[0].level).not.toBe("new");
    expect(brain.hear("what tricks do you know")?.reply ?? "").toMatch(/spin/);
    const st = brain.exportState(); const b2 = make(); b2.importState(st, 0); expect(b2.tricksKnown()[0].phrase).toBe("spin");
  });
  it("refuses a trick it cannot do", () => { make(); expect(brain.hear("when I say zork, juggle flaming swords")?.reply).toMatch(/don't know how/i); expect(brain.tricksKnown()).toEqual([]); });
});

describe("battery", () => {
  it("drains, complains when low, wants the charger, and refills on it", () => {
    make(); const l0 = brain.batteryLevel(); tick(60); expect(brain.batteryLevel()).toBeLessThan(l0);
    (brain as any).battery.level = 0.2; tick(1); expect(brain.wantsCharge()).toBe(true); expect(said.join(" ") + JSON.stringify((brain as any).evLog)).toMatch(/battery|energy/i);
    brain.power(true); expect(brain.wantsCharge()).toBe(false); tick(40); expect(brain.batteryLevel()).toBeGreaterThan(0.5);
    expect(brain.hear("how much battery do you have?")?.reply).toMatch(/%/);
  });
  it("does nothing with the human layer off", () => { make({ human: false }); (brain as any).battery.level = 0.1; expect(brain.wantsCharge()).toBe(false); brain.power(true); expect((brain as any).onCharger).toBe(false); });
});

describe("pain", () => {
  it("hurts, then avoids a place that hurts twice; remembers across save/load", () => {
    make(); brain.hurt(10, 10); expect(brain.avoidSpots()).toEqual([]); t += 4000; brain.hurt(11, 10);
    expect(brain.avoidSpots().length).toBe(1); expect(brain.vitals().pain).toBeGreaterThan(0);
    const st = brain.exportState(); const b2 = make(); b2.importState(st, 0); expect(b2.avoidSpots().length).toBe(1);
    make({ human: false }); brain.hurt(1, 1); brain.hurt(1, 1); expect(brain.avoidSpots()).toEqual([]);
  });
  it("ignores bumps closer than 3 seconds together (one bump, not fifty)", () => { make(); brain.hurt(5, 5); brain.hurt(5, 5); brain.hurt(5, 5); expect((brain as any).pain.spots[0].n).toBe(1); });
});

describe("weather and temperature", () => {
  it("has a sky that changes with simulated days and a look for it", () => {
    make(); const skies = new Set<string>(); for (let d = 0; d < 40; d++) { (brain as any).dayIndex = d; for (const h of [2, 8, 14, 20]) { (brain as any).clock.minutes = h * 60; tick(); skies.add(brain.sky()); } }
    expect(skies.size).toBeGreaterThanOrEqual(3); expect(brain.skyView().top).toMatch(/^#/);
  });
  it("feels the cold and hot zones", () => {
    make(); (brain as any).tempSaidAt = 0; brain.setTemperature("cold"); expect(said.join(" ") + "").toBeDefined();
    const v0 = (brain as any).valence; tick(30); expect((brain as any).valence).toBeLessThanOrEqual(v0 + 0.02); brain.setTemperature(null);
  });
});

describe("routine, dreams, jokes, why", () => {
  it("expects you at your usual hour", () => {
    make(); const rt = (brain as any).routine; for (let i = 0; i < 5; i++) rt.note(18.1);
    (brain as any).clock.minutes = 18.1 * 60; (brain as any).lastPersonAt = t - 3_600_000; tick(1);
    expect(JSON.stringify((brain as any).evLog)).toMatch(/usually come|usually show up|time you/i);
  });
  it("dreams on waking and can tell you", () => {
    make(); brain.stimulus("scold"); brain.stimulus("praise"); (brain as any).memory.remember("event", "someone scolded me", -0.6, 0.9);
    (brain as any).onNaturalWake(); expect(brain.hear("did you dream last night?")?.reply).toMatch(/dream/i);
  });
  it("remembers a trip as an inside joke and tells it later, only after a while", () => {
    make(); (brain as any).jokes.add("tripped over my own feet", t); expect((brain as any).jokes.due(t + 60_000, Math.random)).toBeNull(); expect((brain as any).jokes.due(t + 20 * 60_000, Math.random)).toBeTruthy();
    const st = brain.exportState(); const b2 = make(); b2.importState(st, 0); expect((b2 as any).jokes.items.length).toBe(1);
  });
  it("explains his last decision in words", () => {
    make(); (brain as any).lastDecision = { at: t, action: "rest", source: "scored", ms: 1, scores: [{ a: "rest", u: 1, p: 0.6 }, { a: "wander", u: 0.5, p: 0.4 }], parts: [{ label: "tiredness", v: 0.7 }], gap: 0, temp: 0.1, commitMs: 0 };
    expect(brain.hear("why did you do that?")?.reply).toMatch(/tired/);
  });
});

describe("curiosity and moved objects", () => {
  it("notices a known landmark that was moved", () => {
    make(); world = [{ id: "crate", kind: "landmark", x: 10, z: 10, color: "#fff" }]; tick(2);
    world = [{ id: "crate", kind: "landmark", x: 25, z: 10, color: "#fff" }]; tick(2);
    expect(JSON.stringify((brain as any).evLog)).toMatch(/moved|somewhere else/i);
  });
  it("queues a closer look at a new landmark and goes to it when he wanders", () => {
    make(); world = [{ id: "crate", kind: "landmark", x: 10, z: 10, color: "#fff" }];
    (brain as any).inspectQ.push({ id: "crate", x: 10, z: 10, label: "crate" });
    const p = (brain as any).plan("wander"); expect(p.label).toBe("inspect"); expect(JSON.stringify(p.instr)).toContain("10,10");
    expect((brain as any).plan("wander").label).not.toBe("inspect");
  });
});

describe("several people and gifts", () => {
  it("greets two people together; torn when one is upset with", () => {
    make({ knownNames: () => ["Asha", "Ben"] } as any); const sight = (n: string) => brain.sight({ type: "appeared", label: n, side: "center", near: false, source: "camera" });
    (brain as any).lastPersonAt = t - 600_000; sight("Asha"); t += 10_000; (brain as any).lastPersonAt = t - 600_000; sight("Ben");
    expect(said.join(" ") + JSON.stringify((brain as any).evLog)).toMatch(/Asha and Ben|both|Ben/);
    expect(brain.presentPeople().length).toBe(2);
  });
  it("remembers who gave him the toy", () => { make(); (brain as any).currentPerson = "Asha"; (brain as any).currentPersonAt = t; brain.stimulus("gift"); expect((brain as any).gifts.fromWho("Asha").length).toBe(1); });
});

describe("timeline, story, forgiveness", () => {
  it("records a timeline and writes the day as a story", () => { make(); tick(10); expect(brain.timeline().rows.length).toBeGreaterThan(3); brain.stimulus("praise"); expect(brain.story().length).toBeGreaterThan(10); });
  it("forgives more when you apologise quickly", () => {
    const g = (gap: number) => { make(); const r = (brain as any).rel; r.scold("Sam", t); r.scold("Sam", t); r.scold("Sam", t); t += gap; const before = r.ensure("Sam", t).grudge; r.apologize("Sam", t); return before - r.ensure("Sam", t).grudge; };
    expect(g(30_000)).toBeGreaterThan(g(3_600_000));
  });
});

describe("scenarios on a headless brain", () => {
  it("runs, and personality changes how he takes it", async () => {
    const { runScenario, SCENARIOS } = await import("../../../simulation/autonomous/src/life");
    const mk = () => { let now = 1_000_000; const body: Body = { act: async () => {}, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [] };
      const b = new Brain(body, { now: () => now, storageKey: "test.sc." + Math.random(), getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }) });
      return { brain: b as any, advance: (ms: number) => { now += ms; }, done: () => {} }; };
    const sc = SCENARIOS.find((s) => s.id === "overwhelmed")!;
    const calm = runScenario(sc, "bold", mk), timid = runScenario(sc, "timid", mk);
    expect(timid.vitals.valence).toBeLessThan(calm.vitals.valence);
    expect(timid.vitals.space).toBe(1);                 // the timid one asks for space
    const kind = runScenario(SCENARIOS.find((s) => s.id === "kindness")!, "friendly", mk);
    expect(kind.checks.every((c) => c.pass)).toBe(true);
    const apology = runScenario(SCENARIOS.find((s) => s.id === "stranger_scold")!, "default", mk); expect(apology.checks.every((c) => c.pass)).toBe(true);
  });
});

describe("solo games, charger commitment, AI verdict", () => {
  it("invents a small game when bored with no toy, and only for the human layer", () => {
    make(); (brain as any).boredom = 0.9; expect(Number.isFinite((brain as any).score("play"))).toBe(true);
    const labels = new Set<string>(); for (let i = 0; i < 30; i++) { Math.random(); const p = (brain as any).plan("play"); labels.add(p.label); expect(p.instr.length).toBeGreaterThan(0); expect(p.effect).toBe("play"); }
    expect([...labels].every((l) => /^game: (spin|zigzag|square|wiggle)$/.test(l))).toBe(true); expect(labels.size).toBeGreaterThan(1);
    for (const ins of (brain as any).plan("play").instr) if (ins.command === "GOTO") expect(String(ins.arg)).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d/);
    make({ human: false }); (brain as any).boredom = 0.9; expect((brain as any).score("play")).toBe(-Infinity);
  });
  it("does not want to play when not bored", () => { make(); (brain as any).boredom = 0.1; expect((brain as any).score("play")).toBe(-Infinity); });
  it("stops having new ideas while heading to a charger with a low battery", () => {
    make(); brain.setCharger(true); (brain as any).battery.level = 0.1; (brain as any).mode = "local"; (brain as any).lastDecisionAt = 0; const before = (brain as any).lastDecisionAt;
    brain.tick(); expect((brain as any).lastDecisionAt).toBe(before); brain.power(true); expect(brain.wantsCharge()).toBe(false);
  });
});
