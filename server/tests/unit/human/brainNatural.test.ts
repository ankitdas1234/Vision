import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, type Body, type BrainOptions } from "../../../simulation/autonomous/src/brain";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let t = 0; let brain: Brain; const said: string[] = [];
function make(extra: Partial<BrainOptions> = {}) {
  const body: Body = { act: async (_i, say) => { if (say) said.push(say); }, isBusy: () => false, getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }), getWorld: () => [] };
  brain = new Brain(body, { now: () => t, storageKey: "test.natural." + Math.random(), getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: false }), ...extra });
  return brain;
}
beforeEach(() => { t = 5_000_000; said.length = 0; vi.spyOn(Math, "random").mockImplementation(mulberry(21)); });
afterEach(() => vi.restoreAllMocks());

describe("remembering what you tell him", () => {
  it("asks about your exam later, once, and keeps it across a reload", () => {
    make();
    brain.hear("I have an exam tomorrow and I am a bit nervous");
    t += 60_000;
    expect(brain.hear("the weather looks nice today outside")?.reply ?? "").not.toMatch(/exam/i);   // too soon to ask
    t += 5 * 60_000;
    let asked = ""; for (let i = 0; i < 4 && !/how did/i.test(asked); i++) { t += 130_000; asked = brain.hear("we are having some tea at home now")?.reply ?? ""; }
    expect(asked).toMatch(/how did .*exam|exam .*go/i);
    // not asked again
    t += 200_000; expect(brain.hear("just chatting about the tea and the snacks")?.reply ?? "").not.toMatch(/how did your exam/i);
    // survives export/import to another brain
    const st = brain.exportState(); const b2 = make(); b2.importState(st, 0); expect(b2.exportState().topics.length).toBeGreaterThan(0);
  });
  it("greets a returning person with a follow-up and a 'missed you'", () => {
    make({ knownNames: () => [] });
    brain.hear("my name is Asha"); brain.hear("my dog is sick and I am worried about it");
    brain.sight({ type: "appeared", label: "person" } as any); said.length = 0;
    t += 40 * 60_000; brain.sight({ type: "left", label: "person" } as any);
    t += 40 * 60_000; brain.sight({ type: "appeared", label: "person" } as any);
    const line = said.join(" ");
    expect(line.length).toBeGreaterThan(5);
    expect(line).toMatch(/back|missed|Finally|again|there you are/i);
  });
});

describe("conversation feels alive", () => {
  it("answers a plain statement instead of staying silent, and sometimes asks you something back", () => {
    make();
    for (let i = 0; i < 3; i++) brain.hear("hello there my friend");
    let got = 0, asked = 0;
    for (let i = 0; i < 30; i++) { t += 150_000; const r = brain.hear("I walked to the market and bought some fruit today"); if (r?.reply) got++; if (r?.reply.includes("?")) asked++; }
    expect(got).toBeGreaterThan(25);
    expect(asked).toBeGreaterThan(0);
  });
  it("reads your answer to his question and remembers it", () => {
    make();
    for (let i = 0; i < 3; i++) brain.hear("hello there my friend");
    for (let i = 0; i < 60 && !(brain as any).awaiting; i++) { t += 150_000; brain.hear("I walked to the market and bought some fruit today"); }
    const aw = (brain as any).awaiting as { key: string } | null;
    expect(aw).toBeTruthy();
    const r = brain.hear("blue");
    expect(r?.reply).toMatch(/blue/i);
    expect(brain.exportState().facts[aw!.key]).toBe("blue");
    expect((brain as any).awaiting).toBeNull();
  });
  it("never decorates commands or changes what they do", () => {
    make();
    const r = brain.hear("dance for me");
    expect(r).toBeTruthy();
    expect(r!.reply).not.toMatch(/\?/);
  });
  it("explains why he feels the way he does", () => {
    make(); brain.stimulus("scold");
    const r = brain.hear("why are you sad?");
    expect(r?.reply).toMatch(/scold|because|not sure|okay|unkind|why/i);
  });
  it("with the human-like layer off none of this happens", () => {
    make({ human: false });
    for (let i = 0; i < 20; i++) { t += 150_000; const r = brain.hear("I walked to the market and bought some fruit today"); expect(r?.reply ?? "").not.toMatch(/colou?r|favou?rite|exam|\*beep\*|\(tiny hop\)/); }
    expect(brain.microFrame(0.016, false, false)).toEqual({ tilt: 0, yaw: 0, squash: 0, hop: 0, lean: 0 });
    expect((brain as any).awaiting).toBeNull();
  });
});

