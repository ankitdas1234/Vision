/**
 * Face identity: who is in the picture. The model is a swappable backend (faceBackend.ts; default face-api via CDN),
 * matching is in faceMatch.ts (cached fingerprints + a re-identification slack that fades with time).
 * Fingerprints of enrolled people are kept in localStorage. If the model fails to load, callers fall back to the
 * lightweight signature path.
 */
import { createBackend, availableBackends, type FaceBackend, type RawFace } from "./faceBackend.js";
import "./faceApiBackend.js"; // registers "faceapi"
import "./humanBackend.js";   // registers "human" (blazeface + faceres)
import { IdentityIndex, fingerprint, type Candidate, type FaceBox, type StoredPerson, type MatchOpts } from "./faceMatch.js";

const STORE_KEY = "vision.faceEmbeddings.v1";
const BACKEND_KEY = "vision.faceBackend.v1";

export interface FaceDebug { fingerprint: string; reason: "enrolled" | "recent" | "none"; threshold: number; candidates: Candidate[]; backend: string; ms: number; slack: number }
export interface FaceHit {
  name: string;
  distance: number;
  box: FaceBox; // normalized 0..1 in video space
  cx: number;
  cy: number;
  /** the face fingerprint, so callers can enrol it without a second detection */
  descriptor: number[];
  score: number;
  debug?: FaceDebug;
}
export interface FaceIdOptions { backend?: FaceBackend; now?: () => number; match?: MatchOpts; store?: boolean }

export class FaceId {
  private people: StoredPerson[] = [];
  private impl: FaceBackend;
  private index: IdentityIndex;
  private matchOpts?: MatchOpts;
  /** ?facethr=0.35 in the page address overrides the model's threshold (for calibrating) */
  private opts(): MatchOpts { let thr: number | undefined; try { const v = new URLSearchParams(location.search).get("facethr"); if (v && +v > 0) thr = +v; } catch { /* no window */ } return { ...this.matchOpts, base: thr ?? this.matchOpts?.base ?? this.impl.threshold }; }
  private now: () => number;
  private persist: boolean;
  /** what is running the model, for status text, e.g. "face-api, webgl" */
  backend = "";
  /** the last detect() results with the reasons behind each match; the Camera Debug overlay draws these */
  lastDebug: FaceHit[] = [];
  lastDetectMs = 0;

  constructor(o: FaceIdOptions = {}) {
    this.now = o.now ?? (() => Date.now());
    this.persist = o.store ?? true;
    this.matchOpts = o.match;
    this.impl = o.backend ?? FaceId.pickBackend();
    this.index = new IdentityIndex(this.opts());
    this.loadStore();
  }

  /** ?facebackend=<id> in the page address wins, then the saved choice, then face-api. */
  private static pickBackend(): FaceBackend {
    let want = "";
    try { want = new URLSearchParams(location.search).get("facebackend") || localStorage.getItem(BACKEND_KEY) || ""; } catch { /* no window */ }
    return (want && createBackend(want)) || createBackend("faceapi")!;
  }
  get backendId() { return this.impl.id; }
  static backends() { return availableBackends(); }
  /** Switch model. The enrolled fingerprints stay, but different models make different numbers, so people enrolled with one model may not match with another. */
  async setBackend(id: string): Promise<boolean> {
    const b = createBackend(id); if (!b) return false;
    this.impl = b; this.backend = ""; this.lastDebug = []; this.index = new IdentityIndex(this.opts());
    try { localStorage.setItem(BACKEND_KEY, id); } catch { /* ignore */ }
    return this.init();
  }

  get isReady() { return this.impl.isReady(); }
  knownNames(): string[] { return this.people.map((p) => p.name); }

