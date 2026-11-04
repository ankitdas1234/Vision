import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body, type Instr, type BrainOptions } from "../../../simulation/autonomous/src/brain";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let t = 0;
const acts: { instr: Instr[]; say?: string; at: number; asleep: boolean }[] = [];
let present = false;
let brain: Brain;
const flush = () => new Promise((r) => setImmediate(r));

function make(extra: Partial<BrainOptions> = {}) {
  const body: Body = {
    act: async (instr, say) => { acts.push({ instr, say, at: t, asleep: brain?.clock.asleep ?? false }); },
    isBusy: () => false,
    getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }),
    getWorld: () => [{ id: "toy_red_ball", kind: "toy", x: 5, z: 5, color: "red" }],
  };
  brain = new Brain(body, { now: () => t, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: present }), ...extra });
  return brain;
}
async function run(ticks: number, each?: (i: number) => void) { for (let i = 0; i < ticks; i++) { t += 1000; each?.(i); brain.tick(); await flush(); } }

beforeEach(() => { t = 1_000_000; acts.length = 0; present = false; vi.spyOn(Math, "random").mockImplementation(mulberry(7)); });
afterEach(() => vi.restoreAllMocks());

describe("a simulated day", () => {
  it("gets sleepy, sleeps at night, stays still while asleep, and wakes up rested", async () => {
    make();
    const phases = new Set<string>(); let sawAsleep = false, wokeAfter = false;
    await run(36 * 60, () => { phases.add(brain.clock.phase()); if (brain.clock.asleep) sawAsleep = true; else if (sawAsleep) wokeAfter = true; });
    expect(phases).toEqual(new Set(["morning", "day", "evening", "night"]));
    expect(sawAsleep).toBe(true);
    expect(wokeAfter).toBe(true);
    // while asleep he does not walk, dance or play
    const moving = acts.filter((a) => a.asleep && a.instr.some((i) => i.op === "EXEC" && ["WALK_FORWARD", "DANCE", "GOTO"].includes(i.command)));
    expect(moving).toEqual([]);
  });

  it("is a person-sized rhythm, not a one-off: sleeps again the next night", async () => {
    make();
    let sleeps = 0, prev = false;
    await run(50 * 60, () => { if (brain.clock.asleep && !prev) sleeps++; prev = brain.clock.asleep; });
    expect(sleeps).toBeGreaterThanOrEqual(2);
  });

  it("carries out multi-step plans in order, using the plan's own words", async () => {
    make();
    const logs: string[] = [];
    (brain as any).opts.onEvent = (type: string, text: string) => { if (type === "thought" || type === "system") logs.push(text); };
    await run(1500);
    expect(logs.some((l) => l.startsWith("new plan:"))).toBe(true);
    expect(logs.some((l) => l === "finished my plan")).toBe(true);
    expect(brain.planner.completed.length).toBeGreaterThan(0);
  });

  it("the human layer can be switched off: no sleep, no plans", async () => {
    make({ human: false });
    await run(24 * 60);
    expect(brain.clock.asleep).toBe(false);
    expect(brain.planner.current).toBeNull();
    expect(brain.planner.completed).toEqual([]);
    expect(brain.snapshot().clock).toBeUndefined();
  });
});

describe("waking and being woken", () => {
  it("someone speaking wakes him groggy", async () => {
    make(); brain.clock.sleep();
    expect(brain.clock.asleep).toBe(true);
    brain.hear("hello there");
    expect(brain.clock.asleep).toBe(false);
    expect(brain.clock.groggy()).toBe(true);
  });
  it("a loud noise wakes him and a person walking in does not", async () => {
    make(); brain.clock.sleep();
    brain.sight({ type: "appeared", label: "person", side: "center", near: true, source: "camera" } as any);
    expect(brain.clock.asleep).toBe(true);
    brain.stimulus("loud_noise");
    expect(brain.clock.asleep).toBe(false);
  });
});

