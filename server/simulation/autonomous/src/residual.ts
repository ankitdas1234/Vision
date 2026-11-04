// Steps 3 and 4 of the mind's learning, both ADDITIVE and OFF by default (original behaviour is untouched until you turn them on).
//
// OnlineResidual (step 3): a tiny linear layer per action, score_adj(a) = w[a] . features(state). After each action finishes it nudges
//   the weights with a small step towards (reward - what it predicted), like a one-step bandit with a linear model.
//   Very stable by construction: small learning rate, L2 pull back to zero, every weight and the final adjustment are clipped.
// NetPolicy (step 4): a small neural net (state -> one score per action) trained OFFLINE on the decision log with reward-weighted
//   behaviour cloning + reward regression (tuner side: trainer.ts). At run time it is only a fixed additive term.
import type { MindTick } from "./mindlog.js";

export const FEATURES = ["curiosity", "social", "boredom", "valence", "arousal", "fatigue", "present", "sleepiness"] as const;
export const ACTION_NAMES = ["wander", "look_around", "dance", "rest", "call_out", "murmur", "go_home", "play", "watch"] as const;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const featuresOf = (s: Record<string, number>): number[] => [1, ...FEATURES.map((k) => s[k] ?? 0)];

export interface ResidualState { w: Record<string, number[]> }

export class OnlineResidual {
  w: Record<string, number[]> = {};
  enabled = false;
  constructor(public lr = 0.03, public l2 = 0.002, public maxW = 0.6, public maxAdj = 0.25) {}
  adj(action: string, state: Record<string, number>): number {
    if (!this.enabled) return 0;
    const w = this.w[action]; if (!w) return 0;
    const f = featuresOf(state); let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i];
    return clamp(s, -this.maxAdj, this.maxAdj);
  }
  /** One learning step. `reward` is the same outcome signal the rest of the mind learns from. */
  learn(action: string, state: Record<string, number>, reward: number) {
    if (!Number.isFinite(reward)) return;
    const f = featuresOf(state); const w = (this.w[action] ??= new Array(f.length).fill(0));
    let pred = 0; for (let i = 0; i < f.length; i++) pred += w[i] * f[i];
    const err = clamp(reward, -1, 1) - pred;
    for (let i = 0; i < f.length; i++) w[i] = clamp(w[i] * (1 - this.l2) + this.lr * err * f[i], -this.maxW, this.maxW);
  }
  reset() { this.w = {}; }
  toJSON(): ResidualState { return { w: this.w }; }
  load(s: Partial<ResidualState> | null | undefined) { this.w = {}; for (const [k, v] of Object.entries(s?.w ?? {})) if (Array.isArray(v) && v.every((x) => Number.isFinite(x))) this.w[k] = v.map((x) => clamp(x, -this.maxW, this.maxW)); }
}

// ---------- step 4: a small MLP, trained offline, used as a fixed additive term
export interface NetJSON { v: 1; features: string[]; actions: string[]; hidden: number; W1: number[][]; b1: number[]; W2: number[][]; b2: number[]; scale: number }

export class NetPolicy {
  enabled = false; weight = 1; // how strongly the net's scores are added to the mind's own
  net: NetJSON | null = null;
  load(n: NetJSON | null | undefined): boolean {
    this.net = null; if (!n || n.v !== 1 || !Array.isArray(n.W1) || !Array.isArray(n.W2)) return false;
    const ok = n.W1.length === n.hidden && n.W1.every((r) => r.length === FEATURES.length) && n.W2.length === n.actions.length && n.W2.every((r) => r.length === n.hidden) && [...n.b1, ...n.b2].every(Number.isFinite) && n.W1.flat().every(Number.isFinite) && n.W2.flat().every(Number.isFinite);
    if (!ok) return false; this.net = n; return true;
  }
  /** score for every action the net knows, from the state vector */
  scores(state: Record<string, number>): Record<string, number> {
    const n = this.net; const out: Record<string, number> = {}; if (!n) return out;
    const x = FEATURES.map((k) => state[k] ?? 0);
    const h = n.b1.map((b, j) => { let s = b; for (let i = 0; i < x.length; i++) s += n.W1[j][i] * x[i]; return Math.tanh(s); });
    n.actions.forEach((a, k) => { let s = n.b2[k]; for (let j = 0; j < h.length; j++) s += n.W2[k][j] * h[j]; out[a] = clamp(s * n.scale, -0.5, 0.5); });
    return out;
  }
  adj(action: string, state: Record<string, number>): number { return this.enabled && this.net ? this.weight * (this.scores(state)[action] ?? 0) : 0; }
}

// ---------- offline trainer (used by server/scripts/train-net.ts and the tests; no dependencies)
export interface TrainOpts { hidden?: number; epochs?: number; lr?: number; seed?: number; holdout?: number; temp?: number; l2?: number; minRows?: number }
export interface TrainResult { net: NetJSON | null; accepted: boolean; reason: string; rows: number; trainLoss: number; validLoss: number; baselineLoss: number; validTop1: number; baselineTop1: number }

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Reward-weighted behaviour cloning. Target for each row: the action he took, weighted by advantage = reward - mean reward of that action
 * (clamped >= 0): he copies his own choices that turned out better than usual, and ignores the ones that turned out worse.
 * Loss = advantage-weighted cross-entropy of softmax(net(state)) on the taken action. Held-out rows decide whether the net is kept.
 */
