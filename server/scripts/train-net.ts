// Step 4: train a small net offline from a decision log.  Usage: npx tsx scripts/train-net.ts <log.jsonl> [net.json]
// Reward-weighted behaviour cloning on top of the hand-tuned score; the net is written only if it also wins on held-out rows.
// Load it in the simulator: Lab > Mind > Learning log > Load net... (it is an extra additive term, off until loaded and switched on).
import { readFileSync, writeFileSync } from "node:fs";
import { parseJSONL } from "../simulation/autonomous/src/tuner";
import { trainNet } from "../simulation/autonomous/src/residual";

const [inp, out = "net.json"] = process.argv.slice(2);
if (!inp) { console.error("usage: train-net.ts <log.jsonl> [net.json]"); process.exit(2); }
const r = trainNet(parseJSONL(readFileSync(inp, "utf8")));
const f = (x: number) => x.toFixed(4);
console.log(`usable rows: ${r.rows}\nheld-out loss   hand-tuned alone ${f(r.baselineLoss)}   with net ${f(r.validLoss)}   (train ${f(r.trainLoss)})\nheld-out top-1 agreement with what he really did: hand-tuned ${(r.baselineTop1 * 100).toFixed(1)}%  with net ${(r.validTop1 * 100).toFixed(1)}%\n=> ${r.accepted ? "ACCEPTED" : "NOT accepted"}: ${r.reason}`);
if (r.accepted && r.net) { writeFileSync(out, JSON.stringify(r.net) + "\n"); console.log("wrote", out); }
