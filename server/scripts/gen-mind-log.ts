// Simulated sessions -> decision log (JSONL) for the offline tuner. Simulation only; no hardware code is touched.
// Usage: npx tsx scripts/gen-mind-log.ts <out.jsonl> [days=6] [seed=1]
import { writeFileSync } from "node:fs";
import { Brain, type Body } from "../simulation/autonomous/src/brain";

const out = process.argv[2] ?? "mind-log.jsonl", days = Number(process.argv[3] ?? 6), seed = Number(process.argv[4] ?? 1);
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(seed);
Math.random = rnd; // the brain uses Math.random for its softmax and wording: seed it so runs repeat

let t = 1_000_000, present = false;
const body: Body = {
  act: async () => {}, isBusy: () => false,
  getPose: () => ({ x: 0, z: 0, unit: 1, headingDeg: 0 }),
  getWorld: () => [{ id: "toy_red_ball", kind: "toy", x: 5, z: 5, color: "red" }],
};
const brain = new Brain(body, { now: () => t, getSenses: () => ({ motion: 0, brightness: 0.5, loudness: 0, camera: false, mic: false, personPresent: present }) });
brain.mindLog.max = 200000;
const stim = ["praise", "poke", "loud_noise", "gift", "ignored"] as const;

(async () => {
  const secs = days * 24 * 60; // one tick = one second; the brain's own clock makes a "day" 24*60 s here, as in the tests
  for (let i = 0; i < secs; i++) {
    t += 1000;
    // varied company: some long lonely stretches, some visits, an occasional kind or rude event
    if (i % 400 === 0) present = rnd() < 0.5;
    if (i % 137 === 0 && rnd() < 0.5) brain.stimulus(stim[Math.floor(rnd() * stim.length)] as any);
    if (present && i % 211 === 0 && rnd() < 0.5) brain.hear(["hello", "you are a good friend", "let's play", "that was great"][Math.floor(rnd() * 4)]);
    brain.tick();
    await new Promise((r) => setImmediate(r));
  }
  writeFileSync(out, brain.mindLog.toJSONL());
  console.log(JSON.stringify(brain.mindLog.count()), "->", out);
})();
