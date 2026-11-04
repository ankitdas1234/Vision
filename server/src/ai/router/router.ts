import { CooldownTracker, keyOf, type Candidate } from "./cooldowns";
import { ERROR_LABELS, ProviderError } from "./errors";
import type { ImageInput, Provider } from "./providers";

export type Kind = "text" | "image";
export type Routing = Record<Kind, Candidate[]>;

export interface RouteResult { text: string; provider: string; model: string; fallbacks: string[] }

const MAX_QUICK_RETRY_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const label = (c: Candidate) => `${c.provider}/${c.model}`;

export class NoRouteError extends Error {}

export interface RouterDeps {
  routing: Routing;
  providers: Map<string, Provider>;
  cooldowns: CooldownTracker;
  log?: (msg: string) => void;
}

/**
 * Sends the prompt to the first configured model that is available and not cooling down. If it fails
 * (quota, rate limit, outage, ...) the next model is tried, silently. The caller only sees an error when
 * every model for that kind failed.
 */
export async function respond(kind: Kind, prompt: string, image: ImageInput | undefined, deps: RouterDeps): Promise<RouteResult> {
  const { routing, providers, cooldowns, log = () => {} } = deps;
  const eligible = (routing[kind] ?? []).filter((c) => {
    const p = providers.get(c.provider);
    return !!p && c.model && (kind !== "image" || p.vision);
  });
  if (eligible.length === 0) throw new NoRouteError(`No AI model is configured for "${kind}" requests`);

  const fallbacks: string[] = [];
  const tried = new Set<string>();
  // Pass 1 respects cooldowns. If that leaves nothing, pass 2 tries them anyway: a cooldown is a guess.
  for (const respectCooldowns of [true, false]) {
    for (const c of eligible) {
      const key = keyOf(c);
      if (tried.has(key) || cooldowns.disabledReason(c)) continue;
      if (respectCooldowns && cooldowns.remainingMs(c) > 0) continue;
      tried.add(key);
      try {
        const text = await generateWithQuickRetry(providers.get(c.provider)!, c, prompt, image, log);
        cooldowns.recordSuccess(c);
        return { text, provider: c.provider, model: c.model, fallbacks };
      } catch (e) {
        const failure = ProviderError.fromThrown(e);
        cooldowns.recordFailure(c, failure);
        fallbacks.push(`${label(c)} (${ERROR_LABELS[failure.kind]})`);
        log(`AI model ${label(c)} failed: ${ERROR_LABELS[failure.kind]} - ${failure.message}`);
      }
    }
  }
  throw new Error(`Every AI model for "${kind}" failed or is unavailable: ${fallbacks.join("; ")}`);
}

async function generateWithQuickRetry(p: Provider, c: Candidate, prompt: string, image: ImageInput | undefined, log: (m: string) => void) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await p.generate({ model: c.model, prompt, image });
    } catch (e) {
      const f = ProviderError.fromThrown(e);
      const quick = f.kind === "overloaded" || f.kind === "network" || (f.kind === "rate_limit" && (f.retryAfterMs ?? Infinity) <= MAX_QUICK_RETRY_MS);
      if (attempt < 2 && quick) { log(`AI model ${label(c)} blip, retrying once`); await sleep(f.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS); continue; }
      throw f;
    }
  }
}
