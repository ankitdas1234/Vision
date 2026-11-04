const registry = new Map();
export function registerBackend(id, make) { registry.set(id, make); }
export function availableBackends() { return [...registry.keys()]; }
export function createBackend(id) { const f = registry.get(id); return f ? f() : null; }
/** A backend that replays made-up frames. For tests and for trying the pipeline without a camera or models. */
export class ScriptedFaceBackend {
    id = "scripted";
    frames = [];
    calls = 0;
    failInit = false;
    ready = false;
    constructor(frames = []) { this.frames = frames; }
    push(...f) { this.frames.push(...f); return this; }
    info() { return "scripted frames"; }
    isReady() { return this.ready; }
    async init() { if (this.failInit)
        return false; this.ready = true; return true; }
    async detect(_input, o = {}) {
        this.calls++;
        const f = this.frames.length > 1 ? this.frames.shift() : (this.frames[0] ?? []); // the last frame repeats
        return f.filter((x) => x.score >= (o.minScore ?? 0));
    }
}
registerBackend("scripted", () => new ScriptedFaceBackend());