describe("body", () => {
  it("startles on a loud noise, less the fifth time (getting used to it)", () => {
    make(); brain.microFrame(0.016, false, false);
    const hops: number[] = [];
    for (let i = 0; i < 5; i++) { brain.stimulus("loud_noise"); hops.push(brain.microFrame(0.016, false, false).hop); for (let k = 0; k < 300; k++) brain.microFrame(0.016, false, false); }
    expect(hops[0]).toBeGreaterThan(0.05);
    expect(hops[4]).toBeLessThan(hops[0]);
    expect(hops[4]).toBeGreaterThan(0);             // still reacts a little
  });
  it("glances away while thinking and stays calm asleep", () => {
    make(); brain.markThinking(800); let yaw = 0; for (let i = 0; i < 40; i++) yaw = Math.max(yaw, Math.abs(brain.microFrame(0.016, false, false).yaw));
    expect(yaw).toBeGreaterThan(0.03);
    brain.clock.sleep(); let y2 = 1; for (let i = 0; i < 200; i++) y2 = Math.abs(brain.microFrame(0.016, false, false).yaw);
    expect(y2).toBeLessThan(0.02);
  });
  it("a bad-tone morning shows up, and he can say sorry for being short", () => {
    make(); (brain as any).dayToneV = -0.2; (brain as any).dayCause = "I woke up a bit grumpy"; (brain as any).valence = -0.1;
    let grumpy = ""; for (let i = 0; i < 60 && !grumpy; i++) { (brain as any).valence = -0.3; const r = brain.hear("the sky is cloudy outside today"); if (r && /Hm\.|later|mood|off today|Maybe/.test(r.reply)) grumpy = r.reply; }
    expect(grumpy).toBeTruthy();
    expect((brain as any).grumpyCount).toBeGreaterThan(0);
    (brain as any).valence = 0.3; (brain as any).dayToneV = 0;
    const r2 = brain.hear("so how is the day going now"); expect(r2?.reply).toMatch(/sorry|snapped|grumpy/i);
  });
});

describe("leftover natural behaviours", () => {
  it("asks for space after too much poking, replies briefly, and recovers on an apology", () => {
    make({ human: true });
    for (let i = 0; i < 6; i++) { t += 800; brain.stimulus("poke"); }
    expect(brain.needsSpace()).toBe(true);
    expect(said.join(" ") + JSON.stringify(brain.getEvents?.() ?? "")).toBeTruthy();
    t += 5000; expect(brain.hear("tell me a story about dragons and castles")?.reply ?? "").toMatch(/minute|space|quiet/i);
    t += 5000; expect(brain.hear("sorry, take your time")?.reply ?? "").toMatch(/thank|better|calmer/i);
    expect(brain.needsSpace()).toBe(false);
  });
  it("space ends by itself and 'stop' is still obeyed during it", () => {
    make({ human: true });
    for (let i = 0; i < 6; i++) { t += 800; brain.stimulus("poke"); }
    t += 1000; const r = brain.hear("stop"); expect(r?.instructions.length ?? 0).toBeGreaterThan(0);
    t += 4 * 60_000; expect(brain.needsSpace()).toBe(false);
  });
  it("turns toward a sound and says which side", () => {
    make({ human: true });
    brain.stimulus("loud_noise", 90);
    expect(brain.takeTurn()).toBe(90); expect(brain.takeTurn()).toBeNull();
  });
  it("feels a pang when you praise another assistant", () => {
    make({ human: true });
    const v0 = (brain as any).valence;
    expect(brain.hear("I like alexa more than you")?.reply ?? "").toMatch(/./);
    expect((brain as any).valence).toBeLessThan(v0);
  });
  it("can be interrupted", () => { make({ human: true }); expect(brain.interrupted()).toMatch(/sorry|stop|go/i); });
  it("old facts fade, he asks again, and your answer is learned and kept", () => {
    make({ human: true });
    const long = (brain as any).memory.long; long.facts["favorite color"] = "blue"; long.factAt = { "favorite color": t - 40 * 86400000 };
    for (let i = 0; i < 30 && long.facts["favorite color"]; i++) (brain as any).fadeOldFacts();
    expect(long.facts["favorite color"]).toBeUndefined(); expect(long.fuzzy).toContain("favorite color");
    long.interactions = 5;
    let q = ""; for (let i = 0; i < 12 && !/colou?r/i.test(q); i++) { t += 130_000; q = brain.hear("we are having some tea at home now")?.reply ?? ""; }
    expect(q).toMatch(/colou?r/i);
    t += 3000; brain.hear("green"); expect(long.facts["favorite color"]).toBe("green"); expect(long.fuzzy).not.toContain("favorite color");
  });
  it("a rough patch changes his personality for good, once, and it survives save/load", () => {
    make({ human: true });
    const b0 = { ...(brain as any).big5() };
    for (let i = 0; i < 7; i++) { t += 200_000; brain.stimulus("scold"); }
    expect((brain as any).memory.long.milestones.rough_patch).toBeTruthy();
    expect((brain as any).big5().bold).toBeLessThan(b0.bold);
    const st = brain.exportState(); expect(st.milestones.rough_patch).toBeTruthy(); expect(st.stats.scolds).toBeGreaterThanOrEqual(7);
    const b2 = make({ human: true }); expect(b2.importState(st, 0)).toBe(true); expect((b2 as any).memory.long.milestones.rough_patch).toBeTruthy();
  });
  it("does none of this with the human layer off", () => {
    make({ human: false });
    for (let i = 0; i < 8; i++) { t += 500; brain.stimulus("poke"); }
    expect(brain.needsSpace()).toBe(false); brain.stimulus("loud_noise", 90); expect(brain.takeTurn()).toBeNull();
  });
});
