// Offline tuner CLI.  Usage: npx tsx scripts/tune-mind.ts <log.jsonl> [weights.json]
// Reads a decision log, searches for better score weights, and writes weights.json ONLY if they also beat the
// hand-tuned weights on held-out rows. Load the file in the simulator (Lab > Mind > Load weights) or put it next to index.html.
import { readFileSync, writeFileSync } from "node:fs";
import { parseJSONL, tune } from "../simulation/autonomous/src/tuner";

const [inp, out = "weights.json"] = process.argv.slice(2);
if (!inp) { console.error("usage: tune-mind.ts <log.jsonl> [weights.json]"); process.exit(2); }
const r = tune(parseJSONL(readFileSync(inp, "utf8")));
const f = (x: number) => x.toFixed(4);
console.log(`usable rows: ${r.rows}\ntrain  avg reward  hand-tuned ${f(r.train.base)}  tuned ${f(r.train.tuned)}\nheld-out       hand-tuned ${f(r.valid.base)}  tuned ${f(r.valid.tuned)}  (effective sample ${r.valid.ess.toFixed(0)})\n=> ${r.accepted ? "ACCEPTED" : "NOT accepted"}: ${r.reason}`);
if (r.accepted) { writeFileSync(out, JSON.stringify(r.weights, null, 2) + "\n"); console.log("changed parts:"); for (const [k, v] of Object.entries(r.weights)) if (Math.abs(v - 1) > 0.05) console.log(`  ${k}: x${v}`); console.log("wrote", out); }
