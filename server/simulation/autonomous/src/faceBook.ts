/**
 * Face book: a profile (name + a few good photos) for every person the camera has seen. Simulation only, kept in this browser.
 *
 * - The first time an unknown face is seen clearly for ~1.5 s, a profile "Visitor N" is created at once with a photo.
 * - Every later sighting adds a fresh photo now and then (the sharpest 8 are kept), so the profile gets better with use.
 * - Telling Vision your name renames the visitor profile instead of making a duplicate.
 * Photos are small square face crops (160 px JPEG); blurry frames are rejected.
 */
export interface Photo { at: number; jpg: string; sharp: number }
export interface Profile { id: string; name: string; visitor: boolean; photos: Photo[]; firstSeen: number; lastSeen: number; seen: number }
export interface FaceBox { x: number; y: number; w: number; h: number }

const KEY = "vision.faceBook.v1";
export const MAX_PHOTOS = 8, MAX_PROFILES = 12, MIN_SHARP = 8, MIN_FACE = 0.09, PHOTO_EVERY_MS = 20000, CONFIRM_FRAMES = 2, CANDIDATE_MS = 12000, SAME_FACE = 0.4;

function cosDist(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/** Variance of a 3x3 Laplacian over a grey picture: high = crisp edges, low = blurry. Exported for tests. */
export function sharpness(gray: Uint8Array | number[], w: number, h: number): number {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    sum += l; sum2 += l * l; n++;
  }
  if (!n) return 0;
  const m = sum / n; return sum2 / n - m * m;
}

/** Square crop (with margin) around a face box, clamped to the picture. All numbers in the same units. Exported for tests. */
export function cropRect(box: FaceBox, vw: number, vh: number, margin = 0.45) {
  const cx = (box.x + box.w / 2) * vw, cy = (box.y + box.h / 2) * vh;
  let side = Math.max(box.w * vw, box.h * vh) * (1 + margin * 2);
  side = Math.min(side, vw, vh);
  const x = Math.max(0, Math.min(vw - side, cx - side / 2)), y = Math.max(0, Math.min(vh - side, cy - side / 2));
  return { x, y, side };
}

