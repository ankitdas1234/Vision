import { describe, it, expect } from "vitest";
import { soundSide, soundLine, JEALOUS_RX, jealousLine, trailOff, fadeFacts, forgotQuestion, checkMilestones, Overload, SORRY_RX, type LifeStats } from "../../../simulation/autonomous/src/natural";

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DAY = 86400000;

describe("sound direction", () => {
  it("names the side a sound came from", () => {
    expect(soundSide(0)).toBe("in front of me"); expect(soundSide(90)).toBe("on my right"); expect(soundSide(-90)).toBe("on my left");
    expect(soundSide(180)).toBe("behind me"); expect(soundSide(-170)).toBe("behind me"); expect(soundSide(450)).toBe("on my right");
    expect(soundLine(90, mulberry(1))).toMatch(/right/);
  });
});
describe("jealousy", () => {
  it("notices talk of someone else, more when close", () => {
    expect(JEALOUS_RX.test("I cleaned the robot vacuum")).toBe(false);
    expect(JEALOUS_RX.test("I like alexa more")).toBe(true);
    expect(JEALOUS_RX.test("my new assistant is great")).toBe(true);
    expect(jealousLine(0.9, mulberry(2))).toMatch(/jealous|better|stings|see/i);
    expect(jealousLine(0.1, mulberry(2))).not.toMatch(/jealous/i);
  });
});
describe("trailing off", () => {
  it("cuts long lines, leaves short ones", () => {
    expect(trailOff("Sure.", mulberry(1))).toBe("Sure.");
    const long = "Well I was thinking that we could go over to the other side of the room and look at the crate for a while";
    const out = trailOff(long, mulberry(3)); expect(out.length).toBeLessThan(long.length + 40); expect(out).toMatch(/\.\.\./);
    expect(out.startsWith("Well I was")).toBe(true);
  });
});
describe("forgetting", () => {
  it("fresh facts stay; old unrepeated ones eventually fade; asks again", () => {
    const facts = { "favorite color": "blue", home: "Pune" }; const now = 100 * DAY;
    expect(fadeFacts(facts, { "favorite color": now - DAY, home: now - 2 * DAY }, now, mulberry(1))).toEqual([]);
    let gone = 0; for (let i = 0; i < 40; i++) gone += fadeFacts(facts, { "favorite color": now - 30 * DAY, home: now - DAY }, now, mulberry(i + 5)).includes("favorite color") ? 1 : 0;
    expect(gone).toBeGreaterThan(5); expect(gone).toBeLessThan(40);
    expect(fadeFacts(facts, { home: now - DAY }, now, () => 0).includes("home")).toBe(false);
    expect(forgotQuestion("favorite color", mulberry(1))).toMatch(/colou?r/i);
  });
});
describe("life events", () => {
  const base: LifeStats = { interactions: 0, scolds: 0, praises: 0, gifts: 0, noises: 0, maxTrust: 0.4, longAbsences: 0, days: 0 };
  it("changes personality once, permanently, and only when reached", () => {
    const b5: Record<string, number> = { curious: 0.5, sociable: 0.5, calm: 0.5, bold: 0.5, agreeable: 0.5 }; const done: Record<string, number> = {};
    expect(checkMilestones(base, done, b5, 1)).toEqual([]);
    const hit = checkMilestones({ ...base, scolds: 7, noises: 20 }, done, b5, 2);
    expect(hit.map((m) => m.id).sort()).toEqual(["rough_patch", "thick_skin"]);
    expect(b5.bold).toBeCloseTo(0.5 - 0.06 + 0.03, 5); expect(b5.calm).toBeCloseTo(0.5 - 0.05 + 0.06, 5);
    expect(checkMilestones({ ...base, scolds: 9 }, done, b5, 3)).toEqual([]); // not again
    for (const k of Object.keys(b5)) { expect(b5[k]).toBeGreaterThanOrEqual(0); expect(b5[k]).toBeLessThanOrEqual(1); }
  });
});
describe("overload", () => {
  it("builds with pokes and cools over time", () => {
    const o = new Overload(); o.add(0.4, 0); o.add(0.4, 1000); o.add(0.4, 2000);
    expect(o.get(2000)).toBeGreaterThan(1); expect(o.get(2000 + 200_000)).toBe(0);
    expect(SORRY_RX.test("sorry, take your time")).toBe(true); expect(SORRY_RX.test("poke poke")).toBe(false);
  });
});
