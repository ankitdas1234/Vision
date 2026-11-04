// Decision log for the autonomous mind. One entry per choice: the state he was in, the RAW score parts of every
// action he could have picked (before any tuned weights), what he picked, how likely that pick was, and the reward
// that followed. The offline tuner (tuner.ts) replays these to find better score weights. Nothing here changes behaviour.

export interface MindTick {
  t: number;                                   // ms on the brain clock
  src: string;                                 // "scored" | "plan" | "commitment" ... only "scored" picks are used for tuning
  state: Record<string, number>;               // state vector at decision time
  chosen: string;
  pLog: number;                                // probability the logging policy gave the chosen action
  temp: number;                                // softmax temperature that was used
  actions: Record<string, Record<string, number>>; // action -> score part label -> raw value
  reward?: number;                             // filled in after the action finished
  next?: Record<string, number>;               // state vector after the action
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
export const roundRec = (o: Record<string, number>) => { const out: Record<string, number> = {}; for (const k of Object.keys(o)) if (Number.isFinite(o[k])) out[k] = r4(o[k]); return out; };

export class MindLog {
  ticks: MindTick[] = [];
  constructor(public max = 2000, private key = "vision.mindlog.v1", private persistLast = 300) {}
  /** Add a finished or pending tick (pending ones get reward/next later via finish()). */
  add(t: MindTick) { this.ticks.push(t); if (this.ticks.length > this.max) this.ticks.splice(0, this.ticks.length - this.max); }
  finish(t: MindTick, reward: number, next: Record<string, number>) {
    if (!Number.isFinite(reward)) return;
    t.reward = r4(reward); t.next = roundRec(next);
    if (this.ticks.length % 25 === 0) this.save();
  }
  clear() { this.ticks = []; this.save(); }
  count() { return { total: this.ticks.length, withReward: this.ticks.filter((x) => x.reward !== undefined).length, scored: this.ticks.filter((x) => x.src === "scored" && x.reward !== undefined).length }; }
  toJSONL(): string { return this.ticks.filter((x) => x.reward !== undefined).map((x) => JSON.stringify(x)).join("\n") + "\n"; }
  save() { try { if (typeof localStorage === "undefined") return; localStorage.setItem(this.key, JSON.stringify(this.ticks.filter((x) => x.reward !== undefined).slice(-this.persistLast))); } catch { /* storage full or blocked: the in-memory log still works */ } }
  load() { try { if (typeof localStorage === "undefined") return; const raw = localStorage.getItem(this.key); if (raw) this.ticks = (JSON.parse(raw) as MindTick[]).concat(this.ticks).slice(-this.max); } catch { /* ignore */ } }
}
