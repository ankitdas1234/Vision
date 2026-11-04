import { describe, it, expect } from "vitest";
import { FaceId } from "../../../simulation/autonomous/src/faceId";
import { ScriptedFaceBackend, availableBackends, createBackend, type RawFace } from "../../../simulation/autonomous/src/faceBackend";
import { IdentityIndex, cosineDist, fingerprint, type StoredPerson } from "../../../simulation/autonomous/src/faceMatch";
import { FaceBook, CONFIRM_FRAMES } from "../../../simulation/autonomous/src/faceBook";

// made-up 16-number fingerprints: a person is a base vector plus a little noise
function rand(seed: number) { let a = seed * 2654435761 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; }; }
const base = (seed: number, n = 64) => { const r = rand(seed); return Array.from({ length: n }, () => r()); };
/** a fingerprint at exactly cosine distance `d` from the person's base fingerprint (0 = identical) */
function vec(seed: number, d = 0, variant = 1): number[] {
  const b = base(seed), o0 = base(seed * 100 + variant);
  const nb = Math.hypot(...b), bh = b.map((x) => x / nb);
  const dp = o0.reduce((s, x, i) => s + x * bh[i], 0), o = o0.map((x, i) => x - dp * bh[i]), no = Math.hypot(...o), oh = o.map((x) => x / no);
  const cos = 1 - d, sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  return bh.map((x, i) => cos * x + sin * oh[i]);
}
const face = (d: number[], x = 0.4, y = 0.3, score = 0.9): RawFace => ({ box: { x, y, w: 0.2, h: 0.3 }, descriptor: d, score });
const video = { videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;
const person = (name: string, ds: number[][], at = 0): StoredPerson => ({ name, descriptors: ds, hits: 1, updatedAt: at });

describe("IdentityIndex", () => {
  it("caches each person's fingerprints and only rebuilds when that person changes", () => {
    const ix = new IdentityIndex(), a = person("A", [vec(1), vec(1, 0.05, 2)]), b = person("B", [vec(2)]);
    for (let i = 0; i < 20; i++) ix.match(vec(1, 0.05), [a, b], i * 100);
    expect(ix.cacheBuilds).toBe(2);
    a.descriptors.push(vec(1, 0.1, 3)); a.updatedAt = 5;
    ix.match(vec(1), [a, b], 3000); expect(ix.cacheBuilds).toBe(3);
  });
  it("names the right person and says nobody for a stranger", () => {
    const ix = new IdentityIndex(), ppl = [person("A", [vec(1)]), person("B", [vec(2)])];
    expect(ix.match(vec(1, 0.05), ppl, 0).name).toBe("A");
    const s = ix.match(vec(9), ppl, 0); expect(s.name).toBeNull(); expect(s.reason).toBe("none"); expect(s.candidates.length).toBe(2);
  });
  it("re-identification slack: a borderline face is accepted right after a confident sighting in the same spot, then the slack fades", () => {
    const ix = new IdentityIndex({ base: 0.1, extra: 0.1, tauMs: 1000 }), ppl = [person("A", [vec(1)])];
    const borderline = vec(1, 0.15); const dist = cosineDist(borderline, vec(1));
    expect(dist).toBeGreaterThan(0.1); expect(dist).toBeLessThan(0.2); // sanity: inside the slack band only
    const box = { x: 0.4, y: 0.3, w: 0.2, h: 0.3 };
    expect(ix.match(borderline, ppl, 0, box).name).toBeNull();            // never seen: strict
    ix.confirm("A", 0, box, 0.01);                                        // confidently seen at t=0
    const soon = ix.match(borderline, ppl, 100, box); expect(soon.name).toBe("A"); expect(soon.reason).toBe("recent");
    expect(ix.match(borderline, ppl, 20000, box).name).toBeNull();        // 20 s later the slack has decayed
    ix.confirm("A", 20000, box, 0.01);
    expect(ix.match(borderline, ppl, 20100, { x: 0.8, y: 0.6, w: 0.2, h: 0.3 }).name).toBeNull(); // a different place: strict again
  });
  it("a weak match does not refresh the re-id clock", () => {
    const ix = new IdentityIndex({ base: 0.4 }); ix.confirm("A", 0, { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, 0.01);
    ix.confirm("A", 9000, { x: 0.4, y: 0.3, w: 0.2, h: 0.3 }, 0.39);
    expect(ix.slack("A", 9000, { x: 0.4, y: 0.3, w: 0.2, h: 0.3 })).toBeLessThan(0.12 * Math.exp(-1) + 0.001);
  });
  it("fingerprint tags are stable and differ between faces", () => { expect(fingerprint(vec(1))).toBe(fingerprint(vec(1))); expect(fingerprint(vec(1))).not.toBe(fingerprint(vec(2))); });
});

describe("FaceId with injected frames (no camera, no model)", () => {
  const make = (frames: RawFace[][], t = { v: 1000 }) => { const be = new ScriptedFaceBackend(frames); return { be, t, id: new FaceId({ backend: be, store: false, now: () => t.v }) }; };
  it("does nothing until the backend is ready, reports failure honestly", async () => {
    const { be, id } = make([[face(vec(1))]]); expect(await id.detect(video)).toEqual([]);
    be.failInit = true; expect(await id.init()).toBe(false); expect(id.isReady).toBe(false);
  });
  it("enrols from a frame, then recognises that person with debug info", async () => {
    const { id } = make([[face(vec(1))], [face(vec(1, 0.04, 2))]]); await id.init();
    expect((await id.enroll(video, "Asha")).ok).toBe(true);
    const [h] = await id.detect(video);
    expect(h.name).toBe("Asha"); expect(h.debug?.reason).toBe("enrolled"); expect(h.debug?.candidates[0].name).toBe("Asha"); expect(h.debug?.backend).toBe("scripted");
    expect(id.lastDebug).toHaveLength(1);
  });
  it("mirrors cx like the preview and keeps the box un-mirrored", async () => {
    const { id } = make([[face(vec(1), 0.1, 0.2)]]); await id.init();
    const [h] = await id.detect(video); expect(h.cx).toBeCloseTo(1 - 0.2, 5); expect(h.box.x).toBe(0.1);
  });
  it("tells two people apart in one frame and ignores faces below the detector's score", async () => {
    const { id } = make([[face(vec(1, 0.05), 0.1), face(vec(2, 0.05), 0.6), face(vec(3), 0.3, 0.3, 0.2)]]); await id.init();
    id.addDescriptor("A", vec(1)); id.addDescriptor("B", vec(2));
    const hits = await id.detect(video); expect(hits.map((h) => h.name).sort()).toEqual(["A", "B"]);
  });
  it("a person who turns their head keeps their name for a moment (re-id), a stranger does not get it", async () => {
    const t = { v: 0 }; const turned = vec(1, 0.55);
    const { id } = make([[face(vec(1))], [face(turned)]], t); await id.init(); id.addDescriptor("A", vec(1));
    const first = await id.detect(video); expect(first[0].name).toBe("A");
    t.v = 500; const second = await id.detect(video);
    const d = cosineDist(turned, vec(1));
    expect(second[0].name).toBe(d <= 0.48 ? "A" : d <= 0.6 ? "A" : "person");
    if (d > 0.48 && d <= 0.6) expect(second[0].debug?.reason).toBe("recent");
  });
  it("rename merges, forget removes, and a stranger stays 'person'", async () => {
    const { id } = make([[face(vec(5))]]); await id.init(); id.addDescriptor("Visitor 1", vec(1)); id.rename("Visitor 1", "Asha");
    expect(id.knownNames()).toEqual(["Asha"]); id.forget("Asha"); expect(id.knownNames()).toEqual([]);
    expect((await id.detect(video))[0].name).toBe("person");
  });
  it("end to end: fake frames -> FaceId -> FaceBook starts a profile, then adds photos to the same one", async () => {
    const t = { v: 1000 }, d = vec(4);
    const { id } = make([[face(d)]], t); await id.init();
    const book = new FaceBook(); const bk = book as any;
    const fakeCanvas = (sharp: boolean) => ({ width: 0, height: 0, imageSmoothingQuality: "", getContext: () => ({ imageSmoothingQuality: "", drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (sharp ? (((i >> 2) % w) + Math.floor(i / 4 / w)) % 2 ? 255 : 0 : 128)) }) }), toDataURL: () => "data:image/jpeg;base64,fake" });
    bk.crop = fakeCanvas(true); bk.grey = fakeCanvas(true);
    book.enrol = (n, dd) => id.addDescriptor(n, dd); // senses.ts wires it the same way
    let created = 0; book.onNew = () => { created++; };
    const outcomes: string[] = [];
    for (let i = 0; i < CONFIRM_FRAMES + 2; i++) { t.v += 800; const [h] = await id.detect(video); outcomes.push(book.onFace(h.name, h.descriptor, h.box, video, t.v)); }
    expect(created).toBe(1); expect(outcomes).toContain("new");
    const profiles = book.profiles; expect(profiles).toHaveLength(1); expect(profiles[0].photos.length).toBeGreaterThanOrEqual(1);
  });
  it("backends are registered by name and swappable; unknown names are refused", async () => {
    expect(availableBackends()).toEqual(expect.arrayContaining(["faceapi", "scripted"]));
    expect(createBackend("nope")).toBeNull();
    const { id } = make([[face(vec(1))]]); expect(await id.setBackend("nope")).toBe(false);
    expect(await id.setBackend("scripted")).toBe(true); expect(id.backendId).toBe("scripted");
  });
});
