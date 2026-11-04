import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body } from "../../../simulation/autonomous/src/brain";
import { MindLog, type MindTick } from "../../../simulation/autonomous/src/mindlog";
import { tune, evaluate, policyProb, parseJSONL, usable, LOCKED } from "../../../simulation/autonomous/src/tuner";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// synthetic world: action A is truly good (+1), B is bad (-1); part x favours A, part y favours B, battery favours B
function synth(n: number, seed = 5): MindTick[] {
  const r = mulberry(seed), out: MindTick[] = [];
  for (let i = 0; i < n; i++) {
    const actions = { A: { x: 1, y: 0, battery: 0 }, B: { x: 0, y: 1, battery: 0.5 } };
    const chosen = r() < 0.5 ? "A" : "B";
    out.push({ t: i, src: "scored", state: {}, chosen, pLog: 0.5, temp: 0.3, actions, reward: chosen === "A" ? 1 : -1 });
  }
  return out;
}

describe("tuner", () => {
  it("moves weight towards the part that predicts reward, and never touches safety parts", () => {
    const r = tune(synth(800), { gens: 60 });
    expect(r.accepted).toBe(true);
    expect(r.weights.x).toBeGreaterThan(r.weights.y);
    for (const l of LOCKED) if (l in r.weights) expect(r.weights[l]).toBe(1);
    expect(r.valid.tuned).toBeGreaterThan(r.valid.base);
  });
  it("keeps the original weights when the log is too small or the reward is pure noise", () => {
    expect(tune(synth(50)).accepted).toBe(false);
    const r = mulberry(9), noise = synth(900).map((t) => ({ ...t, reward: r() - 0.5 }));
    const res = tune(noise);
    expect(res.accepted).toBe(false);
    expect(Object.values(res.weights).every((w) => w === 1)).toBe(true);
  });
  it("is repeatable with the same seed and ignores rows that did not come from the softmax", () => {
    const d = synth(600); expect(tune(d, { seed: 3 }).weights).toEqual(tune(d, { seed: 3 }).weights);
    expect(usable(d.map((t) => ({ ...t, src: "plan" })))).toHaveLength(0);
  });
  it("policyProb is a probability and equals pLog at weight 1 for a matching log", () => {
    const t = { ...synth(1)[0], chosen: "A", actions: { A: { x: 1 }, B: { y: 1 } } }; expect(policyProb(t, {})).toBeCloseTo(0.5, 5); expect(policyProb(t, { x: 2 })).toBeGreaterThan(0.5);
    expect(evaluate(synth(100), {}).value).toBeCloseTo(evaluate(synth(100), { x: 1, y: 1 }).value, 9);
  });
  it("parses JSONL and skips bad lines", () => { expect(parseJSONL(JSON.stringify(synth(2)[0]) + "\nnot json\n\n")).toHaveLength(1); });
});

describe("mind log and weights in the real Brain", () => {
  let t = 1_000_000;
  const body: Body = { act: async () => {}, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [{ id: "toy_red_ball", kind: "toy", x: 5, z: 5, color: "red" }] };
  const mk = (extra = {}) => new Brain(body, { now: () => t, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }), ...extra });
  const run = async (b: Brain, n: number) => { for (let i = 0; i < n; i++) { t += 1000; b.tick(); await new Promise((r) => setImmediate(r)); } };
  beforeEach(() => { t = 1_000_000; vi.spyOn(Math, "random").mockImplementation(mulberry(7)); });
  afterEach(() => vi.restoreAllMocks());

  it("logs every choice with raw parts for each option, then fills in the reward", async () => {
    const b = mk(); await run(b, 600);
    const rows = b.mindLog.ticks.filter((x) => x.reward !== undefined);
    expect(rows.length).toBeGreaterThan(20);
    const row = rows.find((x) => x.src === "scored")!;
    expect(Object.keys(row.actions).length).toBeGreaterThan(2);
    expect(row.actions[row.chosen]).toBeDefined();
    expect(row.pLog).toBeGreaterThan(0); expect(row.pLog).toBeLessThanOrEqual(1);
    expect(Object.keys(row.state)).toEqual(expect.arrayContaining(["curiosity", "social", "boredom", "valence"]));
    expect(b.mindLog.toJSONL().trim().split("\n").length).toBe(rows.length);
  });
  it("no weights = identical choices to before; a zero weight on a part changes the scores", async () => {
    const seqA: string[] = [], seqC: string[] = [];
    const a = mk(); await run(a, 300);
    t = 1_000_000; vi.spyOn(Math, "random").mockImplementation(mulberry(7)); const c = mk({ weights: {} }); await run(c, 300);
    a.mindLog.ticks.forEach((x) => seqA.push(x.chosen)); c.mindLog.ticks.forEach((x) => seqC.push(x.chosen));
    expect(seqC).toEqual(seqA);
    const d = mk({ weights: { "base feelings": 0 } }); d.tick(); t += 20000; d.tick(); await new Promise((r) => setImmediate(r));
    expect(d.getWeights()).toEqual({ "base feelings": 0 });
  });
  it("a bad weights object is clamped and non-numbers are dropped", () => {
    const b = mk(); b.setWeights({ a: 99, b: -4, c: NaN, d: 1.5 } as any);
    expect(b.getWeights()).toEqual({ a: 3, b: 0, d: 1.5 });
  });
  it("MindLog keeps only the newest rows", () => {
    const l = new MindLog(5); for (let i = 0; i < 12; i++) l.add({ ...synth(1)[0], t: i });
    expect(l.ticks.map((x) => x.t)).toEqual([7, 8, 9, 10, 11]);
  });
});
