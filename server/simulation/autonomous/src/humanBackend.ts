// Second face backend: BlazeFace (MediaPipe's small face detector) + FaceRes (1024-number recognition net), run through
// @vladmandic/human on TensorFlow.js. Different model family from face-api, no separate landmark pass, falls back webgl -> wasm -> cpu.
// Registered as "human". Its fingerprints are a different space from face-api's, so it has its own threshold (see below).
// Tried and rejected: MobileFaceNet / MobileFace from the same package gave (near) constant fingerprints in testing, so every face looked alike.
import type { DetectOpts, FaceBackend, RawFace } from "./faceBackend.js";
import { registerBackend } from "./faceBackend.js";

const HUMAN_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js";
const DESC_MODEL = "faceres.json";
const MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/human-models@3.0.4/models/";

function loadScript(src: string, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script"); const t = setTimeout(() => reject(new Error("human script timeout")), timeoutMs);
    s.src = src; s.onload = () => { clearTimeout(t); resolve(); }; s.onerror = () => { clearTimeout(t); reject(new Error("human script blocked or offline")); };
    document.head.appendChild(s);
  });
}

export class HumanBackend implements FaceBackend {
  readonly id = "human";
  /** Cosine distance under which two FaceRes fingerprints count as the same person. Measured on 3 different people (0.49 to 0.57 apart) and on the
   *  same face under scale, shift, brightness and light blur (0.01 to 0.13): 0.30 sits between. Only 3 identities and synthetic variation, so treat it
   *  as a starting point and check it with Camera debug (override: ?facethr=0.3). */
  readonly threshold = 0.3;
  private human: any = null; private ready = false; private loading: Promise<boolean> | null = null; private be = "";
  private model = DESC_MODEL;
  info() { return `human (blazeface + ${this.model.replace(/\.json$/, "")}${this.be ? ", " + this.be : ""})`; }
  isReady() { return this.ready; }
  init(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        await loadScript(HUMAN_URL);
        const H = (window as any).Human; if (!H?.Human) throw new Error("Human global missing");
        let last: Error | null = null;
        for (const backend of ["webgl", "wasm", "cpu"]) {
          try {
            const model = (() => { try { return new URLSearchParams(location.search).get("humanmodel") || DESC_MODEL; } catch { return DESC_MODEL; } })();
            const useRes = /^faceres/.test(model); this.model = model;
            const h = new H.Human({
              backend, modelBasePath: MODELS, debug: false, async: false, warmup: "none", cacheSensitivity: 0, // 0 = never skip frames: we already pace the calls ourselves
              filter: { enabled: true },
              face: { enabled: true, detector: { modelPath: "blazeface.json", maxDetected: 5, minConfidence: 0.4, rotation: false, return: false }, mesh: { enabled: false }, iris: { enabled: false }, description: useRes ? { enabled: true, modelPath: model } : { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, mobilefacenet: useRes ? { enabled: false } : { enabled: true, modelPath: model, skipFrames: 0, skipTime: 0 } },
              body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false },
            });
            await h.load(); await h.tf.ready();
            this.human = h; this.be = h.tf.getBackend?.() ?? backend; this.ready = true; return true;
          } catch (e) { last = e as Error; }
        }
        throw last ?? new Error("no usable tensorflow backend");
      } catch (e) { console.warn("[FaceId] human init failed:", (e as Error).message); this.ready = false; return false; }
      finally { this.loading = null; }
    })();
    return this.loading;
  }
  async detect(input: unknown, o: DetectOpts = {}): Promise<RawFace[]> {
    if (!this.ready || !this.human) return [];
    try {
      const res = await this.human.detect(input as HTMLVideoElement | HTMLCanvasElement);
      const min = o.minScore ?? 0.45;
      return (res?.face ?? []).filter((f: any) => Array.isArray(f.embedding) && f.embedding.length > 0 && (f.score ?? f.boxScore ?? 1) >= min).map((f: any) => {
        const [x, y, w, h] = f.boxRaw as number[];
        return { box: { x, y, w, h }, descriptor: Array.from(f.embedding as ArrayLike<number>), score: f.score ?? f.boxScore ?? 0 };
      });
    } catch { return []; }
  }
}
registerBackend("human", () => new HumanBackend());
