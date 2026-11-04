// Pure face-matching logic (no camera, no DOM, no models), so it can be tested with made-up fingerprints.
//
// Two things beyond a plain "closest fingerprint under a threshold":
//  - embedding cache: each person's unit-length average and samples are computed once and reused until that person changes;
//  - decaying re-identification: someone who was recognised a moment ago, and whose face is where it was, is allowed a looser
//    threshold. The extra slack fades with time since they were last confidently seen, so a person does not flicker
//    to "person" when they turn their head, but a stranger arriving later is held to the strict threshold.

export interface FaceBox { x: number; y: number; w: number; h: number }
export interface StoredPerson { name: string; descriptors: number[][]; hits: number; updatedAt: number }
export interface Candidate { name: string; distance: number; threshold: number }
export interface MatchResult {
  name: string | null; distance: number; threshold: number;
  /** "enrolled" = under the normal threshold, "recent" = only passed thanks to the re-identification slack, "none" = nobody */
  reason: "enrolled" | "recent" | "none";
  candidates: Candidate[];
}
export interface MatchOpts { base?: number; extra?: number; tauMs?: number; maxMoveFrac?: number }

const unit = (v: ArrayLike<number>): Float32Array => { let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n; return o; };
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
export const cosineDist = (a: ArrayLike<number>, b: ArrayLike<number>) => 1 - dot(unit(a), unit(b));
/** Short stable label for a fingerprint, for the debug overlay (not secret, not reversible). */
export function fingerprint(d: ArrayLike<number>): string { let h = 2166136261; for (let i = 0; i < d.length; i++) { h ^= Math.round(d[i] * 1000) & 0xffff; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

interface Cached { key: string; mean: Float32Array; units: Float32Array[] }
interface Seen { at: number; cx: number; cy: number }

export class IdentityIndex {
  private cache = new WeakMap<StoredPerson, Cached>();
  private seen = new Map<string, Seen>();
  cacheBuilds = 0; // how many times a person's cache was (re)built: lets tests prove the cache is reused
  base: number; extra: number; tauMs: number; maxMove: number;
  constructor(o: MatchOpts = {}) { this.base = o.base ?? 0.48; this.extra = o.extra ?? 0.12; this.tauMs = o.tauMs ?? 8000; this.maxMove = o.maxMoveFrac ?? 0.25; }

  private entry(p: StoredPerson): Cached {
    const key = `${p.descriptors.length}:${p.updatedAt}`; const c = this.cache.get(p);
    if (c && c.key === key) return c;
    const units = p.descriptors.map(unit); const dim = units[0]?.length ?? 128; const m = new Float32Array(dim);
    for (const u of units) for (let i = 0; i < dim; i++) m[i] += u[i];
    const built = { key, mean: unit(m), units }; this.cache.set(p, built); this.cacheBuilds++; return built;
  }

  /** The extra slack this person gets right now: full just after a confident sighting nearby, fading to zero. */
  slack(name: string, now: number, box?: FaceBox): number {
    const s = this.seen.get(name); if (!s || !box) return 0;
    const dx = box.x + box.w / 2 - s.cx, dy = box.y + box.h / 2 - s.cy;
    if (Math.hypot(dx, dy) > this.maxMove) return 0;           // a different place: treat as a new arrival
    const age = Math.max(0, now - s.at);
    return this.extra * Math.exp(-age / this.tauMs);
  }

  match(desc: ArrayLike<number>, people: StoredPerson[], now: number, box?: FaceBox): MatchResult {
    const d = unit(desc); const cands: Candidate[] = [];
    for (const p of people) {
      if (!p.descriptors.length) continue;
      const c = this.entry(p); let best = 1 - dot(d, c.mean);
      for (const u of c.units) best = Math.min(best, 1 - dot(d, u));
      cands.push({ name: p.name, distance: best, threshold: this.base + this.slack(p.name, now, box) });
    }
    cands.sort((a, b) => (a.distance - a.threshold) - (b.distance - b.threshold));
    const top = cands[0];
    const out = cands.slice(0, 3);
    if (!top) return { name: null, distance: Infinity, threshold: this.base, reason: "none", candidates: out };
    if (top.distance <= top.threshold) {
      const reason = top.distance <= this.base ? "enrolled" : "recent";
      return { name: top.name, distance: top.distance, threshold: top.threshold, reason, candidates: out };
    }
    const nearest = [...cands].sort((a, b) => a.distance - b.distance)[0];
    return { name: null, distance: nearest.distance, threshold: this.base, reason: "none", candidates: out };
  }

  /** Remember where and when someone was confidently recognised (distance well under the strict threshold). */
  confirm(name: string, now: number, box: FaceBox, distance: number) {
    if (distance <= this.base * 0.85) this.seen.set(name, { at: now, cx: box.x + box.w / 2, cy: box.y + box.h / 2 });
    else if (this.seen.has(name)) { const s = this.seen.get(name)!; this.seen.set(name, { at: s.at, cx: box.x + box.w / 2, cy: box.y + box.h / 2 }); } // follow the face, but do not refresh the clock
  }
  forget(name?: string) { if (name) this.seen.delete(name); else this.seen.clear(); }
}
