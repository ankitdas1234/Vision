import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BodyClock, Planner, Relationships, driftTraits, DEFAULT_BIG5, postureFor, styleSpeech, daydream, empathy, APOLOGY, traitBias, type PlanContext } from "../../../simulation/autonomous/src/human";

const rng = () => 0.1;
const ctx = (o: Partial<PlanContext> = {}): PlanContext => ({
  now: 100000, rng, curiosity: 0.2, boredom: 0.2, social: 0.2, valence: 0, arousal: 0.2, fatigue: 0, sleepiness: 0.1, phase: "day",
  personPresent: false, sulking: false, ...o,
});

describe("BodyClock", () => {
  it("gets sleepy at night, sleeps, and wakes rested in the morning", () => {
    const c = new BodyClock(1, { minutes: 8 * 60 });
    expect(c.shouldSleep()).toBe(false);
    c.advance(15 * 60);                              // 1 sec = 1 sim minute: 15 sim hours awake -> 23:00
    expect(c.clockText()).toBe("23:00");
    expect(c.phase()).toBe("night");
    expect(c.shouldSleep()).toBe(true);
    c.sleep();
    c.advance(9 * 60);                               // 9 sim hours of sleep -> 08:00 (he wakes once rested AND it is no longer the small hours)
    expect(c.asleep).toBe(false);
    expect(c.phase()).toBe("morning");
    expect(c.pressure).toBeLessThan(0.25);
  });
  it("is alert in the afternoon and a disturbance wakes him groggy", () => {
    const c = new BodyClock(1, { minutes: 15 * 60, pressure: 0.2 });
    expect(c.sleepiness()).toBeLessThan(0.3);
    const n = new BodyClock(1, { minutes: 2 * 60, pressure: 0.9, asleep: true });
    const before = n.sleepiness();
    n.wake("disturbed");
    expect(n.asleep).toBe(false); expect(n.groggy()).toBe(true);
    expect(before).toBeGreaterThan(0.7);
    expect(n.shouldSleep()).toBe(false);                 // does not doze straight back off
    n.advance(13 * 60);
    expect(n.groggy()).toBe(false);
  });
  it("energy falls as sleepiness rises", () => {
    expect(new BodyClock(1, { minutes: 15 * 60, pressure: 0.1 }).energy()).toBeGreaterThan(new BodyClock(1, { minutes: 3 * 60, pressure: 0.9 }).energy());
  });
});

describe("Planner", () => {
  it("proposes a social plan (show the toy) and walks through it step by step", () => {
    const p = new Planner();
    const it = p.propose(ctx({ boredom: 0.8, personPresent: true, freeToy: "red ball", userName: "Ada" }))!;
    expect(it.goal).toContain("red ball");
    expect(p.peek()?.action).toBe("play");
    expect(p.advance("play", 1)).toBe("next");
    expect(p.peek()?.action).toBe("watch");
    expect(p.peek()?.say || p.peek()?.alts?.length).toBeTruthy();
    expect(p.advance("watch", 2)).toBe("done");
    expect(p.current).toBeNull();
  });
  it("ignores an action that is not the planned step", () => {
    const p = new Planner(); p.propose(ctx({ curiosity: 0.9 }));
    expect(p.advance("dance", 1)).toBeNull(); expect(p.peek()?.action).toBe("wander");
  });
  it("winds down when sleepy in the evening", () => {
    const it = new Planner().propose(ctx({ sleepiness: 0.8, phase: "night" }))!;
    expect(it.steps.map((s) => s.action)).toEqual(["murmur", "rest"]);
  });
  it("is interrupted by a shock, resumes after calm, or is dropped if it lasts", () => {
    const p = new Planner(); p.propose(ctx({ curiosity: 0.9 }));
    p.interrupt("loud noise", 100000);
    expect(p.peek()).toBeNull();
    expect(p.tick(103000, true)).toBeNull();               // too soon
    expect(p.tick(107000, true)).toMatch(/back to/);       // calm: resumes
    expect(p.peek()?.action).toBe("wander");
    p.interrupt("scolded", 110000);
    expect(p.tick(140000, false)).toMatch(/dropped/);
    expect(p.current).toBeNull();
  });
  it("gives up when it takes too long, and does not nag with new plans", () => {
    const p = new Planner(); p.propose(ctx({ curiosity: 0.9 }));
    expect(p.tick(100000 + 91000, true)).toMatch(/too long/);
    expect(p.propose(ctx({ now: 100000 + 92000, curiosity: 0.9 }))).toBeNull();   // cooldown
  });
  it("does not offer to show a toy to someone he is hurt by", () => {
    const it = new Planner().propose(ctx({ boredom: 0.8, personPresent: true, freeToy: "ball", sulking: true }));
    expect(it?.goal ?? "").not.toContain("show");
  });
});

