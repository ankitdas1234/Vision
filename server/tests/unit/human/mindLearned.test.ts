import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body } from "../../../simulation/autonomous/src/brain";
import { OnlineResidual, NetPolicy, trainNet, featuresOf, ACTION_NAMES, FEATURES } from "../../../simulation/autonomous/src/residual";
import type { MindTick } from "../../../simulation/autonomous/src/mindlog";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe("OnlineResidual (step 3)", () => {
  it("does nothing until switched on", () => { const r = new OnlineResidual(); r.learn("play", { curiosity: 1 }, 1); expect(r.adj("play", { curiosity: 1 })).toBe(0); r.enabled = true; expect(r.adj("play", { curiosity: 1 })).toBeGreaterThan(0); });
  it("learns that an action pays off in a given state, and stays small and bounded", () => {
    const r = new OnlineResidual(); r.enabled = true; const hi = { curiosity: 0.9, boredom: 0.8 }, lo = { curiosity: 0.1, boredom: 0.1 };
    for (let i = 0; i < 400; i++) { r.learn("play", hi, 0.6); r.learn("play", lo, -0.4); r.learn("rest", hi, -0.5); }
    expect(r.adj("play", hi)).toBeGreaterThan(r.adj("play", lo));
    expect(r.adj("rest", hi)).toBeLessThan(0);
    for (const a of ["play", "rest"]) for (const s of [hi, lo]) expect(Math.abs(r.adj(a, s))).toBeLessThanOrEqual(0.25);
    for (const w of Object.values(r.w)) for (const x of w) expect(Math.abs(x)).toBeLessThanOrEqual(0.6);
  });
  it("ignores bad rewards, can be reset, and round-trips through JSON", () => {
    const r = new OnlineResidual(); r.enabled = true; r.learn("play", { curiosity: 1 }, NaN); expect(r.w).toEqual({});
    r.learn("play", { curiosity: 1 }, 1); const j = JSON.parse(JSON.stringify(r.toJSON())); const r2 = new OnlineResidual(); r2.enabled = true; r2.load(j);
    expect(r2.adj("play", { curiosity: 1 })).toBeCloseTo(r.adj("play", { curiosity: 1 }), 9); r.reset(); expect(r.w).toEqual({});
    r2.load({ w: { x: [1, NaN] } } as any); expect(r2.w).toEqual({});
  });
});

// a world where "rest" truly pays when tired and "play" pays when curious, logged by a policy that picks near-randomly
function world(n: number, seed = 3): MindTick[] {
  const r = mulberry(seed), rows: MindTick[] = [];
  for (let i = 0; i < n; i++) {
    const fatigue = r(), curiosity = r(), state = { curiosity, social: r(), boredom: r(), valence: r() - 0.5, arousal: r(), fatigue, present: 0, sleepiness: fatigue };
    const actions: MindTick["actions"] = {}; for (const a of ACTION_NAMES) actions[a] = { base: 0.05 * (a.length % 3) };
    const pick = ACTION_NAMES[Math.floor(r() * ACTION_NAMES.length)];
    const reward = (pick === "rest" ? fatigue - 0.5 : pick === "play" ? curiosity - 0.5 : -0.2) + (r() - 0.5) * 0.1;
    rows.push({ t: i, src: "scored", state, chosen: pick, pLog: 1 / ACTION_NAMES.length, temp: 0.3, actions, reward });
  }
  return rows;
}

