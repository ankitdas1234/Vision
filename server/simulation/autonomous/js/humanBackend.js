import { registerBackend } from "./faceBackend.js";
const HUMAN_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js";
const DESC_MODEL = "faceres.json";
const MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/human-models@3.0.4/models/";
function loadScript(src, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`))
            return resolve();
        const s = document.createElement("script");
        const t = setTimeout(() => reject(new Error("human script timeout")), timeoutMs);
        s.src = src;
        s.onload = () => { clearTimeout(t); resolve(); };
        s.onerror = () => { clearTimeout(t); reject(new Error("human script blocked or offline")); };
        document.head.appendChild(s);
    });
}
export class HumanBackend {
    id = "human";
    /** Cosine distance under which two FaceRes fingerprints count as the same person. Measured on 3 different people (0.49 to 0.57 apart) and on the
     *  same face under scale, shift, brightness and light blur (0.01 to 0.13): 0.30 sits between. Only 3 identities and synthetic variation, so treat it
     *  as a starting point and check it with Camera debug (override: ?facethr=0.3). */
    threshold = 0.3;
    human = null;
    ready = false;
    loading = null;
    be = "";
    model = DESC_MODEL;
    info() { return `human (blazeface + ${this.model.replace(/\.json$/, "")}${this.be ? ", " + this.be : ""})`; }
    isReady() { return this.ready; }
    init() {
        if (this.ready)
            return Promise.resolve(true);
        if (this.loading)
            return this.loading;
        this.loading = (async () => {
            try {
                await loadScript(HUMAN_URL);
                const H = window.Human;
                if (!H?.Human)
                    throw new Error("Human global missing");
                let last = null;
                for (const backend of ["webgl", "wasm", "cpu"]) {
                    try {
                        const model = (() => { try {
                            return new URLSearchParams(location.search).get("humanmodel") || DESC_MODEL;
                        }
                        catch {
                            return DESC_MODEL;
                        } })();
                        const useRes = /^faceres/.test(model);
                        this.model = model;
                        const h = new H.Human({
                            backend, modelBasePath: MODELS, debug: false, async: false, warmup: "none", cacheSensitivity: 0, // 0 = never skip frames: we already pace the calls ourselves
                            filter: { enabled: true },
                            face: { enabled: true, detector: { modelPath: "blazeface.json", maxDetected: 5, minConfidence: 0.4, rotation: false, return: false }, mesh: { enabled: false }, iris: { enabled: false }, description: useRes ? { enabled: true, modelPath: model } : { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, mobilefacenet: useRes ? { enabled: false } : { enabled: true, modelPath: model, skipFrames: 0, skipTime: 0 } },
                            body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false },
                        });
                        await h.load();
                        await h.tf.ready();
                        this.human = h;
                        this.be = h.tf.getBackend?.() ?? backend;
                        this.ready = true;
                        return true;
                    }
                    catch (e) {
                        last = e;
                    }
                }
                throw last ?? new Error("no usable tensorflow backend");
            }
            catch (e) {
                console.warn("[FaceId] human init failed:", e.message);
                this.ready = false;
                return false;
            }
            finally {
                this.loading = null;
            }
        })();
        return this.loading;
    }
    async detect(input, o = {}) {
        if (!this.ready || !this.human)
            return [];
        try {
            const res = await this.human.detect(input);
            const min = o.minScore ?? 0.45;
            return (res?.face ?? []).filter((f) => Array.isArray(f.embedding) && f.embedding.length > 0 && (f.score ?? f.boxScore ?? 1) >= min).map((f) => {
                const [x, y, w, h] = f.boxRaw;
                return { box: { x, y, w, h }, descriptor: Array.from(f.embedding), score: f.score ?? f.boxScore ?? 0 };
            });
        }
        catch {
            return [];
        }
    }
}
registerBackend("human", () => new HumanBackend());