describe("Relationships", () => {
  const H = 3600_000;
  let r: Relationships;
  beforeEach(() => { r = new Relationships("k"); });
  it("a scolding creates hurt feelings; an apology forgives; time heals", () => {
    r.scold("Ada", 0); r.scold("Ada", 0);
    expect(r.sulking("Ada", 1000)).toBe(true);
    expect(r.apologize("Ada", 2000)).toMatch(/forgiven|softened/);
    r.scold("Ada", 0); r.scold("Ada", 0);
    const g0 = r.map.ada.grudge; r.decay(1200);
    expect(r.map.ada.grudge).toBeLessThan(g0 / 3);
  });
  it("trust falls after a scolding and recovers only slowly", () => {
    r.scold("Ada", 0); const t0 = r.map.ada.trust;
    r.apologize("Ada", 1);
    expect(r.map.ada.trust - t0).toBeLessThan(0.05);
  });
  it("recalls a shared moment naturally, then blurs it as it fades, then forgets", () => {
    r.record("Ada", "showed", "a teddy bear", 0.5, 0.9, 0);
    expect(r.recall("Ada", 60_000, rng)).toMatch(/teddy bear/);
    const blurry = r.recall("Ada", 6 * H, rng);
    expect(blurry === null || /blurry|exactly/.test(blurry)).toBe(true);
    expect(r.recall("Ada", 200 * H, rng)).toBeNull();
  });
  it("remembers emotional moments longer than flat ones", () => {
    r.record("Ada", "told", "your favourite colour is blue", 0, 0.5, 0);
    r.record("Ada", "praise", "you praised me", 0.9, 0.5, 0);
    const [flat, strong] = r.map.ada.moments;
    expect(r.strength(strong, 4 * H)).toBeGreaterThan(r.strength(flat, 4 * H));
  });
  it("keeps separate records per person and persists", () => {
    const store: Record<string, string> = {};
    const s = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const a = new Relationships("x", s); a.scold("Ada", 0); a.praise("Bo", 0);
    const b = new Relationships("x", s);
    expect(b.map.ada.grudge).toBeGreaterThan(0); expect(b.map.bo.grudge).toBe(0);
  });
  it("evicts the weakest moment when full, not the newest", () => {
    for (let i = 0; i < 45; i++) r.record("Ada", "told", `thing ${i}`, 0, i === 3 ? 1 : 0.2, i);
    expect(r.map.ada.moments.length).toBe(40);
    expect(r.map.ada.moments.some((m) => m.text === "thing 3")).toBe(true);
    expect(r.map.ada.moments.some((m) => m.text === "thing 44")).toBe(true);
  });
});

describe("personality, reflection, expression", () => {
  it("traits drift slowly with experience and stay in 0..1", () => {
    const t = { ...DEFAULT_BIG5 };
    for (let i = 0; i < 10; i++) driftTraits(t, { action: "dance", reward: 0.5 });
    expect(t.bold).toBeGreaterThan(0.6); expect(t.bold).toBeLessThan(0.8);
    for (let i = 0; i < 100; i++) driftTraits(t, { event: "scold" });
    expect(t.bold).toBeGreaterThanOrEqual(0); expect(t.calm).toBeGreaterThanOrEqual(0);
    expect(traitBias({ ...DEFAULT_BIG5, sociable: 0.9 }, "watch")).toBeGreaterThan(0);
  });
  it("daydreams about strong memories and notices his favourite", () => {
    const r = new Relationships("k");
    const d = daydream({ rng: () => 0.1, now: 1, asleep: true, relationships: r, traits: { ...DEFAULT_BIG5 }, recentEpisodes: [{ kind: "played", detail: "the ball", valence: 0.5, salience: 0.9 }] });
    expect(d.thought).toMatch(/Dreaming about the ball/);
    const w = daydream({ rng: () => 0.1, now: 1, asleep: false, relationships: r, traits: { ...DEFAULT_BIG5 }, recentEpisodes: [{ kind: "look_around", detail: "Quietly checking my surroundings.", valence: 0.1, salience: 0.9 }] });
    expect(w.thought).toBe("Thinking back to looking around quietly.");
    const e = daydream({ rng: () => 0.95, now: 1, asleep: false, favorite: "dance", relationships: r, traits: { ...DEFAULT_BIG5 }, recentEpisodes: [] });
    expect(e.insight).toMatch(/enjoy dance/);
  });
  it("posture reflects mood and sleepiness", () => {
    const base = { sleepiness: 0, asleep: false, sulking: false, fatigue: 0 };
    expect(postureFor({ ...base, mood: "sad" }).slump).toBeGreaterThan(postureFor({ ...base, mood: "excited" }).slump);
    expect(postureFor({ ...base, mood: "excited" }).energy).toBeGreaterThan(postureFor({ ...base, mood: "sad" }).energy);
    expect(postureFor({ ...base, mood: "calm", sleepiness: 0.9 }).speed).toBeLessThan(0.8);
    expect(postureFor({ ...base, mood: "calm", asleep: true }).speed).toBe(0);
  });
  it("speech sounds sleepy, curt when hurt, hesitant when torn", () => {
    expect(styleSpeech("Hello there.", { sleepiness: 0.9, sulking: false, mood: "calm" }, () => 0.1)).toMatch(/^\*yawn\*/);
    expect(styleSpeech("Hello there friend, how are you doing today, it has been a while.", { sleepiness: 0, sulking: true, mood: "sad" }, () => 0.1)).toMatch(/^…/);
    expect(styleSpeech("Hello.", { sleepiness: 0, sulking: false, mood: "calm", conflict: 0.8 }, () => 0.1)).toMatch(/^Um…/);
    expect(styleSpeech("Hello.", { sleepiness: 0, sulking: false, mood: "calm" }, () => 0.1)).toBe("Hello.");
  });
  it("notices sadness and apologies", () => {
    expect(empathy("I had a bad day, feeling really tired", rng)?.line).toBeTruthy();
    expect(empathy("what time is it", rng)).toBeNull();
    expect(APOLOGY.test("I'm sorry I yelled")).toBe(true);
    expect(APOLOGY.test("good morning")).toBe(false);
  });
});