  private loadStore() {
    if (!this.persist) return;
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) this.people = JSON.parse(raw); } catch { this.people = []; }
  }
  private saveStore() { if (!this.persist) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(this.people)); } catch { /* quota or no storage */ } }

  async init(): Promise<boolean> {
    const ok = await this.impl.init();
    this.backend = ok ? this.impl.info() : "";
    return ok;
  }

  /** Detect faces in a video/canvas element and match against enrolled people. */
  async detect(input: unknown): Promise<FaceHit[]> {
    if (!this.impl.isReady()) return [];
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    let raw: RawFace[]; try { raw = await this.impl.detect(input, { minScore: 0.45 }); } catch { return []; }
    const now = this.now(), hits: FaceHit[] = [];
    for (const r of raw) {
      const m = this.index.match(r.descriptor, this.people, now, r.box);
      if (m.name) this.index.confirm(m.name, now, r.box, m.distance);
      const ms = (typeof performance !== "undefined" ? performance.now() : 0) - t0;
      hits.push({
        name: m.name ?? "person", distance: m.distance, box: r.box,
        cx: 1 - (r.box.x + r.box.w / 2), // mirrored like the preview used elsewhere in the sandbox
        cy: r.box.y + r.box.h / 2, descriptor: r.descriptor, score: r.score,
        debug: { fingerprint: fingerprint(r.descriptor), reason: m.reason, threshold: m.threshold, candidates: m.candidates, backend: this.impl.id, ms, slack: m.threshold - this.index.base },
      });
    }
    this.lastDebug = hits; this.lastDetectMs = (typeof performance !== "undefined" ? performance.now() : 0) - t0;
    return hits;
  }

  /** Enrol / update a person from the current frame (largest face). Call several times from different angles. */
  async enroll(input: unknown, name: string): Promise<{ ok: boolean; message: string }> {
    const clean = name.trim().slice(0, 40);
    if (!clean) return { ok: false, message: "need a name" };
    if (!this.impl.isReady() && !(await this.init())) return { ok: false, message: "face model not available — check network once so models can cache" };
    try {
      const results = await this.impl.detect(input, { minScore: 0.4 });
      if (!results.length) return { ok: false, message: "no face found — face the camera with good light" };
      results.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
      this.addDescriptor(clean, results[0].descriptor);
      const n = this.people.find((p) => p.name.toLowerCase() === clean.toLowerCase())!.descriptors.length;
      return { ok: true, message: n < 3 ? `saved ${clean} (${n}/3 samples — a couple more angles helps)` : `saved ${clean} (${n} samples) — recognition ready` };
    } catch (e) { return { ok: false, message: `enrol failed: ${(e as Error).message}` }; }
  }

  /** Largest face in the picture right now (the person standing in front of the camera), or null. */
  async largest(input: unknown): Promise<FaceHit | null> {
    const hits = await this.detect(input);
    return hits.length ? hits.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0] : null;
  }

  /** Save one fingerprint under a name (new person or another angle of an existing one). */
  addDescriptor(name: string, desc: number[]) {
    const clean = name.trim().slice(0, 40); if (!clean) return;
    let person = this.people.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (!person) { person = { name: clean, descriptors: [], hits: 0, updatedAt: this.now() }; this.people.push(person); }
    person.descriptors.push(desc); if (person.descriptors.length > 10) person.descriptors = person.descriptors.slice(-10);
    person.hits++; person.updatedAt = this.now(); this.saveStore();
  }

  /** Give a person a new name (e.g. "Visitor 1" -> "Asha"). If the new name already exists, the two are merged. */
  rename(from: string, to: string) {
    const a = this.people.find((p) => p.name.toLowerCase() === from.toLowerCase()); if (!a) return;
    const b = this.people.find((p) => p !== a && p.name.toLowerCase() === to.toLowerCase());
    if (b) { b.descriptors = [...b.descriptors, ...a.descriptors].slice(-10); b.hits += a.hits; b.updatedAt = this.now(); this.people = this.people.filter((p) => p !== a); }
    else { a.name = to.trim().slice(0, 40); a.updatedAt = this.now(); }
    this.index.forget(from); this.saveStore();
  }

  forget(name?: string) {
    this.people = name ? this.people.filter((p) => p.name.toLowerCase() !== name.toLowerCase()) : [];
    this.index.forget(name); this.saveStore();
  }

  /** Continuous improvement: if a matched face is very confident, refresh the embedding (slow drift). */
  reinforce(name: string, descriptor: number[]) {
    const p = this.people.find((x) => x.name === name); if (!p) return;
    p.descriptors.push(descriptor); if (p.descriptors.length > 10) p.descriptors = p.descriptors.slice(-10);
    p.hits++; p.updatedAt = this.now(); this.saveStore();
  }
}
