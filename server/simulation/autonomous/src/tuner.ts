// Offline tuner for the autonomous mind's score weights. No online training: it reads a decision log (mindlog.ts),
// and searches for per-part multipliers (1 = the hand-tuned original) with a simple (1+lambda) evolution strategy.
//
// Objective: self-normalised, clipped importance-sampled average reward of the softmax policy the new weights would
// give, using only logged choices that came from the scored softmax ("scored"), minus a small pull towards 1.
// A hold-out split guards against over-fitting: weights are only accepted if they also beat 1.0 on unseen rows.
import type { MindTick } from "./mindlog.js";

export interface TuneOpts { gens?: number; pop?: number; sigma?: number; lambda?: number; wMin?: number; wMax?: number; clip?: number; holdout?: number; seed?: number; minRows?: number; minEss?: number; minEssValid?: number; locked?: string[] }
export interface TuneResult { accepted: boolean; reason: string; weights: Record<string, number>; rows: number; train: { base: number; tuned: number; ess: number }; valid: { base: number; tuned: number; ess: number }; labels: string[] }

/** Safety parts are never tuned: a simulated log rarely shows why they matter, so the search must not switch them off. */
export const LOCKED = ["battery", "pain"];

export function parseJSONL(text: string): MindTick[] {
  const out: MindTick[] = [];
  for (const line of text.split(/\r?\n/)) { const s = line.trim(); if (!s) continue; try { const t = JSON.parse(s) as MindTick; if (t && t.actions && t.chosen) out.push(t); } catch { /* skip bad line */ } }
  return out;
}

export function usable(ticks: MindTick[]): MindTick[] {
  return ticks.filter((t) => t.src === "scored" && Number.isFinite(t.reward) && t.pLog > 0 && t.actions[t.chosen] && Object.keys(t.actions).length > 1);
}

export function labelsOf(ticks: MindTick[]): string[] {
  const s = new Set<string>(); for (const t of ticks) for (const a of Object.values(t.actions)) for (const k of Object.keys(a)) s.add(k);
  return [...s].sort();
}

/** Probability the weighted policy gives the chosen action. */
export function policyProb(t: MindTick, w: Record<string, number>): number {
  const names = Object.keys(t.actions); const T = t.temp > 0 ? t.temp : 0.15;
  const u = names.map((a) => { let x = 0; for (const [k, v] of Object.entries(t.actions[a])) x += (w[k] ?? 1) * v; return x; });
  const m = Math.max(...u); const e = u.map((x) => Math.exp((x - m) / T)); const tot = e.reduce((p, q) => p + q, 0) || 1;
  return e[names.indexOf(t.chosen)] / tot;
}

export function evaluate(rows: MindTick[], w: Record<string, number>, clip = 5): { value: number; ess: number } {
  let num = 0, den = 0, den2 = 0;
  for (const t of rows) { const ratio = Math.min(clip, policyProb(t, w) / t.pLog); num += ratio * (t.reward as number); den += ratio; den2 += ratio * ratio; }
  return { value: den > 0 ? num / den : 0, ess: den2 > 0 ? (den * den) / den2 : 0 };
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

export function tune(all: MindTick[], o: TuneOpts = {}): TuneResult {
  const { gens = 80, pop = 24, sigma: s0 = 0.25, lambda = 0.05, wMin = 0, wMax = 3, clip = 5, holdout = 0.25, seed = 1, minRows = 200, minEss = 0.3, minEssValid = 0.2, locked = LOCKED } = o;
  const rows = usable(all); const labels = labelsOf(rows); const ones: Record<string, number> = {}; for (const l of labels) ones[l] = 1;
  const none = { base: 0, tuned: 0, ess: 0 };
  if (rows.length < minRows) return { accepted: false, reason: `only ${rows.length} usable rows, need at least ${minRows}`, weights: ones, rows: rows.length, train: none, valid: none, labels };
  const nVal = Math.floor(rows.length * holdout), train = rows.slice(0, rows.length - nVal), valid = rows.slice(rows.length - nVal);
  const R = rng(seed);
  const fit = (w: Record<string, number>) => { const e = evaluate(train, w, clip); let pen = 0; for (const l of labels) pen += (w[l] - 1) ** 2; pen /= Math.max(1, labels.length); const ok = e.ess >= minEss * train.length; return { f: ok ? e.value - lambda * pen : -Infinity, ...e }; };
  let best = { ...ones }, bf = fit(best), sigma = s0;
  for (let g = 0; g < gens; g++) {
    let improved = false;
    for (let i = 0; i < pop; i++) {
      const c: Record<string, number> = {};
      for (const l of labels) c[l] = locked.includes(l) ? 1 : Math.min(wMax, Math.max(wMin, best[l] + (R() < 0.4 ? sigma * gauss(R) : 0)));
      const cf = fit(c); if (cf.f > bf.f) { best = c; bf = cf; improved = true; }
    }
    sigma = improved ? Math.min(s0, sigma * 1.1) : sigma * 0.8;
  }
  for (const l of labels) best[l] = Math.round(best[l] * 1000) / 1000;
  const tb = evaluate(train, ones, clip), tt = evaluate(train, best, clip), vb = evaluate(valid, ones, clip), vt = evaluate(valid, best, clip);
  const train_ = { base: tb.value, tuned: tt.value, ess: tt.ess }, valid_ = { base: vb.value, tuned: vt.value, ess: vt.ess };
  const margin = 0.002;
  const accepted = vt.value > vb.value + margin && vt.ess >= minEssValid * valid.length;
  return { accepted, reason: accepted ? "better on held-out rows" : "no reliable improvement on held-out rows, keeping the hand-tuned weights", weights: accepted ? best : ones, rows: rows.length, train: train_, valid: valid_, labels };
}
