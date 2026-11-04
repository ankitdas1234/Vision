import fs from "node:fs";
import type { ErrorKind, ProviderError } from "./errors";

const MINUTE = 60_000;
/** How long to avoid a model after a failure (0 / missing = don't remember). */
const COOLDOWN_MS: Partial<Record<ErrorKind, number>> = { quota: 60 * MINUTE, overloaded: 0.5 * MINUTE, network: 0.5 * MINUTE };
const DEFAULT_RATE_LIMIT_MS = MINUTE;
/** Broken setups: skip for the rest of this run (fixing the key/model then takes effect on restart). */
const SESSION_DISABLE: ErrorKind[] = ["auth", "not_found"];

export interface Candidate { provider: string; model: string }
export const keyOf = (c: Candidate) => `${c.provider}:${c.model}`;

/** Remembers which models recently failed so the router stops hammering them. Persisted best-effort. */
export class CooldownTracker {
  private until = new Map<string, number>();
  private disabled = new Map<string, string>();

  constructor(private file?: string) { this.load(); }

  remainingMs(c: Candidate) { return Math.max(0, (this.until.get(keyOf(c)) ?? 0) - Date.now()); }
  disabledReason(c: Candidate) { return this.disabled.get(keyOf(c)); }

  recordFailure(c: Candidate, err: ProviderError) {
    if (SESSION_DISABLE.includes(err.kind)) { this.disabled.set(keyOf(c), err.message); return; }
    const ms = err.kind === "rate_limit" ? (err.retryAfterMs ?? DEFAULT_RATE_LIMIT_MS) : COOLDOWN_MS[err.kind];
    if (!ms) return;
    this.until.set(keyOf(c), Date.now() + ms);
    this.save();
  }

  recordSuccess(c: Candidate) { if (this.until.delete(keyOf(c))) this.save(); }

  active() {
    const now = Date.now();
    return [...this.until].filter(([, t]) => t > now).map(([key, t]) => ({ key, remainingMs: t - now }));
  }
  disabledList() { return [...this.disabled].map(([key, reason]) => ({ key, reason })); }

  private load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8")) as { cooldowns?: Record<string, number> };
      const now = Date.now();
      for (const [k, t] of Object.entries(saved.cooldowns ?? {})) if (t > now) this.until.set(k, t);
    } catch { /* first run */ }
  }
  private save() {
    if (!this.file) return;
    try { fs.writeFileSync(this.file, JSON.stringify({ cooldowns: Object.fromEntries(this.until) })); } catch { /* a nicety, never fail a request */ }
  }
}