export class FaceBook {
  profiles: Profile[] = [];
  onChange?: () => void;
  /** a brand-new visitor was just photographed */
  onNew?: (p: Profile, photo: Photo) => void;
  /** a photo was added to an existing profile */
  onPhoto?: (p: Profile, photo: Photo) => void;
  /** a visitor profile was enrolled in the face recogniser under this name */
  enrol?: (name: string, descriptor: number[]) => void;
  private crop = typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement);
  private grey = typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement);
  private cands: { n: number; at: number; desc: number[] }[] = [];
  private lastPhoto = new Map<string, number>();
  private visitorCounter = 0;

  constructor() { this.load(); }

  private load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); this.profiles = Array.isArray(d.profiles) ? d.profiles : []; this.visitorCounter = Number(d.counter) || this.profiles.length; } } catch { this.profiles = []; }
  }
  private save() {
    const put = () => localStorage.setItem(KEY, JSON.stringify({ profiles: this.profiles, counter: this.visitorCounter }));
    if (typeof localStorage === "undefined") { this.onChange?.(); return; }
    try { put(); } catch {
      // storage full: drop the oldest photo of the biggest profile and retry once
      const big = [...this.profiles].sort((a, b) => b.photos.length - a.photos.length)[0]; big?.photos.shift();
      try { put(); } catch { /* give up quietly */ }
    }
    this.onChange?.();
  }

  find(name: string) { return this.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase()); }
  byId(id: string) { return this.profiles.find((p) => p.id === id); }

  /** Cut a face photo out of the live video. Returns null if the face is too small or too blurry. */
  takePhoto(video: HTMLVideoElement, box: FaceBox): Photo | null {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh || box.w < MIN_FACE) return null;
    const r = cropRect(box, vw, vh);
    const out = 160; this.crop.width = out; this.crop.height = out;
    const g = this.crop.getContext("2d"); if (!g) return null;
    g.imageSmoothingQuality = "high";
    g.drawImage(video, r.x, r.y, r.side, r.side, 0, 0, out, out);
    const gs = 64; this.grey.width = gs; this.grey.height = gs;
    const g2 = this.grey.getContext("2d", { willReadFrequently: true }); if (!g2) return null;
    g2.drawImage(this.crop, 0, 0, gs, gs);
    const px = g2.getImageData(0, 0, gs, gs).data, gray = new Uint8Array(gs * gs);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    const sharp = sharpness(gray, gs, gs);
    if (sharp < MIN_SHARP) return null;
    return { at: Date.now(), jpg: this.crop.toDataURL("image/jpeg", 0.85), sharp: Math.round(sharp) };
  }

  private addPhoto(p: Profile, photo: Photo): boolean {
    if (p.photos.length < MAX_PHOTOS) p.photos.push(photo);
    else {
      let wi = 0; p.photos.forEach((x, i) => { if (x.sharp < p.photos[wi].sharp) wi = i; });
      if (photo.sharp <= p.photos[wi].sharp) return false;         // not better than the worst one we already keep
      p.photos[wi] = photo;
    }
    this.lastPhoto.set(p.id, performance.now());
    return true;
  }

  ensure(name: string, visitor = false): Profile {
    let p = this.find(name);
    if (!p) {
      if (this.profiles.length >= MAX_PROFILES) { const old = [...this.profiles].sort((a, b) => a.lastSeen - b.lastSeen)[0]; this.profiles = this.profiles.filter((x) => x !== old); }
      p = { id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, visitor, photos: [], firstSeen: Date.now(), lastSeen: Date.now(), seen: 0 };
      this.profiles.push(p);
    }
    return p;
  }

  /**
   * Called for every face the recogniser sees. `name` is "person" when it is not recognised.
   * Returns what happened, so the caller can say something ("new" = a visitor was just photographed).
   */
  onFace(name: string, descriptor: number[], box: FaceBox, video: HTMLVideoElement, nowMs = performance.now()): "new" | "photo" | "seen" | "wait" {
    if (name !== "person") {
      const p = this.find(name) ?? this.ensure(name, false);
      p.seen++; p.lastSeen = Date.now();
      const due = p.photos.length === 0 || nowMs - (this.lastPhoto.get(p.id) ?? 0) >= PHOTO_EVERY_MS;
      if (due) {
        const ph = this.takePhoto(video, box);
        if (ph && this.addPhoto(p, ph)) { this.save(); this.onPhoto?.(p, ph); return "photo"; }
      }
      return "seen";
    }
    // unknown face: wait until the SAME face has been there for a couple of looks, so a flicker doesn't create a person.
    // Several unknown faces can be waiting at once (a group in front of the camera); each is told apart by its fingerprint.
    if (box.w < MIN_FACE) return "wait";
    this.cands = this.cands.filter((c) => nowMs - c.at <= CANDIDATE_MS);
    let cand = this.cands.find((c) => cosDist(c.desc, descriptor) < SAME_FACE);
    if (!cand) { cand = { n: 0, at: nowMs, desc: descriptor }; this.cands.push(cand); if (this.cands.length > 6) this.cands.shift(); }
    cand.n++; cand.at = nowMs; cand.desc = descriptor;
    if (cand.n < CONFIRM_FRAMES) return "wait";
    const ph = this.takePhoto(video, box);
    if (!ph) return "wait";                                        // blurry: try again on the next look
    this.cands = this.cands.filter((c) => c !== cand);
    const name2 = `Visitor ${++this.visitorCounter}`;
    const p = this.ensure(name2, true);
    p.seen = 1; this.addPhoto(p, ph); this.save();
    this.enrol?.(name2, descriptor);
    this.onNew?.(p, ph);
    return "new";
  }

  /** Photograph the person in front of the camera right now and file it under `name` (used by "my name is ..." and the Snap button). */
  snapInto(name: string, video: HTMLVideoElement, box: FaceBox, mergeFrom?: string): Photo | null {
    if (mergeFrom && mergeFrom.toLowerCase() !== name.toLowerCase()) this.rename(mergeFrom, name, false);
    const p = this.ensure(name, false);
    p.visitor = false; p.lastSeen = Date.now(); p.seen++;
    const ph = this.takePhoto(video, box);
    if (ph) this.addPhoto(p, ph);
    this.save();
    return ph;
  }

  rename(id: string, to: string, byId = true): boolean {
    const a = byId ? this.byId(id) : this.find(id); const clean = to.trim().slice(0, 40);
    if (!a || !clean) return false;
    const b = this.find(clean);
    if (b && b !== a) { b.photos = [...b.photos, ...a.photos].sort((x, y) => y.sharp - x.sharp).slice(0, MAX_PHOTOS); b.seen += a.seen; b.visitor = false; this.profiles = this.profiles.filter((p) => p !== a); }
    else { a.name = clean; a.visitor = false; }
    this.save(); return true;
  }

  remove(id: string) { const n = this.profiles.length; this.profiles = this.profiles.filter((p) => p.id !== id); if (this.profiles.length !== n) this.save(); return this.profiles.length !== n; }
  clear() { this.profiles = []; this.cands = []; this.save(); }
}
