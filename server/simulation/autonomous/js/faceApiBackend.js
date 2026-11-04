import { registerBackend } from "./faceBackend.js";
const FACEAPI_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.js";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model";
function loadScript(src, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`))
            return resolve();
        const s = document.createElement("script");
        const t = setTimeout(() => reject(new Error("face-api script timeout")), timeoutMs);
        s.src = src;
        s.onload = () => { clearTimeout(t); resolve(); };
        s.onerror = () => { clearTimeout(t); reject(new Error("face-api script blocked or offline")); };
        document.head.appendChild(s);
    });
}
export class FaceApiBackend {
    id = "faceapi";
    ready = false;
    api = null;
    loading = null;
    tf = "";
    info() { return `face-api${this.tf ? ", " + this.tf : ""}`; }
    isReady() { return this.ready; }
    init() {
        if (this.ready)
            return Promise.resolve(true);
        if (this.loading)
            return this.loading;
        this.loading = (async () => {
            try {
                await loadScript(FACEAPI_URL);
                const fa = window.faceapi;
                if (!fa)
                    throw new Error("faceapi global missing");
                // Pick a tensorflow backend that really works here (webgl is fast, cpu works everywhere).
                const tf = fa.tf;
                if (tf?.setBackend)
                    for (const be of ["webgl", "cpu"]) {
                        try {
                            if (await tf.setBackend(be)) {
                                await tf.ready();
                                this.tf = be;
                                break;
                            }
                        }
                        catch { /* try the next one */ }
                    }
                await Promise.all([fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL), fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL), fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);
                this.api = fa;
                this.ready = true;
                return true;
            }
            catch (e) {
                console.warn("[FaceId] face-api init failed:", e.message);
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
        if (!this.ready || !this.api)
            return [];
        const el = input, fa = this.api;
        try {
            const opts = new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: o.minScore ?? 0.45 });
            const res = await fa.detectAllFaces(el, opts).withFaceLandmarks().withFaceDescriptors();
            const vw = el.videoWidth || el.width || 1, vh = el.videoHeight || el.height || 1;
            return (res ?? []).map((r) => ({ box: { x: r.detection.box.x / vw, y: r.detection.box.y / vh, w: r.detection.box.width / vw, h: r.detection.box.height / vh }, descriptor: Array.from(r.descriptor), score: r.detection.score ?? 0 }));
        }
        catch {
            return [];
        }
    }
}
registerBackend("faceapi", () => new FaceApiBackend());
