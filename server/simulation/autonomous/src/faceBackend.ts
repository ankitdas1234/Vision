// Face backends: anything that can turn a picture into faces (box + 128/512-number fingerprint).
// FaceId only talks to this interface, so the model can be swapped without touching matching, photos or profiles.
import type { FaceBox } from "./faceMatch.js";

export interface RawFace { box: FaceBox /* 0..1 of the picture, NOT mirrored */; descriptor: number[]; score: number }
export interface DetectOpts { minScore?: number }
export interface FaceBackend {
  readonly id: string;
  /** optional: cosine distance under which two fingerprints from this model are the same person (default 0.48, tuned for face-api) */
  readonly threshold?: number;
  /** one line for the status text, e.g. "face-api, webgl" */
  info(): string;
  init(): Promise<boolean>;
  isReady(): boolean;
  detect(input: unknown, o?: DetectOpts): Promise<RawFace[]>;
}

const registry = new Map<string, () => FaceBackend>();
export function registerBackend(id: string, make: () => FaceBackend) { registry.set(id, make); }
export function availableBackends(): string[] { return [...registry.keys()]; }
export function createBackend(id: string): FaceBackend | null { const f = registry.get(id); return f ? f() : null; }

/** A backend that replays made-up frames. For tests and for trying the pipeline without a camera or models. */
export class ScriptedFaceBackend implements FaceBackend {
  readonly id = "scripted";
  frames: RawFace[][] = [];
  calls = 0; failInit = false; private ready = false;
  constructor(frames: RawFace[][] = []) { this.frames = frames; }
  push(...f: RawFace[][]) { this.frames.push(...f); return this; }
  info() { return "scripted frames"; }
  isReady() { return this.ready; }
  async init() { if (this.failInit) return false; this.ready = true; return true; }
  async detect(_input: unknown, o: DetectOpts = {}): Promise<RawFace[]> {
    this.calls++; const f = this.frames.length > 1 ? this.frames.shift()! : (this.frames[0] ?? []); // the last frame repeats
    return f.filter((x) => x.score >= (o.minScore ?? 0));
  }
}
registerBackend("scripted", () => new ScriptedFaceBackend());
