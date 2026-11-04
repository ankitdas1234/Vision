import { describe, it, expect, vi } from "vitest";
import { FaceBook, sharpness, cropRect, MAX_PHOTOS, CONFIRM_FRAMES } from "../../../simulation/autonomous/src/faceBook";

const video = { videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;
const box = { x: 0.4, y: 0.3, w: 0.2, h: 0.3 };
const photo = (sharp: number, at = Date.now()) => ({ at, jpg: "data:image/jpeg;base64,xx", sharp });

describe("sharpness", () => {
  it("a flat picture is 0 and a checkerboard is much sharper than a gentle ramp", () => {
    const flat = new Uint8Array(64 * 64).fill(120);
    const ramp = new Uint8Array(64 * 64).map((_, i) => (i % 64) * 2);
    const checker = new Uint8Array(64 * 64).map((_, i) => ((i % 64) + Math.floor(i / 64)) % 2 ? 255 : 0);
    expect(sharpness(flat, 64, 64)).toBe(0);
    expect(sharpness(checker, 64, 64)).toBeGreaterThan(sharpness(ramp, 64, 64) * 100);
  });
});

describe("cropRect", () => {
  it("is square, centred on the face and stays inside the picture", () => {
    const r = cropRect(box, 1280, 720);
    expect(r.side).toBeGreaterThan(0.3 * 720);
    expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.side).toBeLessThanOrEqual(1280); expect(r.y + r.side).toBeLessThanOrEqual(720);
  });
  it("clamps a face at the very edge", () => {
    const r = cropRect({ x: 0.95, y: 0.9, w: 0.1, h: 0.2 }, 1280, 720);
    expect(r.x + r.side).toBeLessThanOrEqual(1280); expect(r.y + r.side).toBeLessThanOrEqual(720);
  });
});

describe("FaceBook", () => {
  const mk = () => { const b = new FaceBook(); vi.spyOn(b, "takePhoto").mockImplementation(() => photo(40)); return b; };

  it("makes a visitor profile with a photo after the face has been there for a couple of frames, not before", () => {
    const b = mk(); const made: string[] = []; b.onNew = (p) => made.push(p.name); const enrolled: string[] = [];
    b.enrol = (n) => enrolled.push(n);
    expect(b.onFace("person", [1, 2], box, video, 1000)).toBe("wait");
    expect(b.profiles).toHaveLength(0);
    for (let i = 1; i < CONFIRM_FRAMES; i++) expect(b.onFace("person", [1, 2], box, video, 1000 + i * 800)).toBe("new");
    expect(made).toEqual(["Visitor 1"]); expect(enrolled).toEqual(["Visitor 1"]);
    expect(b.profiles[0].photos).toHaveLength(1); expect(b.profiles[0].visitor).toBe(true);
  });
  it("a face that flickers (gaps over 3.5 s) never becomes a person", () => {
    const b = mk();
    b.onFace("person", [1], box, video, 1000); b.onFace("person", [1], box, video, 30000);
    expect(b.profiles).toHaveLength(0);
  });
  it("two different unknown faces at once each get their own profile; the same face twice does not", () => {
    const b = mk(); const A = [1, 0, 0, 0], B = [0, 1, 0, 0];
    for (const t of [1000, 2500]) { b.onFace("person", A, box, video, t); b.onFace("person", B, box, video, t + 10); }
    expect(b.profiles.map((p) => p.name)).toEqual(["Visitor 1", "Visitor 2"]);
  });
  it("a slow machine (one look every 2.5 s) still gets there", () => {
    const b = mk(); b.onFace("person", [1], box, video, 1000); expect(b.onFace("person", [1], box, video, 3500)).toBe("new");
  });
  it("a tiny or blurry face is ignored", () => {
    const b = mk(); expect(b.onFace("person", [1], { x: 0.5, y: 0.5, w: 0.03, h: 0.04 }, video, 1000)).toBe("wait");
    (b.takePhoto as any).mockImplementation(() => null);
    b.onFace("person", [1], box, video, 2000); expect(b.onFace("person", [1], box, video, 2800)).toBe("wait");
    expect(b.profiles).toHaveLength(0);
  });
  it("a known person gets a photo straight away, then one every 20 s at most", () => {
    const b = mk(); b.ensure("Asha");
    expect(b.onFace("Asha", [1], box, video, 1000)).toBe("photo");
    expect(b.onFace("Asha", [1], box, video, 5000)).toBe("seen");
    expect(b.onFace("Asha", [1], box, video, 22000)).toBe("photo");
    expect(b.find("Asha")!.photos).toHaveLength(2);
  });
  it("keeps only the 8 sharpest photos", () => {
    const b = new FaceBook(); let s = 10; vi.spyOn(b, "takePhoto").mockImplementation(() => photo(s));
    b.ensure("Asha"); let t = 0;
    for (let i = 0; i < 12; i++) { s = 10 + i * 5; b.onFace("Asha", [1], box, video, (t += 21000)); }
    const ph = b.find("Asha")!.photos;
    expect(ph).toHaveLength(MAX_PHOTOS);
    expect(Math.min(...ph.map((x) => x.sharp))).toBeGreaterThanOrEqual(10 + 4 * 5);
  });
  it("telling Vision a name renames the visitor profile instead of adding a duplicate", () => {
    const b = mk(); b.onFace("person", [1], box, video, 1000); b.onFace("person", [1], box, video, 1800);
    expect(b.profiles.map((p) => p.name)).toEqual(["Visitor 1"]);
    b.snapInto("Asha", video, box, "Visitor 1");
    expect(b.profiles.map((p) => p.name)).toEqual(["Asha"]);
    expect(b.profiles[0].visitor).toBe(false);
    expect(b.profiles[0].photos.length).toBeGreaterThanOrEqual(2);
  });
  it("renaming onto an existing name merges photos", () => {
    const b = mk(); b.ensure("A").photos.push(photo(30)); b.ensure("B").photos.push(photo(50));
    expect(b.rename(b.find("A")!.id, "B")).toBe(true);
    expect(b.profiles).toHaveLength(1); expect(b.profiles[0].photos).toHaveLength(2);
  });
  it("visitor numbers keep counting up", () => {
    const b = mk();
    for (const t of [1000, 20000]) { b.onFace("person", [1], box, video, t); b.onFace("person", [1], box, video, t + 800); }
    expect(b.profiles.map((p) => p.name)).toEqual(["Visitor 1", "Visitor 2"]);
  });
  it("remove and clear work", () => {
    const b = mk(); b.ensure("A"); b.ensure("B"); b.remove(b.find("A")!.id); expect(b.profiles).toHaveLength(1); b.clear(); expect(b.profiles).toHaveLength(0);
  });
});