describe("feelings and relationships", () => {
  it("a scolding makes him hurt and cool; an apology repairs it", async () => {
    make();
    brain.hear("my name is Ada");
    brain.stimulus("scold"); brain.stimulus("scold");
    expect(brain.snapshot().sulking).toBe(true);
    expect(brain.mood()).toBe("sad");
    const cool = brain.hear("how are you today");
    expect(["…", "I'm still a bit upset.", "Mm. Not right now.", "I don't feel like talking much."]).toContain(cool?.reply);
    const r = brain.hear("I'm sorry I shouted");
    expect(r?.reply).toMatch(/forgive|Thanks|still a little hurt/);
    brain.hear("sorry again, I really am");
    expect(brain.snapshot().sulking).toBe(false);
  });
  it("he refuses to dance when he is hurt", () => {
    make(); brain.stimulus("scold"); brain.stimulus("scold");
    const res = Array.from({ length: 10 }, () => brain.hear("please dance")?.instructions.some((i) => i.op === "EXEC" && i.command === "DANCE"));
    expect(res.filter(Boolean).length).toBeLessThan(3);
  });
  it("hurt feelings fade with time", async () => {
    make(); brain.stimulus("scold"); brain.stimulus("scold");
    expect(brain.snapshot().sulking).toBe(true);
    brain.fastForward(3000);
    expect(brain.snapshot().sulking).toBe(false);
  });
  it("shows empathy when you sound down", () => {
    make();
    const r = brain.hear("I had a really bad day and I feel lonely");
    expect(r?.reply).toMatch(/hard|listening|here|tell me|glad you told|what happened|take your time|easy/i);
  });
  it("remembers what you showed him and recalls it when you come back", async () => {
    make(); brain.hear("my name is Ada");
    brain.sight({ type: "appeared", label: "teddy bear", side: "center", near: true, size: 0.2, cx: 0.5, source: "camera" } as any);
    const said: string[] = [];
    (brain as any).opts.onEvent = (type: string, text: string) => { if (type === "speech") said.push(text); };
    t += 120_000;
    // a greeting after being away uses the memory about this person
    let greeted = "";
    for (let i = 0; i < 12 && !/teddy/.test(greeted); i++) {
      said.length = 0; (brain as any).lastPersonAt = -1e12;
      brain.sight({ type: "appeared", label: "person", side: "center", near: true, source: "camera" } as any);
      greeted = said.join(" ");
    }
    expect(greeted).toMatch(/Ada/);
    expect(greeted).toMatch(/teddy bear/);
  });
  it("gives the AI cortex human context to phrase speech (it still never picks actions)", () => {
    make(); brain.hear("my name is Ada"); brain.stimulus("scold"); brain.stimulus("scold");
    const req = (brain as any).buildRequest("hi");
    expect(req.human.sulking).toBe(true);
    expect(req.human.phase).toBe("morning");
    expect(req.human.relationship.name).toBe("Ada");
    expect(Object.keys(req.human.traits)).toEqual(["curious", "sociable", "calm", "bold", "agreeable"]);
  });
});

describe("expression", () => {
  it("his posture follows his state", async () => {
    make();
    const calm = brain.posture();
    brain.stimulus("scold"); brain.stimulus("scold");
    const hurt = brain.posture();
    expect(hurt.slump).toBeGreaterThan(calm.slump);
    expect(hurt.speed).toBeLessThan(calm.speed);
    brain.clock.sleep();
    expect(brain.posture().speed).toBe(0);
  });
});

describe("review fixes", () => {
  it("does not mistake a question about him for the person being sad", () => {
    make();
    expect(brain.hear("are you tired?")?.reply ?? "").not.toMatch(/sounds hard|listening|tell me about it/i);
    expect(brain.hear("I feel so tired and sad today")?.reply).toMatch(/hard|listening|here|tell me|glad you told|what happened|take your time|easy/i);
  });
  it("a long message that merely contains 'sorry' is not swallowed as an apology", () => {
    make();
    const r = brain.hear("sorry I'm late, could you please dance for me now");
    expect(r?.reply ?? "").not.toMatch(/no harm done/);
  });
  it("keeps what he remembered about 'you' once he learns your name", () => {
    make();
    brain.sight({ type: "appeared", label: "teddy bear", side: "center", near: true, size: 0.2, cx: 0.5, source: "camera" } as any);
    brain.stimulus("scold"); brain.stimulus("scold");
    brain.hear("my name is Ada");
    expect(brain.rel.map.you).toBeUndefined();
    expect(brain.rel.map.ada.moments.some((m) => /teddy/.test(m.text))).toBe(true);
    expect(brain.snapshot().sulking).toBe(true);
  });
  it("does not fall asleep in the middle of a conversation", async () => {
    make(); brain.clock.minutes = 23 * 60; brain.clock.pressure = 1;
    expect(brain.clock.shouldSleep()).toBe(true);
    brain.hear("tell me a story");
    await run(30);
    expect(brain.clock.asleep).toBe(false);
    await run(60);                                   // goes quiet for a while, then he does doze off
    expect(brain.clock.asleep).toBe(true);
  });
});