describe("NetPolicy and trainNet (step 4)", () => {
  it("needs enough rows, and never accepts a net that does not beat the hand-tuned mind on held-out rows", () => {
    expect(trainNet(world(40)).accepted).toBe(false);
    const noise = world(900, 5).map((t, i) => ({ ...t, reward: ((i * 7919) % 100) / 100 - 0.5 })); // reward unrelated to anything
    const res = trainNet(noise, { epochs: 30 }); if (res.accepted) expect(res.validLoss).toBeLessThan(res.baselineLoss); else expect(res.net).toBeNull();
  });
  it("learns the pattern: tired -> rest scores higher than play, curious -> play scores higher than rest", () => {
    const res = trainNet(world(2500), { epochs: 40, seed: 2 }); expect(res.accepted).toBe(true); expect(res.validLoss).toBeLessThan(res.baselineLoss);
    const p = new NetPolicy(); expect(p.load(JSON.parse(JSON.stringify(res.net)))).toBe(true); p.enabled = true;
    const tired = { curiosity: 0.1, fatigue: 0.95, sleepiness: 0.95 }, curious = { curiosity: 0.95, fatigue: 0.05, sleepiness: 0.05 };
    expect(p.adj("rest", tired) - p.adj("play", tired)).toBeGreaterThan(p.adj("rest", curious) - p.adj("play", curious));
    for (const a of ACTION_NAMES) expect(Math.abs(p.adj(a, tired))).toBeLessThanOrEqual(0.5);
  });
  it("refuses broken nets and is silent when off", () => {
    const p = new NetPolicy(); expect(p.load({ v: 1 } as any)).toBe(false); expect(p.load(null)).toBe(false);
    const res = trainNet(world(1500), { epochs: 10, seed: 4 }); const bad = JSON.parse(JSON.stringify(res.net ?? { v: 1 })); if (res.net) { bad.W1[0][0] = NaN; bad.W1 = bad.W1.map((r: number[]) => r.map((x) => (Number.isFinite(x) ? x : null))); expect(p.load(bad)).toBe(false); }
    expect(p.adj("rest", {})).toBe(0);
  });
  it("featuresOf has a bias plus one entry per feature", () => { expect(featuresOf({ curiosity: 0.5 })).toHaveLength(FEATURES.length + 1); });
});

describe("in the real Brain", () => {
  let t = 1_000_000;
  const body: Body = { act: async () => {}, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [{ id: "toy_red_ball", kind: "toy", x: 5, z: 5, color: "red" }] };
  const mk = () => new Brain(body, { now: () => t, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }) });
  const run = async (b: Brain, n: number) => { for (let i = 0; i < n; i++) { t += 1000; b.tick(); await new Promise((r) => setImmediate(r)); } };
  beforeEach(() => { t = 1_000_000; vi.spyOn(Math, "random").mockImplementation(mulberry(7)); });
  afterEach(() => vi.restoreAllMocks());
  it("off by default: choices are identical with and without the learned objects present", async () => {
    const a = mk(); await run(a, 300); const A = a.mindLog.ticks.map((x) => x.chosen);
    t = 1_000_000; vi.spyOn(Math, "random").mockImplementation(mulberry(7)); const b = mk(); b.residual.enabled = false; b.netPolicy.enabled = false; await run(b, 300);
    expect(b.mindLog.ticks.map((x) => x.chosen)).toEqual(A);
  });
  it("online residual switched on learns something while running, and logs stay raw (no 'learned' part in the log)", async () => {
    const b = mk(); b.residual.enabled = true; await run(b, 900);
    expect(Object.keys(b.residual.w).length).toBeGreaterThan(0);
    const labels = new Set<string>(); for (const x of b.mindLog.ticks) for (const p of Object.values(x.actions)) for (const k of Object.keys(p)) labels.add(k);
    expect(labels.has("learned")).toBe(false);
  });
  it("a loaded net changes the scores shown in the decision explanation", async () => {
    const res = trainNet(world(2000), { epochs: 20, seed: 2 }); expect(res.net).not.toBeNull();
    const b = mk(); b.netPolicy.load(res.net); b.netPolicy.enabled = true; let seen = false;
    for (let i = 0; i < 400 && !seen; i++) { await run(b, 1); if (b.lastDecisionInfo()?.parts.some((p) => p.label === "learned")) seen = true; }
    expect(seen).toBe(true);
  });
});