export function trainNet(rows: MindTick[], o: TrainOpts = {}): TrainResult {
  const { hidden = 12, epochs = 60, lr = 0.05, seed = 1, holdout = 0.25, temp = 0.3, l2 = 1e-4, minRows = 300 } = o;
  const used = rows.filter((t) => t.src === "scored" && Number.isFinite(t.reward) && (ACTION_NAMES as readonly string[]).includes(t.chosen));
  const fail = (reason: string): TrainResult => ({ net: null, accepted: false, reason, rows: used.length, trainLoss: 0, validLoss: 0, baselineLoss: 0, validTop1: 0, baselineTop1: 0 });
  if (used.length < minRows) return fail(`only ${used.length} usable rows, need at least ${minRows}`);
  const nVal = Math.floor(used.length * holdout), train = used.slice(0, used.length - nVal), valid = used.slice(used.length - nVal);
  const acts = [...ACTION_NAMES] as string[], A = acts.length, F = FEATURES.length;
  const meanBy: Record<string, number> = {}, cnt: Record<string, number> = {};
  for (const t of train) { meanBy[t.chosen] = (meanBy[t.chosen] ?? 0) + (t.reward as number); cnt[t.chosen] = (cnt[t.chosen] ?? 0) + 1; }
  for (const a of acts) meanBy[a] = cnt[a] ? meanBy[a] / cnt[a] : 0;
  const adv = (t: MindTick) => Math.max(0, (t.reward as number) - meanBy[t.chosen]) + 0.02; // small floor so every row still teaches a little
  // the mind's own scores as the baseline "logit" (hand-tuned total, logged raw parts summed) so the net learns a RESIDUAL
  const base = (t: MindTick) => acts.map((a) => { const p = t.actions[a]; if (!p) return -1e3; let s = 0; for (const v of Object.values(p)) s += v; return s; });
  const R = rng(seed), sc = 0.3;
  const W1 = Array.from({ length: hidden }, () => Array.from({ length: F }, () => (R() - 0.5) * sc)), b1 = new Array(hidden).fill(0);
  const W2 = Array.from({ length: A }, () => Array.from({ length: hidden }, () => (R() - 0.5) * sc * 0.2)), b2 = new Array(A).fill(0);
  const fwd = (x: number[]) => { const h = b1.map((b, j) => { let s = b; for (let i = 0; i < F; i++) s += W1[j][i] * x[i]; return Math.tanh(s); }); const z = b2.map((b, k) => { let s = b; for (let j = 0; j < hidden; j++) s += W2[k][j] * h[j]; return s; }); return { h, z }; };
  const probs = (t: MindTick, z: number[]) => { const bs = base(t); const u = bs.map((b, k) => b + clamp(z[k], -0.5, 0.5)); const m = Math.max(...u); const e = u.map((v) => Math.exp((v - m) / temp)); const s = e.reduce((p, q) => p + q, 0); return e.map((v) => v / s); };
  const xs = (t: MindTick) => FEATURES.map((k) => t.state[k] ?? 0);
  const loss = (rs: MindTick[], useNet: boolean) => { let l = 0, w = 0, hit = 0; for (const t of rs) { const k = acts.indexOf(t.chosen); const z = useNet ? fwd(xs(t)).z : new Array(A).fill(0); const p = probs(t, z); const a = adv(t); l += -a * Math.log(Math.max(1e-9, p[k])); w += a; if (p.indexOf(Math.max(...p)) === k) hit++; } return { loss: l / Math.max(1e-9, w), top1: hit / Math.max(1, rs.length) }; };
  for (let ep = 0; ep < epochs; ep++) {
    const order = train.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const idx of order) {
      const t = train[idx], x = xs(t), { h, z } = fwd(x), p = probs(t, z), k = acts.indexOf(t.chosen), a = adv(t);
      const dz = p.map((v, q) => a * (v - (q === k ? 1 : 0)) / temp * (Math.abs(z[q]) < 0.5 ? 1 : 0)); // clamp zeroes the gradient outside +-0.5
      const dh = new Array(hidden).fill(0);
      for (let q = 0; q < A; q++) { for (let j = 0; j < hidden; j++) { dh[j] += dz[q] * W2[q][j]; W2[q][j] -= lr * (dz[q] * h[j] + l2 * W2[q][j]); } b2[q] -= lr * dz[q]; }
      for (let j = 0; j < hidden; j++) { const g = dh[j] * (1 - h[j] * h[j]); for (let i = 0; i < F; i++) W1[j][i] -= lr * (g * x[i] + l2 * W1[j][i]); b1[j] -= lr * g; }
    }
  }
  const tr = loss(train, true), va = loss(valid, true), vb = loss(valid, false);
  const net: NetJSON = { v: 1, features: [...FEATURES], actions: acts, hidden, W1, b1, W2, b2, scale: 1 };
  const accepted = va.loss < vb.loss - 0.005;
  return { net: accepted ? net : null, accepted, reason: accepted ? "lower held-out loss than the hand-tuned mind alone" : "no reliable improvement on held-out rows, keeping the hand-tuned mind", rows: used.length, trainLoss: tr.loss, validLoss: va.loss, baselineLoss: vb.loss, validTop1: va.top1, baselineTop1: vb.top1 };
}
