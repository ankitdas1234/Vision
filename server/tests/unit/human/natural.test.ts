import { describe, it, expect } from "vitest";
import { Micro, TopicMemory, extractTopics, curiosityQuestion, readAnswer, isStatement, backchannel, hedge, applyQuirk, pickQuirk, QUIRKS, callback, MoodLog, explainMood, dayTone, reunion, type MicroCtx } from "../../../simulation/autonomous/src/natural";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const idle: MicroCtx = { asleep: false, walking: false, dancing: false, listening: false, thinking: false, arousal: 0.3, sleepiness: 0.1 };

describe("Micro", () => {
  it("blinks, tilts and glances over time, always staying small and finite", () => {
    const m = new Micro(mulberry(3)); let blinks = 0, wasBlink = false, maxTilt = 0, maxYaw = 0;
    for (let i = 0; i < 60 * 90; i++) {
      const o = m.update(1 / 60, idle);
      const b = o.squash > 0.01; if (b && !wasBlink) blinks++; wasBlink = b;
      maxTilt = Math.max(maxTilt, Math.abs(o.tilt)); maxYaw = Math.max(maxYaw, Math.abs(o.yaw));
      for (const v of Object.values(o)) expect(Number.isFinite(v)).toBe(true);
      expect(o.squash).toBeLessThan(0.1); expect(Math.abs(o.tilt)).toBeLessThan(0.3); expect(Math.abs(o.lean)).toBeLessThan(0.5);
    }
    expect(blinks).toBeGreaterThan(8);       // about every 2-6 s over 90 s
    expect(blinks).toBeLessThan(60);
    expect(maxTilt).toBeGreaterThan(0.03);
    expect(maxYaw).toBeGreaterThan(0.05);
  });
  it("is calm asleep: eyes closed, no glances", () => {
    const m = new Micro(mulberry(4)); let maxYaw = 0, last = m.out;
    for (let i = 0; i < 600; i++) { last = m.update(1 / 60, { ...idle, asleep: true }); maxYaw = Math.max(maxYaw, Math.abs(last.yaw)); }
    expect(maxYaw).toBeLessThan(0.01); expect(last.squash).toBeGreaterThan(0.015);
  });
  it("startle hops and leans back then settles; stumble leans forward then recovers", () => {
    const m = new Micro(mulberry(5)); m.update(1 / 60, idle);
    m.startle(1); const o1 = m.update(1 / 60, idle);
    expect(o1.hop).toBeGreaterThan(0.05); expect(o1.lean).toBeLessThan(-0.1);
    for (let i = 0; i < 300; i++) m.update(1 / 60, idle);
    expect(Math.abs(m.out.lean)).toBeLessThan(0.01); expect(m.out.hop).toBeLessThan(0.01);
    expect(m.events).toContain("startle");
    m.stumble(); let peak = 0; for (let i = 0; i < 100; i++) peak = Math.max(peak, m.update(1 / 60, idle).lean);
    expect(peak).toBeGreaterThan(0.1);
    for (let i = 0; i < 200; i++) m.update(1 / 60, idle);
    expect(Math.abs(m.out.lean)).toBeLessThan(0.02);
    expect(m.events).toContain("stumble");
  });
  it("looks away while thinking, then back; tilts more while listening", () => {
    const m = new Micro(mulberry(6)); let yaw = 0;
    for (let i = 0; i < 40; i++) yaw = Math.max(yaw, Math.abs(m.update(1 / 60, { ...idle, thinking: true }).yaw));
    expect(yaw).toBeGreaterThan(0.05);
    for (let i = 0; i < 240; i++) m.update(1 / 60, { ...idle, listening: true });
    expect(Math.abs(m.out.yaw)).toBeLessThan(0.02); // eye contact while listening
    const a = new Micro(mulberry(7)), b = new Micro(mulberry(7)); let ta = 0, tb = 0;
    for (let i = 0; i < 60 * 120; i++) { ta += Math.abs(a.update(1 / 60, { ...idle, listening: true }).tilt); tb += Math.abs(b.update(1 / 60, idle).tilt); }
    expect(ta).toBeGreaterThan(tb);
  });
  it("trips now and then while walking, rarely, and not when still", () => {
    const m = new Micro(mulberry(8)); let n = 0;
    for (let i = 0; i < 60 * 600; i++) { m.update(1 / 60, { ...idle, walking: true }); }
    n = m.events.filter((e) => e === "stumble").length;
    expect(n).toBeGreaterThan(1); expect(n).toBeLessThan(25);
    const s = new Micro(mulberry(9)); for (let i = 0; i < 60 * 600; i++) s.update(1 / 60, idle);
    expect(s.events.filter((e) => e === "stumble").length).toBe(0);
  });
  it("survives huge or zero time steps", () => {
    const m = new Micro(mulberry(1)); m.update(0, idle); m.update(5, idle); m.update(-1, idle);
    for (const v of Object.values(m.out)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("topics", () => {
  it("picks out events, beings, feelings and plans, and ignores small talk", () => {
    expect(extractTopics("I have an exam tomorrow and I'm nervous", 0).map((t) => t.phrase)).toEqual(expect.arrayContaining(["your exam", "nervous"]));
    expect(extractTopics("my dog is sick", 0).map((t) => t.phrase)).toEqual(expect.arrayContaining(["your dog"]));
    expect(extractTopics("I'm going to visit my grandma tomorrow", 0).map((t) => t.phrase)).toEqual(expect.arrayContaining(["your grandma"]));
    expect(extractTopics("I'm going to bake a cake tonight", 0).some((t) => t.kind === "plan")).toBe(true);
    expect(extractTopics("the weather is nice", 0)).toEqual([]);
    expect(extractTopics("what time is it", 0)).toEqual([]);
    expect(extractTopics("I'm going to sleep", 0).some((t) => t.kind === "plan")).toBe(false);
  });
  it("asks later, not at once, only once, and not too often", () => {
    const tm = new TopicMemory(); tm.learn("I have an exam tomorrow", 1000); tm.learn("my dog is sick", 2000);
    expect(tm.due(60000)).toBeNull();                          // too soon
    const d = tm.due(5 * 60000)!; expect(d).toBeTruthy();
    const q = tm.question(d, mulberry(1)); expect(q.length).toBeGreaterThan(10); expect(q).toMatch(/dog|exam/);
    tm.markAsked(d, 5 * 60000);
    expect(tm.due(5 * 60000 + 30000)).toBeNull();              // spacing
    const d2 = tm.due(9 * 60000)!; expect(d2.id).not.toBe(d.id);
    tm.markAsked(d2, 9 * 60000);
    expect(tm.due(30 * 60000)).toBeNull();                     // all asked
    expect(new TopicMemory([{ id: "x", kind: "event", phrase: "your exam", text: "", at: 0 }]).due(10 * 86400000)).toBeNull(); // too old
  });
  it("re-telling updates instead of duplicating, and the list is capped", () => {
    const tm = new TopicMemory(); tm.learn("I have an exam", 1); tm.learn("my exam is hard", 2); expect(tm.items.filter((x) => x.phrase === "your exam").length).toBe(1);
    for (let i = 0; i < 30; i++) tm.learn(`my ${["dog", "cat", "boss", "friend", "sister"][i % 5]}`, i + 10);
    expect(tm.items.length).toBeLessThanOrEqual(12);
  });
});

describe("curiosity and answers", () => {
  it("asks about what he does not know, never twice, then stops", () => {
    const asked: string[] = []; const facts: Record<string, string> = { "favorite color": "blue" };
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) { const q = curiosityQuestion(facts, asked, mulberry(i + 1)); if (!q) break; expect(q.key).not.toBe("favorite color"); expect(seen.has(q.key)).toBe(false); seen.add(q.key); asked.push(q.key); }
    expect(seen.size).toBe(4);
    expect(curiosityQuestion(facts, asked, mulberry(1))).toBeNull();
  });
  it("reads short answers and rejects non-answers", () => {
    expect(readAnswer("blue", "favorite color")).toBe("blue");
    expect(readAnswer("it's pizza", "favorite food")).toBe("pizza");
    expect(readAnswer("I like painting", "likes")).toBe("painting");
    expect(readAnswer("I'm from Pune.", "home")).toBe("Pune");
    expect(readAnswer("no idea", "x")).toBeNull();
    expect(readAnswer("why do you ask?", "x")).toBeNull();
    expect(readAnswer("well that is a very long story about my life and many things", "x")).toBeNull();
    expect(readAnswer("", "x")).toBeNull();
  });
});

describe("conversation polish", () => {
  it("acknowledges statements, not questions or commands", () => {
    expect(isStatement("I went to the market and bought some fruit")).toBe(true);
    expect(isStatement("what is the time right now")).toBe(false);
    expect(isStatement("walk forward a little bit please")).toBe(false);
    expect(isStatement("ok")).toBe(false);
    expect(backchannel("I failed my test and I feel awful", mulberry(1))).toMatch(/Oh no|rough|sorry|hard/i);
    expect(backchannel("I won the match today and I'm happy", mulberry(1))).toMatch(/nice|great|really|good/i);
    expect(backchannel("I walked to the shop and came back", mulberry(1)).length).toBeGreaterThan(2);
  });
  it("hedges only sometimes and never twice", () => {
    const r = mulberry(2); let hedged = 0; for (let i = 0; i < 200; i++) if (hedge("It is blue.", r) !== "It is blue.") hedged++;
    expect(hedged).toBeGreaterThan(15); expect(hedged).toBeLessThan(70);
    expect(hedge("Hmm, I think so.", () => 0)).toBe("Hmm, I think so.");
    expect(hedge("", () => 0)).toBe("");
  });
  it("quirk is subtle, consistent per id, and each one produces valid text", () => {
    for (const q of QUIRKS) { const out = q.apply("That is nice.", () => 0.1); expect(out.length).toBeGreaterThan(5); expect(out).not.toContain("undefined"); expect(out).not.toContain("$1"); }
    const r = mulberry(3); let n = 0; for (let i = 0; i < 400; i++) if (applyQuirk("Hello there.", "beep", r) !== "Hello there.") n++;
    expect(n).toBeGreaterThan(20); expect(n).toBeLessThan(90);
    expect(applyQuirk("Hello there.", undefined, () => 0)).toBe("Hello there.");
    expect(applyQuirk("x".repeat(200), "beep", () => 0)).toBe("x".repeat(200));
    expect(QUIRKS.map((q) => q.id)).toContain(pickQuirk(mulberry(1)));
  });
  it("only jokes with someone he trusts", () => {
    expect(callback({ name: "Asha", trust: 0.2 }, mulberry(1))).toBeNull();
    expect(callback({ name: "Asha", trust: 0.8 }, mulberry(1))).toContain("Asha");
    expect(callback({ trust: 0.9 }, mulberry(1))).toBeNull();
  });
});

describe("moods", () => {
  it("explains the strongest recent cause, in the right direction, and forgets old ones", () => {
    const log = new MoodLog(); log.add("you scolded me", -0.4, 1000); log.add("you praised me", 0.3, 2000); log.add("tiny thing", 0.01, 3000);
    expect(log.cause(5000, -1)).toBe("you scolded me"); expect(log.cause(5000, 1)).toBe("you praised me");
    expect(log.cause(5000 + 25 * 60000, -1)).toBeNull();
    expect(explainMood("sad", -0.5, "you scolded me", null, mulberry(1))).toMatch(/scolded/i);
    expect(explainMood("sad", -0.5, null, null, mulberry(1))).toMatch(/not sure why/);
    expect(explainMood("happy", 0.6, null, "I slept really well", mulberry(1))).toMatch(/slept/i);
    expect(explainMood("calm", 0, null, null, mulberry(1))).toMatch(/okay/i);
  });
  it("days have different tones, mostly near neutral, with a reason when it is strong", () => {
    const r = mulberry(11); const tones: number[] = []; let withCause = 0;
    for (let i = 0; i < 500; i++) { const d = dayTone(r); tones.push(d.tone); if (d.cause) { withCause++; expect(Math.abs(d.tone)).toBeGreaterThan(0.09); } expect(Math.abs(d.tone)).toBeLessThanOrEqual(0.25); }
    expect(Math.max(...tones)).toBeGreaterThan(0.1); expect(Math.min(...tones)).toBeLessThan(-0.1);
    expect(withCause).toBeGreaterThan(30); expect(withCause).toBeLessThan(350);
  });
  it("reunions grow with the time away, and warmth matters", () => {
    expect(reunion(60000, 0.9, "Asha", mulberry(1))).toBeNull();
    expect(reunion(10 * 60000, 0.9, "Asha", mulberry(1))).toMatch(/back|there you are/i);
    expect(reunion(3600000, 0.8, "Asha", mulberry(1))).toMatch(/miss|long|wonder|Finally/i);
    expect(reunion(3600000, 0.1, undefined, mulberry(1))).not.toMatch(/miss/i);
  });
});
