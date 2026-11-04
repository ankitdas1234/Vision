import { describe, it, expect } from "vitest";
import { Habits, skyAt, daylight, skyLook, skyEffect, JokeBook, Tricks, recallRelevant, dream, Routine, Battery, Pain, zoneAt, tempEffect, History, tellDay, voiceProfile, Presence, groupGreeting, tornLine, GiftLog, explainDecision, SCENARIOS, checkScenario, PERSONALITIES, LAUGH_RX } from "../../../simulation/autonomous/src/life";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MIN = 60000;

describe("habits", () => {
  it("builds a pull toward what felt good at that time of day, and not other times", () => {
    const h = new Habits(); for (let i = 0; i < 20; i++) h.note("dance", 18.5, 0.6);
    expect(h.bonus("dance", 19)).toBeGreaterThan(0.2); expect(h.bonus("dance", 8)).toBe(0); expect(h.bonus("rest", 19)).toBe(0);
    expect(h.habit(19)).toBe("dance"); expect(h.habit(3)).toBeNull();
    const g = new Habits(); g.import(h.export()); expect(g.bonus("dance", 19)).toBeGreaterThan(0.2);
  });
  it("bad outcomes do not build habits", () => { const h = new Habits(); for (let i = 0; i < 30; i++) h.note("wander", 9, -0.9); expect(h.bonus("wander", 9)).toBe(0); });
});
describe("weather", () => {
  it("is deterministic, varied, and always a valid sky", () => {
    const seen = new Set<string>(); for (let d = 0; d < 60; d++) for (const h of [2, 8, 14, 20]) { const s = skyAt(d, h); seen.add(s); expect(skyAt(d, h)).toBe(s); }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
  it("is dark at night, bright by day, and storms are dim with rain", () => {
    expect(daylight(0)).toBeLessThan(0.15); expect(daylight(13)).toBeGreaterThan(0.9);
    expect(skyLook("storm", 13).rain).toBe(1); expect(skyLook("clear", 13).rain).toBe(0); expect(skyLook("clear", 13).top).toMatch(/^#[0-9a-f]{6}$/);
    expect(skyLook("storm", 13).dim).toBeLessThan(skyLook("clear", 13).dim);
  });
  it("storms make a timid robot stay in more than a bold one", () => { expect(skyEffect("storm", 12, 0.1).stayIn).toBeGreaterThan(skyEffect("storm", 12, 0.9).stayIn); expect(skyEffect("clear", 12, 0.5).stayIn).toBe(0); });
});
describe("jokes", () => {
  it("waits before retelling, and not forever", () => {
    const j = new JokeBook(); j.add("tripped over my own feet", 0); const r = mulberry(1);
    expect(j.due(5 * MIN, r)).toBeNull(); const d = j.due(30 * MIN, r)!; expect(d).toBeTruthy();
    expect(j.tell(d, 30 * MIN, r)).toMatch(/tripped/); expect(j.due(31 * MIN, r)).toBeNull();
    for (let i = 0; i < 3; i++) { const x = j.items[0]; j.tell(x, 100 * MIN * (i + 1), r); } expect(j.due(1000 * MIN, r)).toBeNull();
    expect(LAUGH_RX.test("haha that was funny")).toBe(true); expect(LAUGH_RX.test("hello")).toBe(false);
  });
});
describe("tricks", () => {
  it("parses teaching sentences", () => {
    const t = new Tricks();
    expect(t.parse("when I say spin, dance")).toEqual({ phrase: "spin", does: "dance" });
    expect(t.parse("learn to dance when I say party")).toEqual({ phrase: "party", does: "dance" });
    expect(t.parse("What's the weather")).toBeNull();
  });
  it("starts clumsy and gets reliable with practice", () => {
    const t = new Tricks(); t.teach("spin", "dance"); const k = t.items.spin; expect(t.level(k)).toBe("new");
    expect(t.skill(k)).toBeCloseTo(0.3, 2);
    const r = mulberry(4); let early = 0, late = 0;
    for (let i = 0; i < 6; i++) if (t.attempt(k, r) === "ok") early++;
    for (let i = 0; i < 40; i++) t.attempt(k, r); for (let i = 0; i < 40; i++) if (t.attempt(k, r) === "ok") late++;
    expect(late).toBeGreaterThan(early * 3); expect(t.level(k)).toBe("pro");
    expect(t.match("Spin!")?.phrase).toBe("spin"); expect(t.match("vision spin")?.phrase).toBe("spin"); expect(t.match("jump")).toBeNull();
    const u = new Tricks(); u.import(t.export()); expect(u.items.spin.reps).toBe(k.reps);
  });
});
describe("relevant recall", () => {
  const now = 10 * 3600_000;
  const eps = [
    { t: now - 3600_000, kind: "event", detail: "you told me about your dog Biscuit", valence: 0.4, salience: 0.8 },
    { t: now - 60_000, kind: "event", detail: "the lights went out", valence: -0.1, salience: 0.5 },
    { t: now - 7200_000, kind: "learned", detail: "your favorite color is blue", valence: 0.3, salience: 0.8 },
  ];
  it("finds what matches the topic, not just the latest", () => {
    expect(recallRelevant(eps, "my dog was barking at the door", now, 1)[0].detail).toMatch(/Biscuit/);
    expect(recallRelevant(eps, "I painted the wall blue today", now, 1)[0].detail).toMatch(/blue/);
    expect(recallRelevant(eps, "completely unrelated words here", now, 3)).toEqual([]);
  });
});
describe("dreams", () => {
  it("mixes the most important moments; mood follows them", () => {
    expect(dream([], mulberry(1))).toBeNull();
    const d = dream([{ t: 0, kind: "event", detail: "someone scolded me", valence: -0.6, salience: 0.9 }, { t: 1, kind: "event", detail: "a loud noise nearby", valence: -0.3, salience: 0.7 }], mulberry(2))!;
    expect(d.text).toMatch(/dream/); expect(d.valence).toBeLessThan(0); expect(Math.abs(d.valence)).toBeLessThanOrEqual(0.3);
    expect(dream([{ t: 0, kind: "event", detail: "someone praised me", valence: 0.7, salience: 0.9 }], mulberry(2))!.valence).toBeGreaterThan(0);
  });
});
describe("routine", () => {
  it("expects you at your usual time only after a few arrivals", () => {
    const r = new Routine(); r.note(18); r.note(18.2); expect(r.expected(18)).toBe(false);
    r.note(18.1); r.note(17.9); r.note(18.3); expect(r.expected(18.2)).toBe(true); expect(r.expected(9)).toBe(false);
    const q = new Routine(); q.import(r.export()); expect(q.expected(18)).toBe(true);
  });
});
describe("battery", () => {
  it("drains faster when busy, refills on the charger, never leaves 0..1", () => {
    const b = new Battery(); b.drain(100, "dance"); const a = b.level; const c = new Battery(); c.drain(100, "idle"); expect(a).toBeLessThan(c.level);
    b.drain(1e6, "walk"); expect(b.level).toBe(0); expect(b.critical).toBe(true); b.charge(40); expect(b.level).toBeGreaterThan(0.4); b.charge(1e6); expect(b.level).toBe(1); expect(b.full).toBe(true);
  });
  it("runs a few real minutes of walking before it is low", () => { const b = new Battery(); let s = 0; while (!b.low) { b.drain(1, "walk"); s++; } expect(s).toBeGreaterThan(300); expect(s).toBeLessThan(900); });
});
describe("pain", () => {
  it("avoids a place only after it hurts twice", () => {
    const p = new Pain(); p.hurt(10, 10, 0.3, 1); expect(p.avoid()).toEqual([]); p.hurt(11, 10, 0.3, 2); expect(p.avoid().length).toBe(1);
    p.hurt(-30, 5, 0.3, 3); expect(p.avoid().length).toBe(1); p.step(1000); expect(p.level).toBe(0);
    const q = new Pain(); q.import(p.export()); expect(q.avoid().length).toBe(1);
  });
});
describe("temperature", () => {
  it("finds the zone you are in", () => {
    const z = [{ x: 0, z: 0, r: 5, temp: "hot" as const }, { x: 20, z: 0, r: 5, temp: "cold" as const }];
    expect(zoneAt(z, 1, 1)).toBe("hot"); expect(zoneAt(z, 21, 0)).toBe("cold"); expect(zoneAt(z, 10, 10)).toBeNull();
    expect(tempEffect("cold", 0.5).line).toMatch(/cold/i); expect(tempEffect(null, 0.5).line).toBeNull();
  });
});
describe("history and story", () => {
  it("rings, de-duplicates close rows, and finds changes", () => {
    const h = new History(5, 1000);
    expect(h.push({ t: 0, v: 0, a: 0, battery: 1, action: "wander", why: "x" })).toBe(true); expect(h.push({ t: 500, v: 0, a: 0, battery: 1, action: "wander", why: "x" })).toBe(false);
    h.push({ t: 2000, v: 0, a: 0, battery: 1, action: "wander", why: "x" }); h.push({ t: 4000, v: 0, a: 0, battery: 1, action: "rest", why: "y" });
    expect(h.changes().map((r) => r.action)).toEqual(["wander", "rest"]); expect(h.at(3900)?.action).toBe("rest");
    for (let i = 0; i < 10; i++) h.push({ t: 10000 + i * 2000, v: 0, a: 0, battery: 1, action: "a", why: "" }); expect(h.rows.length).toBe(5);
  });
  it("tells a day, and a quiet day too", () => {
    expect(tellDay([], undefined, mulberry(1))).toMatch(/Not much/);
    const s = tellDay([{ t: 1, type: "system", text: "woke up, rested" }, { t: 2, type: "action", text: "wander: restless" }, { t: 3, type: "speech", text: "Hello there!" }, { t: 4, type: "system", text: "asked for some space" }], "Asha", mulberry(3));
    expect(s).toMatch(/woke up/i); expect(s).toMatch(/wander/i); expect(s).toMatch(/Hello there/); expect(s).toMatch(/quiet/i); expect(s).toMatch(/Asha/);
  });
});
describe("voice per person", () => {
  it("is stable, subtle, and different for different people", () => {
    expect(voiceProfile(undefined)).toEqual({ rate: 1, pitch: 1 }); expect(voiceProfile("Asha")).toEqual(voiceProfile("asha"));
    const a = voiceProfile("Asha"), b = voiceProfile("Ben"); expect(a).not.toEqual(b);
    for (const v of [a, b, voiceProfile("Zed")]) { expect(v.rate).toBeGreaterThanOrEqual(0.94); expect(v.rate).toBeLessThanOrEqual(1.06); expect(v.pitch).toBeGreaterThanOrEqual(0.92); expect(v.pitch).toBeLessThanOrEqual(1.08); }
  });
});
describe("several people", () => {
  it("tracks who is here and greets groups", () => {
    const p = new Presence(); p.see("Asha", 0); p.see("Ben", 10_000); expect(p.here(20_000)).toEqual(["Ben", "Asha"]); expect(p.here(70_000)).toEqual([]);
    expect(groupGreeting(["Asha"], mulberry(1))).toBe(""); expect(groupGreeting(["Asha", "Ben"], mulberry(1))).toMatch(/Asha and Ben/);
    expect(tornLine("Ben", "Asha", mulberry(1))).toMatch(/Ben/);
  });
  it("remembers who gave what", () => {
    const g = new GiftLog(); expect(g.line("Asha", mulberry(1))).toBeNull(); g.add("Asha", "toy", 5);
    expect(g.line("asha", mulberry(1))).toMatch(/you gave me/); expect(g.line("Ben", mulberry(1))).toBeNull();
    const h = new GiftLog(); h.import(g.export()); h.import(g.export()); expect(h.items.length).toBe(1);
  });
});
describe("explaining a decision", () => {
  it("uses the biggest reason and the runner-up", () => {
    const t = explainDecision({ chosen: "dance", source: "scored", parts: [{ label: "base feelings", value: 0.2 }, { label: "tiredness", value: -0.6 }], runnerUp: "rest" }, "calm", mulberry(1));
    expect(t).toMatch(/tired/); expect(t).toMatch(/resting|rest/); expect(explainDecision(null, "calm", mulberry(1))).toMatch(/not sure/i);
  });
});
describe("scenarios", () => {
  it("have valid checks", () => { expect(SCENARIOS.length).toBeGreaterThanOrEqual(3); expect(Object.keys(PERSONALITIES)).toContain("timid");
    const v = { valence: 0.5, arousal: 0, trust: 0.6, grudge: 0, battery: 1, pain: 0, sulking: 0, space: 0 };
    expect(checkScenario(SCENARIOS.find((s) => s.id === "kindness")!, v).every((c) => c.pass)).toBe(true);
    expect(checkScenario(SCENARIOS.find((s) => s.id === "overwhelmed")!, v).some((c) => !c.pass)).toBe(true); });
});
